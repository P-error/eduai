import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as createCollectionRoute } from "../src/app/api/collections/route";
import { POST as createSubjectRoute } from "../src/app/api/subjects/route";
import {
  GET as getPreferencesRoute,
  PATCH as updatePreferencesRoute,
} from "../src/app/api/users/me/preferences/route";
import { POST as submitTestRoute } from "../src/app/api/tests/[id]/submit/route";
import {
  STRUCTURED_EVALUATION_PROTOCOL_KEY,
  buildEvaluationAssignment,
  buildEvaluationItemMeta,
  registerEvaluationEpisodeItem,
  resolveEvaluationPolicySelection,
} from "@/lib/evaluation";
import { generateLearningContentForEpisode } from "@/lib/learning-content-generation";
import { readSixFactorDeliveredConfigMetadata } from "@/lib/ml-six-factor-decision-metadata";
import { isMlSixFactorConfig } from "@/lib/ml-six-factor-decision-metadata";
import { getUserPresetForChat } from "@/lib/recommendation";
import { ensureTagLegend } from "@/lib/tag-seed";
import { TAGS_BY_AXIS } from "@/lib/tags";

type CliOptions = {
  out: string;
  artifact: string;
  seed: number;
  mockContent: boolean;
};

type RouteResult = {
  status: number;
  json: Record<string, unknown>;
  setCookie: string | null;
};

const DEFAULT_OUT =
  "exports/full_user_journey_e2e_real_user_training_observations.jsonl";
const REQUIRED_FACTOR_KEYS = [
  "difficulty",
  "depth",
  "support_level",
  "presentation_format",
  "examples_level",
  "terminology_level",
] as const;
const FORBIDDEN_FEATURE_FIELDS = [
  "pre_score",
  "post_score",
  "max_score",
  "next_step_success",
  "normalized_learning_gain",
  "outcome",
  "outcome_available",
  "postScore",
  "nextStepSuccess",
  "normalizedLearningGain",
] as const;

class DbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbUnavailableError";
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    out: DEFAULT_OUT,
    artifact: "ml/examples/candidate_scorer_artifact.example.json",
    seed: 42,
    mockContent: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[index + 1] ?? options.out;
      index += 1;
    } else if (arg === "--artifact") {
      options.artifact = argv[index + 1] ?? options.artifact;
      index += 1;
    } else if (arg === "--seed") {
      const parsed = Number(argv[index + 1]);
      options.seed = Number.isFinite(parsed) ? Math.floor(parsed) : options.seed;
      index += 1;
    } else if (arg === "--mock-content") {
      options.mockContent = true;
    } else if (arg === "--live-content") {
      throw new Error(
        "LIVE_CONTENT_NOT_IMPLEMENTED: this regression uses deterministic mock/fallback content and does not call external LLM/API.",
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function timestampForRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .toLowerCase();
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertJourney(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`JOURNEY_ASSERTION_FAILED: ${message}`);
  }
}

function isDbUnavailable(error: unknown) {
  const root = asRecord(error);
  const code = typeof root.code === "string" ? root.code : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    error instanceof DbUnavailableError ||
    code === "P1001" ||
    code === "P2021" ||
    code === "P2022" ||
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED") ||
    message.includes("DATABASE_URL")
  );
}

async function ensureDbReady(prisma: PrismaClient) {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    throw new DbUnavailableError("DATABASE_URL is not set.");
  }
  await prisma.$connect();
  await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.collection.count(),
    prisma.chatSession.count(),
    prisma.chatMessage.count(),
    prisma.generatedTest.count(),
    prisma.testAttempt.count(),
    prisma.evaluationEpisode.count(),
    prisma.evaluationEpisodeItem.count(),
  ]);
}

