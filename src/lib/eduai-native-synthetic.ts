import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  advanceLearningEpisode,
  createLearningEpisode,
} from "@/lib/learning-episode";
import { expectedTotalDurationBaselineMs } from "@/lib/prediction-baselines";
import { exportTrainingDatasetSnapshot } from "@/lib/training-dataset";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";
import type { GenerateTestUser } from "@/lib/test-generation";
import {
  SYNTHETIC_WORLD_SCHEMA_VERSION,
  SKILL_CATALOG,
  SYNTHETIC_DELAYED_RECHECK_MINUTES,
  buildEpisodePlan,
  buildGenerationSummary,
  buildLatentProfile,
  buildLearnerProfileSummary,
  buildOutcomeModel,
  buildSanityMarkdown,
  buildSanityReport,
  difficultyFromIndex,
  hashString,
  mapDepthIndexToStyle,
  applyObservedEpisodeUpdate,
  type DepthValue,
  type DifficultyValue,
  type PolicyArmValue,
  type SyntheticEpisodeAnalyticsRecord,
  type SyntheticLatentProfile,
} from "@/lib/eduai-native-synthetic-world";

const SYNTHETIC_GENERATION_SCHEMA_VERSION =
  "eduai_native_synthetic_generation_v2_2026_03" as const;
const SYNTHETIC_GENERATION_ROOT_RELATIVE_DIR =
  "bootstrap_training/eduai_native_synthetic/data/generation_runs" as const;
const SYNTHETIC_DATASET_ORIGIN_PREFIX = "synthetic_internal_bridge" as const;
const DEFAULT_LEARNER_COUNT = 48;
const DEFAULT_EPISODES_PER_LEARNER = 16;
const DEFAULT_QUESTION_COUNT = 4;
const DEFAULT_EXPORT_TIME_RANGE_DAYS = 30;
const MAX_SUBMIT_RETRIES = 4;
const RETRY_PADDING_MS = 250;
const SYNTHETIC_CONSENT_VERSION = "synthetic_internal_v2_2026_03" as const;

type SyntheticGenerationOptions = {
  learnerCount?: number;
  episodesPerLearner?: number;
  questionCount?: number;
  exportTimeRangeDays?: number;
  runId?: string | null;
};

type SyntheticLearnerRuntime = {
  userId: string;
  externalId: string;
  email: string;
  displayName: string;
  token: string;
  syntheticIp: string;
  subjectIdsByTitle: Record<string, string>;
  sectionIdsBySkillKey: Record<string, string>;
  latent: SyntheticLatentProfile;
};

type SyntheticGenerationResult = {
  generationRunId: string;
  generationRunDir: string;
  manifestPath: string;
  profilesPath: string;
  episodesPath: string;
  summaryPath: string;
  sanityJsonPath: string;
  sanityMarkdownPath: string;
  datasetOrigin: string;
  learnerCount: number;
  episodeCount: number;
  exportedSnapshot: {
    snapshotId: string;
    snapshotDir: string;
    exportedEpisodes: number;
    exportedRows: number;
    learningContentRows: number;
  };
};

type NormalizedSyntheticGenerationOptions = {
  learnerCount: number;
  episodesPerLearner: number;
  questionCount: number;
  exportTimeRangeDays: number;
  runId: string;
};

type SyntheticDecisionTrace = {
  runId: string;
  policyArm: PolicyArmValue;
  armDecisionMode: string;
  coverageCellKey: string;
  declaredDecision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  effectiveDecision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
};

type ReadTestDecisionResult = {
  decision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  generationSource: "llm" | "fallback";
  questions: Array<{
    answerIndex: number;
    options: string[];
  }>;
};

type SyntheticSubmission = {
  answers: number[];
  totalDurationMs: number;
  perQuestionFirstAnswerMs: number[];
  answerChangeCount: number;
  actualAccuracy: number;
};