function buildJsonRequest(params: {
  url: string;
  body?: unknown;
  cookie?: string | null;
  ipSuffix: string;
}) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": `127.0.0.${params.ipSuffix}`,
  });
  if (params.cookie) headers.set("cookie", params.cookie);

  return new Request(params.url, {
    method: "POST",
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
}

async function readRouteResponse(response: Response): Promise<RouteResult> {
  const json = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    json,
    setCookie: response.headers.get("set-cookie"),
  };
}

function cookieFromSetCookie(setCookie: string | null) {
  if (!setCookie) return null;
  return setCookie.split(";")[0] ?? null;
}

async function callPostRoute(params: {
  handler: (request: Request) => Promise<Response>;
  url: string;
  body?: unknown;
  cookie?: string | null;
  ipSuffix: string;
}) {
  return readRouteResponse(
    await params.handler(
      buildJsonRequest({
        url: params.url,
        body: params.body,
        cookie: params.cookie,
        ipSuffix: params.ipSuffix,
      }),
    ),
  );
}

function parseJsonFromStdout(stdout: string) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Could not parse JSON from stdout: ${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
}

function parseJsonl(filePath: string) {
  if (!existsSync(filePath)) {
    throw new Error(`JSONL file is missing: ${filePath}`);
  }
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function runExport(params: { outPath: string; datasetOriginPrefix: string }) {
  mkdirSync(path.dirname(params.outPath), { recursive: true });
  const result = spawnSync(
    "bash",
    [
      "scripts/export-real-user-training-observations.sh",
      "--out",
      params.outPath,
      "--limit",
      "1000",
      "--include-outcome-missing",
      "--dataset-origin-prefix",
      params.datasetOriginPrefix,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      ["FULL_JOURNEY_EXPORT_FAILED", result.stdout.trim(), result.stderr.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return parseJsonFromStdout(result.stdout);
}

function runValidation(outPath: string) {
  const pythonPath = existsSync("ml/.venv/bin/python")
    ? "ml/.venv/bin/python"
    : "python";
  const result = spawnSync(
    pythonPath,
    ["ml/scripts/validate_dataset.py", "--input", outPath],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );

  return {
    ok: result.status === 0,
    command: `${pythonPath} ml/scripts/validate_dataset.py --input ${outPath}`,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function hasAllSixFactors(value: unknown) {
  const record = asRecord(value);
  return REQUIRED_FACTOR_KEYS.every((key) => key in record) && isMlSixFactorConfig(record);
}

function containsForbiddenOutcomeFeature(features: unknown) {
  const record = asRecord(features);
  return FORBIDDEN_FEATURE_FIELDS.some((field) => field in record);
}

function readDeliveredMetadataFromSessionMessage(message: {
  signalsJson: Prisma.JsonValue | null;
}) {
  const metadata = readSixFactorDeliveredConfigMetadata(message.signalsJson);
  assertJourney(metadata, "session message must include sixFactorDeliveredConfig");
  return metadata;
}

function makeAssignmentPlan(params: {
  policyId: string;
  runtimePolicyId: string;
  backendKind: string;
  difficulty: string;
  depth: string;
  tone: string;
  explanationStyle: string;
}) {
  const selection = resolveEvaluationPolicySelection({
    surface: "chat",
    requestedArm: "predicted",
    personalizationMode: "on",
  });
  const assignment = buildEvaluationAssignment({
    selection,
    runtimePolicyId: params.runtimePolicyId,
    backendKind: params.backendKind,
    backendId: "full_user_journey_e2e",
  });

  return {
    personalizationMode: "on" as const,
    assignment,
    policyMode: assignment.policyMode,
    policyId: params.policyId,
    pedagogicalDecision: {
      difficulty: params.difficulty,
      depth: params.depth,
    },
    renderingDecision: {
      tone: params.tone,
      explanation_style: params.explanationStyle,
      response_format: "mcq" as const,
    },
    renderingRules: {
      id: "full_user_journey_e2e_rules_v1",
      basis: "controlled_api_db_e2e",
    },
  };
}

async function createControlledPostcheck(params: {
  prisma: PrismaClient;
  userId: string;
  subjectId: string;
  episodeId: string;
  linkedContentId: string;
  topic: string;
  conceptKey: string;
  skillKey: string;
  familyKey: string;
  runId: string;
}) {
  await ensureTagLegend();
  const axes = await params.prisma.tagAxis.findMany({ include: { tags: true } });
  const axisMap = new Map(axes.map((axis) => [axis.key, axis]));
  const tagSpecByQuestion = [
    {
      tone: "friendly",
      explanation_style: "stepwise",
      response_format: "mcq",
      difficulty_target: "medium",
      cognitive_process: "apply",
      task_family: "problem_solving",
      context: "real_world",
    },
    {
      tone: "friendly",
      explanation_style: "stepwise",
      response_format: "mcq",
      difficulty_target: "medium",
      cognitive_process: "apply",
      task_family: "comparison",
      context: "real_world",
    },
    {
      tone: "friendly",
      explanation_style: "stepwise",
      response_format: "mcq",
      difficulty_target: "medium",
      cognitive_process: "analyze",
      task_family: "problem_solving",
      context: "abstract",
    },
    {
      tone: "friendly",
      explanation_style: "stepwise",
      response_format: "mcq",
      difficulty_target: "hard",
      cognitive_process: "analyze",
      task_family: "comparison",
      context: "abstract",
    },
  ] satisfies Array<Record<keyof typeof TAGS_BY_AXIS, string>>;

  const postSelection = resolveEvaluationPolicySelection({
    surface: "test",
    requestedArm: "predicted",
    personalizationMode: "on",
  });
  const postAssignment = buildEvaluationAssignment({
    selection: postSelection,
    runtimePolicyId: "full_user_journey_e2e_postcheck",
    backendKind: "controlled_mock",
    backendId: "full_user_journey_e2e",
  });
  const requested = {
    episodeId: params.episodeId,
    protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
    touchpointType: "post_check" as const,
    sequenceRole: "postcheck" as const,
    itemRole: "evaluation" as const,
    itemVariant: "isomorphic_same_skill" as const,
    linkageKind: "isomorphic_family_of" as const,
    linkedContentId: params.linkedContentId,
    assignmentArm: "predicted" as const,
    conceptKey: params.conceptKey,
    skillKey: params.skillKey,
    familyKey: params.familyKey,
    holdoutStrategy: "isomorphic_same_skill" as const,
  };
  const evaluation = buildEvaluationItemMeta({
    episodeId: params.episodeId,
    assignment: postAssignment,
    requested,
    contentKind: "generated_test",
    signalQuality: "primary_test",
    protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
    topic: params.topic,
    subjectId: params.subjectId,
    pedagogicalDecision: {
      difficulty: "medium",
      depth: "standard",
    },
    runtimePolicyId: postAssignment.runtimePolicyId,
    backendKind: postAssignment.backendKind,
    backendId: postAssignment.backendId,
  });

  const questions = tagSpecByQuestion.map((_, index) => ({
    prompt: `Controlled full-journey question ${index + 1} for ${params.topic}.`,
    options: ["A", "B", "C", "D"],
    answerIndex: index === 3 ? 2 : 0,
    explanation: "Controlled answer for full-user-journey E2E.",
  }));

  const test = await params.prisma.generatedTest.create({
    data: {
      userId: params.userId,
      subjectId: params.subjectId,
      evaluationEpisodeId: params.episodeId,
      llmModel: "deterministic_mock_full_journey",
      promptTemplateKey: "full_user_journey_e2e_postcheck",
      validationMetaJson: toJsonValue({
        schemaVersion: 2,
        fullJourneyRunId: params.runId,
        generationSource: "controlled_mock",
        taggingSource: "controlled_manual",
        fallback: false,
        taggingFallback: false,
        learningEligible: true,
        learningExcludedReason: null,
        renderingDecision: { response_format: "mcq" },
        evaluation,
      }),
      topic: params.topic,
      questionCount: questions.length,
      mode: "quiz",
      questionsJson: toJsonValue(questions),
      profileSnapshotJson: toJsonValue({ fullJourneyRunId: params.runId }),
    },
    select: { id: true },
  });

  const assignments = tagSpecByQuestion.flatMap((tags, questionIndex) => {
    return Object.entries(tags).map(([axisKey, tagKey]) => {
      const axis = axisMap.get(axisKey);
      const tag = axis?.tags.find((entry) => entry.key === tagKey);
      assertJourney(axis && tag, `missing tag ${axisKey}:${tagKey}`);
      return {
        testId: test.id,
        questionIndex,
        axisId: axis.id,
        tagId: tag.id,
      };
    });
  });
  await params.prisma.tagAssignment.createMany({ data: assignments });
  await registerEvaluationEpisodeItem({
    prisma: params.prisma,
    item: evaluation,
    contentId: test.id,
  });

  return { id: test.id, questionCount: questions.length };
}

async function loadAssistantMessageMetadata(params: {
  prisma: PrismaClient;
  sessionId: string;
}) {
  const message = await params.prisma.chatMessage.findFirst({
    where: { sessionId: params.sessionId, role: "assistant" },
    orderBy: { createdAt: "asc" },
    select: { id: true, content: true, signalsJson: true, createdAt: true },
  });
  assertJourney(message, "assistant message must be stored");
  const deliveredMetadata = readDeliveredMetadataFromSessionMessage(message);
  return { message, deliveredMetadata };
}

function compareFeatureSnapshots(first: unknown, second: unknown) {
  const left = asRecord(first);
  const right = asRecord(second);
  const fields = [
    "priorAttemptsCount",
    "priorCorrectRate",
    "recentCorrectRate",
    "recentAttemptsCount",
    "topicSeenCount",
    "minutesSinceLastActivity",
    "sessionPosition",
    "previousDifficulty",
    "previousDepth",
  ];
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        first: left[field] ?? null,
        second: right[field] ?? null,
        changed: JSON.stringify(left[field] ?? null) !== JSON.stringify(right[field] ?? null),
      },
    ]),
  );
}

function numericFeature(snapshot: unknown, key: string) {
  const value = asRecord(snapshot)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function decideStatus(params: {
  productFlowPassed: boolean;
  evidenceFlowPassed: boolean;
  exportValidated: boolean;
  withOutcome: number;
}) {
  if (
    params.productFlowPassed &&
    params.evidenceFlowPassed &&
    params.exportValidated &&
    params.withOutcome >= 1
  ) {
    return "PARTIAL_PASS" as const;
  }
  return "FAIL" as const;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const runPrefix = `e2e_personalization_${timestampForRunId()}_seed${options.seed}`;
  const email = `${runPrefix}@example.invalid`;
  const password = "FullJourney#12345";
  const topic = "Full Journey Topic";
  const conceptKey = `${runPrefix}_concept`;
  const skillKey = `${runPrefix}_skill`;
  const familyKey = `${runPrefix}_family`;
  const baseEnv = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    EDUAI_SIX_FACTOR_ARTIFACT_PATH: options.artifact,
    EDUAI_SYNTHETIC_DISABLE_LLM: "1",
  };
  Object.assign(process.env, baseEnv);

  try {
    await ensureDbReady(prisma);

    const register = await callPostRoute({
      handler: registerRoute,
      url: "http://localhost/api/auth/register",
      body: {
        email,
        password,
        name: "Full Journey E2E User",
        researchConsent: true,
      },
      ipSuffix: "41",
    });
    assertJourney(register.status === 200, `registration failed: ${register.status}`);
    const registerCookie = cookieFromSetCookie(register.setCookie);
    assertJourney(registerCookie, "registration must set auth cookie");
    const registeredUser = asRecord(register.json.user);
    const userId = String(registeredUser.id);

    const login = await callPostRoute({
      handler: loginRoute,
      url: "http://localhost/api/auth/login",
      body: { identifier: email, password },
      ipSuffix: "42",
    });
    assertJourney(login.status === 200, `login failed: ${login.status}`);
    const authCookie = cookieFromSetCookie(login.setCookie) ?? registerCookie;

    const preferences = await readRouteResponse(
      await updatePreferencesRoute(
        new Request("http://localhost/api/users/me/preferences", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: authCookie,
            "x-forwarded-for": "127.0.0.43",
          },
          body: JSON.stringify({
            tone: "friendly",
            explanation_style: "stepwise",
            response_format: "mcq",
            difficulty_target: "medium",
            depth: "standard",
          }),
        }),
      ),
    );
    assertJourney(preferences.status === 200, `preferences failed: ${preferences.status}`);

    const savedPreferences = await readRouteResponse(
      await getPreferencesRoute(
        new Request("http://localhost/api/users/me/preferences", {
          method: "GET",
          headers: { cookie: authCookie },
        }),
      ),
    );
    assertJourney(
      asRecord(savedPreferences.json.declared).difficulty_target === "medium",
      "declared difficulty_target must persist",
    );

    const collection = await callPostRoute({
      handler: createCollectionRoute,
      url: "http://localhost/api/collections",
      body: { name: `${runPrefix} collection` },
      cookie: authCookie,
      ipSuffix: "44",
    });
    assertJourney(collection.status === 200, `collection failed: ${collection.status}`);
    const collectionId = String(asRecord(collection.json.data).id);

    const subjectResponse = await callPostRoute({
      handler: createSubjectRoute,
      url: "http://localhost/api/subjects",
      body: {
        title: `${runPrefix} subject`,
        description: "Controlled full user journey E2E subject.",
        collectionId,
      },
      cookie: authCookie,
      ipSuffix: "45",
    });
    assertJourney(
      subjectResponse.status === 200,
      `subject creation failed: ${subjectResponse.status}`,
    );
    const subject = asRecord(subjectResponse.json.data);
    const subjectId = String(subject.id);
    const subjectTitle = String(subject.title);

    const firstPlan = makeAssignmentPlan({
      policyId: "full_user_journey_e2e_policy",
      runtimePolicyId: "full_user_journey_e2e_first_content",
      backendKind: "ml_policy",
      difficulty: "medium",
      depth: "standard",
      tone: "friendly",
      explanationStyle: "stepwise",
    });
    const firstContent = await generateLearningContentForEpisode({
      user: {
        id: userId,
        personalizationReady: true,
        declaredPreferencesJson: asRecord(savedPreferences.json.declared),
        effectivePreferencesJson: {},
      },
      subject: { id: subjectId, title: subjectTitle },
      topic,
      familyKey,
      evaluation: {
        clientKey: `${runPrefix}_episode_first`,
        protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
        touchpointType: "content_delivery",
        sequenceRole: "learning_content",
        itemRole: "training",
        itemVariant: "unknown",
        linkageKind: "none",
        assignmentArm: "predicted",
        conceptKey,
        skillKey,
        familyKey,
        expectedTouchpoints: ["content_delivery", "post_check"],
        expectedSequenceRoles: ["learning_content", "postcheck"],
      },
      plan: firstPlan,
      datasetPhase: "real",
      datasetOrigin: runPrefix,
    });
    const firstMessage = await loadAssistantMessageMetadata({
      prisma,
      sessionId: firstContent.sessionId,
    });
    assertJourney(
      hasAllSixFactors(firstMessage.deliveredMetadata.deliveredConfig),
      "first delivered_config must contain all six factors",
    );
    assertJourney(
      firstMessage.deliveredMetadata.decisionSource === "ml_policy",
      "first decision must use ml_policy with valid artifact",
    );
    assertJourney(
      firstMessage.deliveredMetadata.appliedToLearnerFacingOutput === true,
      "first content must apply six-factor render mapping under local flags",
    );
    assertJourney(
      !containsForbiddenOutcomeFeature(firstMessage.deliveredMetadata.featuresSnapshot),
      "first features snapshot must not contain outcome fields",
    );

    const postcheck = await createControlledPostcheck({
      prisma,
      userId,
      subjectId,
      episodeId: firstContent.evaluationEpisodeId,
      linkedContentId: firstContent.sessionId,
      topic,
      conceptKey,
      skillKey,
      familyKey,
      runId: runPrefix,
    });
    const submit = await readRouteResponse(
      await submitTestRoute(
        buildJsonRequest({
          url: `http://localhost/api/tests/${postcheck.id}/submit`,
          cookie: authCookie,
          ipSuffix: "46",
          body: {
            answers: [0, 0, 0, 1],
            totalDurationMs: 96_000,
            perQuestionFirstAnswerMs: [20_000, 21_000, 25_000, 30_000],
            answerChangeCount: 1,
          },
        }),
        { params: Promise.resolve({ id: postcheck.id }) },
      ),
    );
    assertJourney(submit.status === 200, `test submit failed: ${submit.status}`);
    assertJourney(
      typeof submit.json.score === "number" && submit.json.score > 0,
      "test submit must return score",
    );

    const [attempt, updatedUser, updatedStats] = await Promise.all([
      prisma.testAttempt.findUnique({
        where: { userId_testId: { userId, testId: postcheck.id } },
        select: { id: true, score: true, createdAt: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          testsTaken: true,
          personalizationReady: true,
          declaredPreferencesJson: true,
          effectivePreferencesJson: true,
        },
      }),
      prisma.userTagStat.findMany({
        where: { userId },
        include: { axis: true, tag: true },
      }),
    ]);
    assertJourney(attempt, "TestAttempt must be persisted");
    assertJourney(updatedUser?.testsTaken === 1, "testsTaken must increment");
    assertJourney(updatedStats.length > 0, "UserTagStat must update after submit");

    const chatPreset = await getUserPresetForChat(userId);
    const secondPlan = makeAssignmentPlan({
      policyId: "full_user_journey_e2e_policy_after_outcome",
      runtimePolicyId: chatPreset.runtime?.policyId ?? "full_user_journey_e2e_second_content",
      backendKind: chatPreset.runtime?.backendKind ?? "ml_policy",
      difficulty: chatPreset.pedagogicalDecision.difficulty,
      depth: chatPreset.pedagogicalDecision.depth,
      tone: chatPreset.uxPreset.tone ?? "friendly",
      explanationStyle: chatPreset.uxPreset.explanation_style ?? "stepwise",
    });
    const secondContent = await generateLearningContentForEpisode({
      user: {
        id: userId,
        personalizationReady: updatedUser?.personalizationReady ?? false,
        declaredPreferencesJson: updatedUser?.declaredPreferencesJson ?? {},
        effectivePreferencesJson: updatedUser?.effectivePreferencesJson ?? {},
      },
      subject: { id: subjectId, title: subjectTitle },
      topic,
      familyKey,
      evaluation: {
        clientKey: `${runPrefix}_episode_second`,
        protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
        touchpointType: "content_delivery",
        sequenceRole: "learning_content",
        itemRole: "training",
        itemVariant: "unknown",
        linkageKind: "none",
        assignmentArm: "predicted",
        conceptKey,
        skillKey,
        familyKey,
        expectedTouchpoints: ["content_delivery"],
        expectedSequenceRoles: ["learning_content"],
      },
      plan: secondPlan,
      priorTestOutcome: {
        contentId: postcheck.id,
        accuracy: attempt.score,
        questionCount: postcheck.questionCount,
        totalDurationMs: 96_000,
        submittedAtIso: attempt.createdAt.toISOString(),
      },
      datasetPhase: "real",
      datasetOrigin: runPrefix,
    });
    const secondMessage = await loadAssistantMessageMetadata({
      prisma,
      sessionId: secondContent.sessionId,
    });
    assertJourney(
      hasAllSixFactors(secondMessage.deliveredMetadata.deliveredConfig),
      "second delivered_config must contain all six factors",
    );
    assertJourney(
      !containsForbiddenOutcomeFeature(secondMessage.deliveredMetadata.featuresSnapshot),
      "second features snapshot must not contain outcome fields",
    );

    const featureComparison = compareFeatureSnapshots(
      firstMessage.deliveredMetadata.featuresSnapshot,
      secondMessage.deliveredMetadata.featuresSnapshot,
    );
    const secondFeaturesChanged = Object.values(featureComparison).some(
      (entry) => asRecord(entry).changed === true,
    );
    const secondFeatures = secondMessage.deliveredMetadata.featuresSnapshot;
    const aggregateFieldsChanged = [
      "priorAttemptsCount",
      "priorCorrectRate",
      "recentCorrectRate",
      "recentAttemptsCount",
      "topicSeenCount",
    ].some((field) => asRecord(featureComparison[field]).changed === true);
    const secondAggregateEvidence =
      (numericFeature(secondFeatures, "priorAttemptsCount") ?? 0) >= 1 &&
      (numericFeature(secondFeatures, "recentAttemptsCount") ?? 0) >= 1 &&
      (numericFeature(secondFeatures, "priorCorrectRate") != null ||
        numericFeature(secondFeatures, "recentCorrectRate") != null) &&
      numericFeature(secondFeatures, "topicSeenCount") != null;
    const policyRecomputed =
      firstMessage.deliveredMetadata.decisionCreatedAt !==
        secondMessage.deliveredMetadata.decisionCreatedAt ||
      firstMessage.deliveredMetadata.featuresSnapshot.sessionRef !==
        secondMessage.deliveredMetadata.featuresSnapshot.sessionRef;
    const configChanged =
      JSON.stringify(firstMessage.deliveredMetadata.deliveredConfig) !==
      JSON.stringify(secondMessage.deliveredMetadata.deliveredConfig);

    const exportSummary = runExport({
      outPath: options.out,
      datasetOriginPrefix: runPrefix,
    });
    const validation = runValidation(options.out);
    const exportedRows = parseJsonl(options.out);
    const withOutcome = Number(exportSummary.withOutcome ?? 0);
    const sourceKinds = exportedRows.map((row) => asRecord(row.source).source_kind);
    const exportLeakageViolations = exportedRows.filter(
      (row) =>
        asRecord(row.leakage_guard).uses_only_pre_decision_data !== true ||
        containsForbiddenOutcomeFeature(row.pre_decision_features),
    ).length;
    const exportedSecondObservation = exportedRows.find(
      (row) => asRecord(row.ids).content_event_ref === secondContent.sessionId,
    );
    const exportedSecondFeatures = asRecord(
      exportedSecondObservation?.pre_decision_features,
    );
    const exportedSecondHasAggregates =
      exportedSecondObservation != null &&
      Number(exportedSecondFeatures.prior_attempts_count ?? 0) >= 1 &&
      Number(exportedSecondFeatures.recent_attempts_count ?? 0) >= 1 &&
      (typeof exportedSecondFeatures.prior_correct_rate === "number" ||
        typeof exportedSecondFeatures.recent_correct_rate === "number") &&
      typeof exportedSecondFeatures.topic_seen_count === "number";

    const assertionFailures: string[] = [];
    if (!secondFeaturesChanged) {
      assertionFailures.push(
        "second_chat_feature_snapshot_did_not_change_after_test_outcome",
      );
    }
    if (!aggregateFieldsChanged) {
      assertionFailures.push(
        "second_chat_six_factor_features_did_not_change_on_aggregate_fields",
      );
    }
    if (!secondAggregateEvidence) {
      assertionFailures.push(
        "second_chat_six_factor_features_missing_updated_prior_recent_correctness",
      );
    }
    if (!policyRecomputed) {
      assertionFailures.push("second_chat_policy_not_recomputed");
    }
    if (!validation.ok) {
      assertionFailures.push("export_validation_failed");
    }
    if (withOutcome < 1) {
      assertionFailures.push("export_has_no_observation_with_outcome");
    }
    if (exportLeakageViolations > 0) {
      assertionFailures.push("export_has_leakage_violation");
    }
    if (!sourceKinds.every((kind) => kind === "real_user")) {
      assertionFailures.push("export_contains_non_real_user_source");
    }
    if (!exportedSecondHasAggregates) {
      assertionFailures.push("exported_second_chat_observation_missing_aggregates");
    }

    const status = decideStatus({
      productFlowPassed: true,
      evidenceFlowPassed:
        secondFeaturesChanged &&
        aggregateFieldsChanged &&
        secondAggregateEvidence &&
        policyRecomputed &&
        exportedSecondHasAggregates &&
        exportLeakageViolations === 0,
      exportValidated: validation.ok,
      withOutcome,
    });
    const result = {
      ok: status !== "FAIL",
      status,
      runPrefix,
      mode: "api_db_level_mock_content",
      browserLevel: false,
      externalLlmUsed: false,
      userJourney: {
        registration: true,
        login: true,
        profilePreferences: true,
        subjectCreation: true,
        firstChatLearningContent: true,
        testSubmit: true,
        outcomePersisted: true,
        predictionStatsUpdated: updatedStats.length > 0 && updatedUser.testsTaken === 1,
        secondChatLearningContent: true,
        exportValidation: validation.ok,
      },
      secondChatPersonalization: {
        policyRecomputed,
        featuresChanged: secondFeaturesChanged,
        aggregateFieldsChanged,
        aggregateEvidencePresent: secondAggregateEvidence,
        decisionSource: secondMessage.deliveredMetadata.decisionSource,
        fallbackUsed: secondMessage.deliveredMetadata.fallbackUsed,
        configChanged,
        firstDeliveredConfig: firstMessage.deliveredMetadata.deliveredConfig,
        secondDeliveredConfig: secondMessage.deliveredMetadata.deliveredConfig,
        featureComparison,
      },
      evidence: {
        userId,
        subjectId,
        firstSessionId: firstContent.sessionId,
        secondSessionId: secondContent.sessionId,
        testId: postcheck.id,
        attemptId: attempt.id,
        attemptScore: attempt.score,
        userTestsTaken: updatedUser.testsTaken,
        userTagStatCount: updatedStats.length,
        firstDecisionSource: firstMessage.deliveredMetadata.decisionSource,
        secondDecisionSource: secondMessage.deliveredMetadata.decisionSource,
      },
      exportSummary,
      exportedSecondObservation: exportedSecondObservation
        ? {
            observationId: asRecord(exportedSecondObservation.ids).observation_id,
            outcomeAvailable: asRecord(exportedSecondObservation.outcome)
              .outcome_available,
            preDecisionFeatures: exportedSecondFeatures,
          }
        : null,
      validation,
      leakage: {
        exportLeakageViolations,
        firstFeaturesContainOutcome: containsForbiddenOutcomeFeature(
          firstMessage.deliveredMetadata.featuresSnapshot,
        ),
        secondFeaturesContainOutcome: containsForbiddenOutcomeFeature(
          secondMessage.deliveredMetadata.featuresSnapshot,
        ),
      },
      assertionFailures,
      interpretation:
        status === "FAIL"
          ? "The controlled product flow runs, but the evidence/provenance assertions still have a gap."
          : "API/DB-level evidence path passed; browser/live LLM remains untested, so the result is PARTIAL_PASS rather than FULL_PASS.",
      outputPath: path.resolve(options.out),
    };

    console.log(JSON.stringify(result, null, 2));
    await prisma.$disconnect();
    if (status === "FAIL") {
      process.exit(1);
    }
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    if (isDbUnavailable(error)) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            status: "FAIL",
            failureStep: "DB_UNAVAILABLE",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      process.exit(2);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}

main();