function buildRunId(explicitRunId?: string | null) {
  if (explicitRunId && explicitRunId.trim().length > 0) {
    return explicitRunId.trim();
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const sec = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${sec}`;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    integer(maxExclusive: number) {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildGenerationRoot() {
  return path.join(process.cwd(), SYNTHETIC_GENERATION_ROOT_RELATIVE_DIR);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldDisableLlmForSyntheticPipeline() {
  const raw = process.env.EDUAI_SYNTHETIC_DISABLE_LLM?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function applySyntheticLlmMode() {
  if (!shouldDisableLlmForSyntheticPipeline()) {
    return;
  }
  delete process.env.OPENAI_API_KEY;
}

async function waitForRetry(seconds: number | null | undefined) {
  const value =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? seconds
      : 1;
  await sleep(value * 1000 + RETRY_PADDING_MS);
}

function normalizeOptions(
  options: SyntheticGenerationOptions = {},
): NormalizedSyntheticGenerationOptions {
  return {
    learnerCount: Math.max(12, Math.floor(options.learnerCount ?? DEFAULT_LEARNER_COUNT)),
    episodesPerLearner: Math.max(
      8,
      Math.floor(options.episodesPerLearner ?? DEFAULT_EPISODES_PER_LEARNER),
    ),
    questionCount: Math.max(3, Math.floor(options.questionCount ?? DEFAULT_QUESTION_COUNT)),
    exportTimeRangeDays: Math.max(
      1,
      Math.floor(options.exportTimeRangeDays ?? DEFAULT_EXPORT_TIME_RANGE_DAYS),
    ),
    runId: buildRunId(options.runId),
  };
}

async function createSyntheticLearnerRuntime(params: {
  runId: string;
  learnerIndex: number;
}): Promise<SyntheticLearnerRuntime> {
  const learnerSeed = `${params.runId}:learner:${params.learnerIndex}`;
  const latent = buildLatentProfile(learnerSeed, params.learnerIndex);
  const externalId = `synthetic-bridge:${params.runId}:${params.learnerIndex + 1}`;
  const email = `synthetic-bridge-${params.runId}-${params.learnerIndex + 1}@eduai.local`;
  const displayName = `Synthetic Bridge Learner ${params.learnerIndex + 1}`;

  const declaredDifficulty = difficultyFromIndex(latent.declaredDifficultyIndex);
  const effectiveDifficulty = difficultyFromIndex(latent.effectiveDifficultyIndex);
  const declaredStyle = mapDepthIndexToStyle(latent.declaredDepthIndex);
  const effectiveStyle = mapDepthIndexToStyle(latent.effectiveDepthIndex);

  const user = await prisma.user.create({
    data: {
      externalId,
      email,
      name: displayName,
      personalizationReady: true,
      researchConsentAt: new Date(),
      researchConsentVersion: SYNTHETIC_CONSENT_VERSION,
      declaredPreferencesJson: {
        tone: params.learnerIndex % 3 === 0 ? "friendly" : "formal",
        explanation_style: declaredStyle,
        response_format: "mcq",
        difficulty_target: declaredDifficulty,
      },
      effectivePreferencesJson: {
        tone: params.learnerIndex % 4 === 0 ? "direct" : "formal",
        explanation_style: effectiveStyle,
        response_format: "mcq",
        difficulty_target: effectiveDifficulty,
      },
    },
  });

  const subjectIdsByTitle: Record<string, string> = {};
  const sectionIdsBySkillKey: Record<string, string> = {};

  for (const subjectTitle of [...new Set(SKILL_CATALOG.map((item) => item.subjectTitle))]) {
    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: subjectTitle,
        description: "Synthetic internal bridge subject for EduAI-native data generation.",
      },
    });
    subjectIdsByTitle[subjectTitle] = subject.id;
  }

  for (const skill of SKILL_CATALOG) {
    const section = await prisma.subjectSection.create({
      data: {
        subjectId: subjectIdsByTitle[skill.subjectTitle],
        title: skill.sectionTitle,
        description: `Synthetic bridge section for ${skill.skillKey}.`,
      },
    });
    sectionIdsBySkillKey[skill.skillKey] = section.id;
  }

  return {
    userId: user.id,
    externalId,
    email,
    displayName,
    token: issueToken({ userId: user.id }),
    syntheticIp: `10.42.${Math.floor(params.learnerIndex / 200)}.${(params.learnerIndex % 200) + 10}`,
    subjectIdsByTitle,
    sectionIdsBySkillKey,
    latent,
  };
}

async function loadRuntimeUser(userId: string): Promise<GenerateTestUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      personalizationReady: true,
      declaredPreferencesJson: true,
      effectivePreferencesJson: true,
    },
  });

  if (!user) {
    throw new Error(`SYNTHETIC_USER_NOT_FOUND:${userId}`);
  }

  return user;
}

function buildSyntheticDecisionRuntime(params: {
  runId: string;
  policyArm: PolicyArmValue;
  armDecisionMode: string;
  coverageCellKey: string;
}) {
  return {
    runtimePolicyId: null,
    backendKind: "synthetic_world_v2",
    backendId: `${params.runId}:${params.policyArm}:${params.armDecisionMode}`,
    schemaVersion: SYNTHETIC_WORLD_SCHEMA_VERSION,
    syntheticWorld: {
      runId: params.runId,
      policyArm: params.policyArm,
      armDecisionMode: params.armDecisionMode,
      coverageCellKey: params.coverageCellKey,
    },
  };
}

async function applySyntheticTestDecision(params: {
  testId: string;
  decision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  trace: SyntheticDecisionTrace;
}) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: params.testId },
    select: {
      validationMetaJson: true,
    },
  });
  if (!test) {
    throw new Error(`SYNTHETIC_TEST_NOT_FOUND:${params.testId}`);
  }

  const validation = asRecord(test.validationMetaJson);
  const decisionRuntime = buildSyntheticDecisionRuntime({
    runId: params.trace.runId,
    policyArm: params.trace.policyArm,
    armDecisionMode: params.trace.armDecisionMode,
    coverageCellKey: params.trace.coverageCellKey,
  });
  const syntheticWorldDecision = {
    schemaVersion: SYNTHETIC_WORLD_SCHEMA_VERSION,
    coverageCellKey: params.trace.coverageCellKey,
    policyArm: params.trace.policyArm,
    armDecisionMode: params.trace.armDecisionMode,
    declaredDecision: params.trace.declaredDecision,
    effectiveDecision: params.trace.effectiveDecision,
  };

  await prisma.generatedTest.update({
    where: { id: params.testId },
    data: {
      validationMetaJson: toJsonValue({
        ...validation,
        pedagogicalDecision: params.decision,
        decisionBackend: decisionRuntime,
        syntheticWorldDecision,
      }),
    },
  });

  await prisma.evaluationEpisodeItem.update({
    where: {
      contentKind_contentId: {
        contentKind: "generated_test",
        contentId: params.testId,
      },
    },
    data: {
      pedagogicalDecisionJson: toJsonValue(params.decision),
      decisionRuntimeJson: toJsonValue(decisionRuntime),
    },
  });
}

async function applySyntheticLearningContentDecision(params: {
  sessionId: string;
  decision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  trace: SyntheticDecisionTrace;
}) {
  const decisionRuntime = buildSyntheticDecisionRuntime({
    runId: params.trace.runId,
    policyArm: params.trace.policyArm,
    armDecisionMode: params.trace.armDecisionMode,
    coverageCellKey: params.trace.coverageCellKey,
  });

  await prisma.evaluationEpisodeItem.update({
    where: {
      contentKind_contentId: {
        contentKind: "chat_session",
        contentId: params.sessionId,
      },
    },
    data: {
      pedagogicalDecisionJson: toJsonValue(params.decision),
      decisionRuntimeJson: toJsonValue(decisionRuntime),
    },
  });
}

async function applySyntheticTestTiming(params: {
  testId: string;
  deliveredAtIso: string;
  submittedAtIso?: string;
}) {
  const deliveredAt = new Date(params.deliveredAtIso);
  const submittedAt = params.submittedAtIso ? new Date(params.submittedAtIso) : null;

  const item = await prisma.evaluationEpisodeItem.findUnique({
    where: {
      contentKind_contentId: {
        contentKind: "generated_test",
        contentId: params.testId,
      },
    },
    select: {
      outcomeJson: true,
    },
  });

  const outcome = asRecord(item?.outcomeJson);

  await prisma.generatedTest.update({
    where: { id: params.testId },
    data: {
      createdAt: deliveredAt,
    },
  });

  await prisma.evaluationEpisodeItem.update({
    where: {
      contentKind_contentId: {
        contentKind: "generated_test",
        contentId: params.testId,
      },
    },
    data: {
      deliveredAt,
      outcomeRecordedAt: submittedAt ?? undefined,
      outcomeJson:
        submittedAt == null
          ? undefined
          : toJsonValue({
              ...outcome,
              submittedAtIso: submittedAt.toISOString(),
            }),
    },
  });

  await prisma.testAttempt.updateMany({
    where: { testId: params.testId },
    data: {
      createdAt: submittedAt ?? deliveredAt,
    },
  });
}

async function applySyntheticLearningContentTiming(params: {
  sessionId: string;
  deliveredAtIso: string;
}) {
  const deliveredAt = new Date(params.deliveredAtIso);

  await prisma.chatSession.update({
    where: { id: params.sessionId },
    data: {
      createdAt: deliveredAt,
    },
  });

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: params.sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (let index = 0; index < messages.length; index += 1) {
    await prisma.chatMessage.update({
      where: { id: messages[index]!.id },
      data: {
        createdAt: new Date(deliveredAt.getTime() + index * 10_000),
      },
    });
  }

  await prisma.evaluationEpisodeItem.update({
    where: {
      contentKind_contentId: {
        contentKind: "chat_session",
        contentId: params.sessionId,
      },
    },
    data: {
      deliveredAt,
    },
  });
}

function readPedagogicalDecision(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const root = value as Record<string, unknown>;
  const decision =
    root.pedagogicalDecision && typeof root.pedagogicalDecision === "object"
      ? (root.pedagogicalDecision as Record<string, unknown>)
      : null;
  if (
    !decision ||
    typeof decision.difficulty !== "string" ||
    typeof decision.depth !== "string"
  ) {
    return null;
  }
  return {
    difficulty: decision.difficulty as DifficultyValue,
    depth: decision.depth as DepthValue,
  };
}

async function readTestDecision(testId: string): Promise<ReadTestDecisionResult> {
  const test = await prisma.generatedTest.findUnique({
    where: { id: testId },
    select: {
      validationMetaJson: true,
      questionsJson: true,
    },
  });

  if (!test) {
    throw new Error(`SYNTHETIC_TEST_NOT_FOUND:${testId}`);
  }

  const validation = asRecord(test.validationMetaJson);
  const decision = readPedagogicalDecision(validation);
  if (!decision) {
    throw new Error(`SYNTHETIC_TEST_DECISION_MISSING:${testId}`);
  }

  return {
    decision,
    generationSource: validation.generationSource === "llm" ? "llm" : "fallback",
    questions:
      Array.isArray(test.questionsJson) &&
      test.questionsJson.every((item) => item && typeof item === "object")
        ? (test.questionsJson as Array<{
            answerIndex: number;
            options: string[];
          }>)
        : [],
  };
}

function buildSyntheticSubmission(params: {
  questions: Array<{ answerIndex: number; options: string[] }>;
  successProbability: number;
  difficulty: DifficultyValue;
  depth: DepthValue;
  role: "precheck" | "postcheck" | "holdout" | "delayed_recheck";
  latent: SyntheticLatentProfile;
  rng: ReturnType<typeof createSeededRandom>;
}) {
  const answers = params.questions.map((question) => {
    const correct = params.rng.next() < params.successProbability;
    if (correct) {
      return question.answerIndex;
    }
    const incorrectOptions = question.options
      .map((_, index) => index)
      .filter((index) => index !== question.answerIndex);
    return incorrectOptions[
      params.rng.integer(Math.max(1, incorrectOptions.length))
    ]!;
  });

  const questionCount = Math.max(1, params.questions.length);
  const baselineDuration = expectedTotalDurationBaselineMs({
    difficultyTarget: params.difficulty,
    responseFormat: "mcq",
    questionCount,
  });
  const depthFactor =
    params.depth === "detailed" ? 1.14 : params.depth === "brief" ? 0.9 : 1;
  const roleFactor =
    params.role === "precheck"
      ? 0.92
      : params.role === "holdout"
        ? 1.08
        : params.role === "delayed_recheck"
          ? 1.12
          : 1;
  const uncertaintyFactor = 0.88 + (1 - params.successProbability) * 0.52;
  const totalDurationMs = Math.round(
    baselineDuration *
      params.latent.paceMultiplier *
      depthFactor *
      roleFactor *
      uncertaintyFactor *
      (0.92 + params.rng.next() * 0.16),
  );
  const basePerQuestion = Math.max(
    4_000,
    Math.floor(totalDurationMs / questionCount),
  );
  const perQuestionFirstAnswerMs = Array.from({ length: questionCount }).map(() =>
    Math.max(
      2_500,
      Math.round(basePerQuestion * (0.7 + params.rng.next() * 0.6)),
    ),
  );
  const answerChangeCount = Math.max(
    0,
    Math.round(
      params.latent.answerChangeBias *
        questionCount *
        (1 - params.successProbability) *
        (0.7 + params.rng.next() * 1.1),
    ),
  );
  const actualAccuracy =
    questionCount > 0
      ? answers.filter((answer, index) => answer === params.questions[index]?.answerIndex)
          .length / questionCount
      : 0;

  return {
    answers,
    totalDurationMs,
    perQuestionFirstAnswerMs,
    answerChangeCount,
    actualAccuracy,
  } satisfies SyntheticSubmission;
}

async function submitSyntheticTest(params: {
  token: string;
  syntheticIp: string;
  testId: string;
  submission: SyntheticSubmission;
}) {
  for (let attempt = 0; attempt < MAX_SUBMIT_RETRIES; attempt += 1) {
    const response = await submitTestRoute(
      new Request(`http://localhost/api/tests/${params.testId}/submit`, {
        method: "POST",
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(params.token)}`,
          "content-type": "application/json",
          "x-forwarded-for": params.syntheticIp,
          "x-real-ip": params.syntheticIp,
        },
        body: JSON.stringify({
          answers: params.submission.answers,
          totalDurationMs: params.submission.totalDurationMs,
          perQuestionFirstAnswerMs: params.submission.perQuestionFirstAnswerMs,
          answerChangeCount: params.submission.answerChangeCount,
        }),
      }),
      { params: Promise.resolve({ id: params.testId }) },
    );

    if (response.ok) {
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          retryAfterSeconds?: number;
          message?: string;
        }
      | null;

    if (response.status === 429 && attempt < MAX_SUBMIT_RETRIES - 1) {
      await waitForRetry(payload?.retryAfterSeconds);
      continue;
    }

    throw new Error(
      `SYNTHETIC_SUBMIT_FAILED:${response.status}:${payload?.error ?? payload?.message ?? "unknown"}`,
    );
  }
}

async function runOneEpisode(params: {
  learner: SyntheticLearnerRuntime;
  learnerIndex: number;
  episodeIndex: number;
  episodesPerLearner: number;
  questionCount: number;
  datasetOrigin: string;
  runId: string;
}): Promise<SyntheticEpisodeAnalyticsRecord & {
  episodeId: string;
  precheckTestId: string;
  postcheckTestId: string;
  holdoutTestId: string;
  delayedRecheckTestId: string;
  learningContentSessionId: string;
  generationSources: {
    precheck: "llm" | "fallback";
    learningContent: "llm" | "fallback";
    postcheck: "llm" | "fallback";
    holdout: "llm" | "fallback";
    delayedRecheck: "llm" | "fallback";
  };
}> {
  const runtimeUser = await loadRuntimeUser(params.learner.userId);
  const learnerSeed = `${params.runId}:learner:${params.learnerIndex}`;
  const plan = buildEpisodePlan({
    learnerSeed,
    learnerIndex: params.learnerIndex,
    episodeIndex: params.episodeIndex,
    episodesPerLearner: params.episodesPerLearner,
    latent: params.learner.latent,
  });
  const skillState = params.learner.latent.skillState[plan.skill.skillKey]!;
  const outcomeModel = buildOutcomeModel({
    learnerSeed,
    episodeIndex: params.episodeIndex,
    latent: params.learner.latent,
    skill: plan.skill,
    skillState,
    decision: plan.decision,
    holdoutStrategy: plan.holdoutStrategy,
  });
  const decisionTrace = {
    runId: params.runId,
    policyArm: plan.policyArm,
    armDecisionMode: plan.armDecisionMode,
    coverageCellKey: plan.coverageCellKey,
    declaredDecision: plan.declaredDecision,
    effectiveDecision: plan.effectiveDecision,
  } satisfies SyntheticDecisionTrace;
  const outcomeRng = createSeededRandom(
    hashString(
      `${params.learner.externalId}:${params.episodeIndex}:${plan.skill.skillKey}:${plan.policyArm}:submission`,
    ),
  );

  const created = await createLearningEpisode(runtimeUser, {
    subjectId: params.learner.subjectIdsByTitle[plan.skill.subjectTitle],
    sectionId: params.learner.sectionIdsBySkillKey[plan.skill.skillKey],
    topic: plan.topic,
    questionCount: params.questionCount,
    mode: "practice",
    personalizationMode: "on",
    assignmentArm: plan.policyArm,
    conceptKey: plan.skill.conceptKey,
    skillKey: plan.skill.skillKey,
    includeHoldout: true,
    holdoutStrategy: plan.holdoutStrategy,
    delayedRecheckMinutes: SYNTHETIC_DELAYED_RECHECK_MINUTES,
    expectedSequenceRoles: [
      "precheck",
      "learning_content",
      "postcheck",
      "holdout",
      "delayed_recheck",
    ],
    datasetPhase: "synthetic",
    datasetOrigin: params.datasetOrigin,
  });
  const episodeSummary = created.episode;
  if (!episodeSummary) {
    throw new Error("SYNTHETIC_EPISODE_SUMMARY_MISSING");
  }
  const episodeId = episodeSummary.episodeId;

  if (!created.currentStep.test?.id) {
    throw new Error("SYNTHETIC_PRECHECK_STEP_MISSING");
  }

  await applySyntheticTestDecision({
    testId: created.currentStep.test.id,
    decision: plan.decision,
    trace: decisionTrace,
  });
  const precheckTest = await readTestDecision(created.currentStep.test.id);
  const precheckSubmission = buildSyntheticSubmission({
    questions: precheckTest.questions,
    successProbability: outcomeModel.roleProbabilities.precheck,
    difficulty: precheckTest.decision.difficulty,
    depth: precheckTest.decision.depth,
    role: "precheck",
    latent: params.learner.latent,
    rng: outcomeRng,
  });
  await submitSyntheticTest({
    token: params.learner.token,
    syntheticIp: params.learner.syntheticIp,
    testId: created.currentStep.test.id,
    submission: precheckSubmission,
  });
  await applySyntheticTestTiming({
    testId: created.currentStep.test.id,
    deliveredAtIso: plan.timeline.precheckDeliveredAtIso,
    submittedAtIso: plan.timeline.precheckSubmittedAtIso,
  });

  const learningContent = await advanceLearningEpisode(
    runtimeUser,
    episodeId,
    false,
  );
  if (!learningContent.currentStep.learningContent?.sessionId) {
    throw new Error("SYNTHETIC_LEARNING_CONTENT_MISSING");
  }
  await applySyntheticLearningContentDecision({
    sessionId: learningContent.currentStep.learningContent.sessionId,
    decision: plan.decision,
    trace: decisionTrace,
  });
  await applySyntheticLearningContentTiming({
    sessionId: learningContent.currentStep.learningContent.sessionId,
    deliveredAtIso: plan.timeline.learningContentDeliveredAtIso,
  });

  const postcheck = await advanceLearningEpisode(
    runtimeUser,
    episodeId,
    true,
  );
  if (!postcheck.currentStep.test?.id) {
    throw new Error("SYNTHETIC_POSTCHECK_STEP_MISSING");
  }
  await applySyntheticTestDecision({
    testId: postcheck.currentStep.test.id,
    decision: plan.decision,
    trace: decisionTrace,
  });
  const postcheckTest = await readTestDecision(postcheck.currentStep.test.id);
  const postcheckSubmission = buildSyntheticSubmission({
    questions: postcheckTest.questions,
    successProbability: outcomeModel.roleProbabilities.postcheck,
    difficulty: postcheckTest.decision.difficulty,
    depth: postcheckTest.decision.depth,
    role: "postcheck",
    latent: params.learner.latent,
    rng: outcomeRng,
  });
  await submitSyntheticTest({
    token: params.learner.token,
    syntheticIp: params.learner.syntheticIp,
    testId: postcheck.currentStep.test.id,
    submission: postcheckSubmission,
  });
  await applySyntheticTestTiming({
    testId: postcheck.currentStep.test.id,
    deliveredAtIso: plan.timeline.postcheckDeliveredAtIso,
    submittedAtIso: plan.timeline.postcheckSubmittedAtIso,
  });

  const holdout = await advanceLearningEpisode(
    runtimeUser,
    episodeId,
    true,
  );
  if (!holdout.currentStep.test?.id) {
    throw new Error("SYNTHETIC_HOLDOUT_STEP_MISSING");
  }
  await applySyntheticTestDecision({
    testId: holdout.currentStep.test.id,
    decision: plan.decision,
    trace: decisionTrace,
  });
  const holdoutTest = await readTestDecision(holdout.currentStep.test.id);
  const holdoutSubmission = buildSyntheticSubmission({
    questions: holdoutTest.questions,
    successProbability: outcomeModel.roleProbabilities.holdout,
    difficulty: holdoutTest.decision.difficulty,
    depth: holdoutTest.decision.depth,
    role: "holdout",
    latent: params.learner.latent,
    rng: outcomeRng,
  });
  await submitSyntheticTest({
    token: params.learner.token,
    syntheticIp: params.learner.syntheticIp,
    testId: holdout.currentStep.test.id,
    submission: holdoutSubmission,
  });
  await applySyntheticTestTiming({
    testId: holdout.currentStep.test.id,
    deliveredAtIso: plan.timeline.holdoutDeliveredAtIso,
    submittedAtIso: plan.timeline.holdoutSubmittedAtIso,
  });

  const delayedRecheck = await advanceLearningEpisode(
    runtimeUser,
    episodeId,
    true,
  );
  if (!delayedRecheck.currentStep.test?.id) {
    throw new Error("SYNTHETIC_DELAYED_RECHECK_STEP_MISSING");
  }
  await applySyntheticTestDecision({
    testId: delayedRecheck.currentStep.test.id,
    decision: plan.decision,
    trace: decisionTrace,
  });
  const delayedRecheckTest = await readTestDecision(delayedRecheck.currentStep.test.id);
  const delayedRecheckSubmission = buildSyntheticSubmission({
    questions: delayedRecheckTest.questions,
    successProbability: outcomeModel.roleProbabilities.delayedRecheck,
    difficulty: delayedRecheckTest.decision.difficulty,
    depth: delayedRecheckTest.decision.depth,
    role: "delayed_recheck",
    latent: params.learner.latent,
    rng: outcomeRng,
  });
  await submitSyntheticTest({
    token: params.learner.token,
    syntheticIp: params.learner.syntheticIp,
    testId: delayedRecheck.currentStep.test.id,
    submission: delayedRecheckSubmission,
  });
  await applySyntheticTestTiming({
    testId: delayedRecheck.currentStep.test.id,
    deliveredAtIso: plan.timeline.delayedRecheckDeliveredAtIso,
    submittedAtIso: plan.timeline.delayedRecheckSubmittedAtIso,
  });

  applyObservedEpisodeUpdate({
    skillState,
    outcomeModel,
    precheckAccuracy: precheckSubmission.actualAccuracy,
    postcheckAccuracy: postcheckSubmission.actualAccuracy,
    holdoutAccuracy: holdoutSubmission.actualAccuracy,
    delayedRecheckAccuracy: delayedRecheckSubmission.actualAccuracy,
  });

  const finalState = await prisma.evaluationEpisode.findUnique({
    where: { id: episodeId },
    select: { status: true },
  });
  if (finalState?.status !== "completed") {
    throw new Error("SYNTHETIC_EPISODE_NOT_COMPLETED");
  }

  return {
    learnerExternalId: params.learner.externalId,
    learnerIndex: params.learnerIndex,
    learnerArchetypeKey: params.learner.latent.archetypeKey,
    learnerArchetypeLabel: params.learner.latent.archetypeLabel,
    learnerAbilityBase: params.learner.latent.abilityBase,
    episodeIndex: params.episodeIndex,
    policyArm: plan.policyArm,
    holdoutStrategy: plan.holdoutStrategy,
    subjectTitle: plan.skill.subjectTitle,
    sectionTitle: plan.skill.sectionTitle,
    topic: plan.topic,
    conceptKey: plan.skill.conceptKey,
    skillKey: plan.skill.skillKey,
    coverageCellKey: plan.coverageCellKey,
    armDecisionMode: plan.armDecisionMode,
    deliveredDifficulty: plan.decision.difficulty,
    deliveredDepth: plan.decision.depth,
    declaredDifficulty: plan.declaredDecision.difficulty,
    declaredDepth: plan.declaredDecision.depth,
    effectiveDifficulty: plan.effectiveDecision.difficulty,
    effectiveDepth: plan.effectiveDecision.depth,
    masteryBefore: outcomeModel.masteryBefore,
    masteryAfter: skillState.mastery,
    exposureCountBefore: outcomeModel.exposureCountBefore,
    novelty: outcomeModel.novelty,
    difficultyCapacity: outcomeModel.difficultyCapacity,
    depthNeed: outcomeModel.depthNeed,
    difficultyGap: outcomeModel.difficultyGap,
    depthGap: outcomeModel.depthGap,
    hardPenalty: outcomeModel.hardPenalty,
    easyPenalty: outcomeModel.easyPenalty,
    insufficientDepthPenalty: outcomeModel.insufficientDepthPenalty,
    excessiveDepthPenalty: outcomeModel.excessiveDepthPenalty,
    learningQuality: outcomeModel.learningQuality,
    learningGain: outcomeModel.learningGain,
    immediateBonus: outcomeModel.immediateBonus,
    transferBonus: outcomeModel.transferBonus,
    retentionDecay: outcomeModel.retentionDecay,
    roleOutcomes: {
      precheck: {
        probability: outcomeModel.roleProbabilities.precheck,
        accuracy: precheckSubmission.actualAccuracy,
        totalDurationMs: precheckSubmission.totalDurationMs,
      },
      postcheck: {
        probability: outcomeModel.roleProbabilities.postcheck,
        accuracy: postcheckSubmission.actualAccuracy,
        totalDurationMs: postcheckSubmission.totalDurationMs,
      },
      holdout: {
        probability: outcomeModel.roleProbabilities.holdout,
        accuracy: holdoutSubmission.actualAccuracy,
        totalDurationMs: holdoutSubmission.totalDurationMs,
      },
      delayedRecheck: {
        probability: outcomeModel.roleProbabilities.delayedRecheck,
        accuracy: delayedRecheckSubmission.actualAccuracy,
        totalDurationMs: delayedRecheckSubmission.totalDurationMs,
      },
    },
    syntheticTimeline: plan.timeline,
    episodeId,
    precheckTestId: created.currentStep.test.id,
    postcheckTestId: postcheck.currentStep.test.id,
    holdoutTestId: holdout.currentStep.test.id,
    delayedRecheckTestId: delayedRecheck.currentStep.test.id,
    learningContentSessionId: learningContent.currentStep.learningContent.sessionId,
    generationSources: {
      precheck: precheckTest.generationSource,
      learningContent: learningContent.currentStep.learningContent.generationSource,
      postcheck: postcheckTest.generationSource,
      holdout: holdoutTest.generationSource,
      delayedRecheck: delayedRecheckTest.generationSource,
    },
  };
}

function writeJsonFile(filePath: string, payload: unknown) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function runEduAiNativeSyntheticPipeline(
  options: SyntheticGenerationOptions = {},
): Promise<SyntheticGenerationResult> {
  applySyntheticLlmMode();
  const normalized = normalizeOptions(options);
  const generationRunId = normalized.runId;
  const datasetOrigin = `${SYNTHETIC_DATASET_ORIGIN_PREFIX}_${generationRunId}`
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 64);
  const generationRunDir = path.join(buildGenerationRoot(), generationRunId);
  mkdirSync(generationRunDir, { recursive: true });

  const learners: SyntheticLearnerRuntime[] = [];
  for (let learnerIndex = 0; learnerIndex < normalized.learnerCount; learnerIndex += 1) {
    learners.push(
      await createSyntheticLearnerRuntime({
        runId: generationRunId,
        learnerIndex,
      }),
    );
  }

  const records: Array<
    SyntheticEpisodeAnalyticsRecord & {
      episodeId: string;
      precheckTestId: string;
      postcheckTestId: string;
      holdoutTestId: string;
      delayedRecheckTestId: string;
      learningContentSessionId: string;
      generationSources: {
        precheck: "llm" | "fallback";
        learningContent: "llm" | "fallback";
        postcheck: "llm" | "fallback";
        holdout: "llm" | "fallback";
        delayedRecheck: "llm" | "fallback";
      };
    }
  > = [];

  for (
    let episodeIndex = 0;
    episodeIndex < normalized.episodesPerLearner;
    episodeIndex += 1
  ) {
    for (let learnerIndex = 0; learnerIndex < learners.length; learnerIndex += 1) {
      records.push(
        await runOneEpisode({
          learner: learners[learnerIndex]!,
          learnerIndex,
          episodeIndex,
          episodesPerLearner: normalized.episodesPerLearner,
          questionCount: normalized.questionCount,
          datasetOrigin,
          runId: generationRunId,
        }),
      );
    }
  }

  const profileSummaries = learners.map((learner, learnerIndex) =>
    buildLearnerProfileSummary({
      learnerIndex,
      externalId: learner.externalId,
      latent: learner.latent,
    }),
  );
  const summary = buildGenerationSummary(records);
  const sanityReport = buildSanityReport({
    learners: profileSummaries,
    records,
  });

  const manifestPath = path.join(generationRunDir, "generation_manifest.json");
  const profilesPath = path.join(generationRunDir, "latent_profiles.json");
  const episodesPath = path.join(generationRunDir, "episode_records.json");
  const summaryPath = path.join(generationRunDir, "generation_summary.json");
  const sanityJsonPath = path.join(generationRunDir, "sanity_report.json");
  const sanityMarkdownPath = path.join(generationRunDir, "sanity_report.md");

  const profiles = learners.map((learner, learnerIndex) => ({
    externalId: learner.externalId,
    email: learner.email,
    displayName: learner.displayName,
    subjectIdsByTitle: learner.subjectIdsByTitle,
    sectionIdsBySkillKey: learner.sectionIdsBySkillKey,
    profileSummary: profileSummaries[learnerIndex],
    latent: learner.latent,
  }));

  writeJsonFile(profilesPath, profiles);
  writeJsonFile(episodesPath, records);
  writeJsonFile(summaryPath, summary);
  writeJsonFile(sanityJsonPath, sanityReport);
  writeFileSync(sanityMarkdownPath, buildSanityMarkdown(sanityReport), "utf8");

  const exportedSnapshot = await exportTrainingDatasetSnapshot(prisma, {
    phase: "synthetic",
    timeRangeDays: normalized.exportTimeRangeDays,
    maxEpisodes: normalized.learnerCount * normalized.episodesPerLearner,
    completedOnly: true,
    consentOnly: false,
  });

  const manifest = {
    schemaVersion: SYNTHETIC_GENERATION_SCHEMA_VERSION,
    syntheticWorldSchemaVersion: SYNTHETIC_WORLD_SCHEMA_VERSION,
    stage: "synthetic_internal_bridge",
    generatedAtIso: new Date().toISOString(),
    generationRunId,
    generationRunDir: path.relative(process.cwd(), generationRunDir),
    datasetPhase: "synthetic",
    datasetOrigin,
    learnerCount: normalized.learnerCount,
    episodesPerLearner: normalized.episodesPerLearner,
    questionCount: normalized.questionCount,
    syntheticLimits: [
      "This is a synthetic internal bridge stage, not real-user validation.",
      "Synthetic outcomes are driven by transparent learner traits and explicit bridge logic rather than runtime deployment behavior.",
      "Good offline metrics here still do not establish external validity for real learners.",
    ],
    syntheticWorldDesign: {
      learnerTraits: [
        "baseline ability",
        "skill-specific mastery and strengths/weaknesses",
        "difficulty sensitivity",
        "depth sensitivity",
        "learning rate",
        "retention strength",
        "noise and inconsistency",
      ],
      decisionCoverage:
        "Episodes deliberately cover easy/medium/hard and brief/standard/detailed under baseline, self_report, and predicted arms with controlled exploration.",
      roleLogic:
        "Precheck, postcheck, holdout, and delayed recheck are simulated with distinct probability rules. Holdout and delayed recheck are not treated as direct copies of postcheck.",
      timeLogic:
        "Synthetic timelines are backfilled so delayed recheck remains a real sequence role with explicit delay metadata while generation stays executable in one run.",
      honesty:
        "Synthetic decision metadata is explicitly marked as synthetic_world_v2 and is not activated for learner-facing serving.",
    },
    sanityArtifacts: {
      json: path.relative(process.cwd(), sanityJsonPath),
      markdown: path.relative(process.cwd(), sanityMarkdownPath),
      ok: sanityReport.ok,
      warnings: sanityReport.warnings,
    },
    exportSnapshot: {
      snapshotId: exportedSnapshot.snapshotId,
      snapshotDir: path.relative(process.cwd(), exportedSnapshot.snapshotDir),
      exportedEpisodes: exportedSnapshot.snapshot.counts.exportedEpisodes,
      exportedRows: exportedSnapshot.snapshot.counts.exportedRows,
      learningContentRows:
        exportedSnapshot.snapshot.counts.rowsBySequenceRole.learning_content ?? 0,
    },
  };

  writeJsonFile(manifestPath, manifest);

  return {
    generationRunId,
    generationRunDir,
    manifestPath,
    profilesPath,
    episodesPath,
    summaryPath,
    sanityJsonPath,
    sanityMarkdownPath,
    datasetOrigin,
    learnerCount: normalized.learnerCount,
    episodeCount: records.length,
    exportedSnapshot: {
      snapshotId: exportedSnapshot.snapshotId,
      snapshotDir: exportedSnapshot.snapshotDir,
      exportedEpisodes: exportedSnapshot.snapshot.counts.exportedEpisodes,
      exportedRows: exportedSnapshot.snapshot.counts.exportedRows,
      learningContentRows:
        exportedSnapshot.snapshot.counts.rowsBySequenceRole.learning_content ?? 0,
    },
  };
}
