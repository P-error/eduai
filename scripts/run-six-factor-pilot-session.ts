import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import {
  buildOptionalSixFactorDeliveredConfigMetadata,
  isMlSixFactorConfig,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  EXAMPLES_LEVEL_VALUES,
  PRESENTATION_FORMAT_VALUES,
  SUPPORT_LEVEL_VALUES,
  TERMINOLOGY_LEVEL_VALUES,
} from "@/lib/ml-six-factor-policy-contract";

type CliOptions = {
  sessions: number;
  userPrefix: string;
  subject: string;
  topic: string;
  out: string;
  artifact: string;
  mockContent: boolean;
  liveContent: boolean;
  includeOutcomeMissing: boolean;
  cleanup: boolean;
  seed: number;
};

type PilotSessionSummary = {
  sessionIndex: number;
  userId: string;
  episodeId: string;
  contentEventRef: string;
  testEventRef: string;
  decisionSource: string;
  fallbackUsed: boolean;
  appliedToLearnerFacingOutput: boolean;
  deliveredConfig: Record<string, unknown>;
  preScore: number;
  postScore: number;
};

const DEFAULT_OUT = "exports/pilot_real_user_training_observations.jsonl" as const;
const REQUIRED_FACTOR_KEYS = [
  "difficulty",
  "depth",
  "support_level",
  "presentation_format",
  "examples_level",
  "terminology_level",
] as const;
const FACTOR_VALUES = {
  difficulty: DIFFICULTY_VALUES,
  depth: DEPTH_VALUES,
  support_level: SUPPORT_LEVEL_VALUES,
  presentation_format: PRESENTATION_FORMAT_VALUES,
  examples_level: EXAMPLES_LEVEL_VALUES,
  terminology_level: TERMINOLOGY_LEVEL_VALUES,
} as const;
const FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS = [
  "pre_score",
  "post_score",
  "max_score",
  "next_step_success",
  "normalized_learning_gain",
  "outcome_available",
  "outcome",
] as const;

class DbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbUnavailableError";
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    sessions: 10,
    userPrefix: "ml_pilot_user",
    subject: "ML Pilot Subject",
    topic: "ML Pilot Topic",
    out: DEFAULT_OUT,
    artifact: "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json",
    mockContent: false,
    liveContent: false,
    includeOutcomeMissing: false,
    cleanup: false,
    seed: 42,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sessions") {
      options.sessions = readPositiveInteger(argv[index + 1], options.sessions);
      index += 1;
    } else if (arg === "--user-prefix") {
      options.userPrefix = readNonEmptyString(argv[index + 1], options.userPrefix);
      index += 1;
    } else if (arg === "--subject") {
      options.subject = readNonEmptyString(argv[index + 1], options.subject);
      index += 1;
    } else if (arg === "--topic") {
      options.topic = readNonEmptyString(argv[index + 1], options.topic);
      index += 1;
    } else if (arg === "--out") {
      options.out = readNonEmptyString(argv[index + 1], options.out);
      index += 1;
    } else if (arg === "--artifact") {
      options.artifact = readNonEmptyString(argv[index + 1], options.artifact);
      index += 1;
    } else if (arg === "--mock-content") {
      options.mockContent = true;
    } else if (arg === "--live-content") {
      options.liveContent = true;
    } else if (arg === "--include-outcome-missing") {
      options.includeOutcomeMissing = true;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    } else if (arg === "--seed") {
      options.seed = readInteger(argv[index + 1], options.seed);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.liveContent) {
    throw new Error(
      "LIVE_CONTENT_NOT_IMPLEMENTED: use --mock-content for the controlled pilot runner.",
    );
  }
  if (!options.mockContent) {
    options.mockContent = true;
  }

  return options;
}

function readNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function readInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
}

function readPositiveInteger(value: unknown, fallback: number) {
  return Math.max(1, Math.min(500, readInteger(value, fallback)));
}

function timestampForRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertPilot(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`PILOT_ASSERTION_FAILED: ${message}`);
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
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
    prisma.evaluationEpisode.count(),
    prisma.evaluationEpisodeItem.count(),
    prisma.generatedTest.count(),
    prisma.chatSession.count(),
    prisma.chatMessage.count(),
  ]);
}

function hasAllSixFactors(value: unknown) {
  const record = asRecord(value);
  return REQUIRED_FACTOR_KEYS.every((key) => key in record) && isMlSixFactorConfig(record);
}

function effectiveConfigForAbility(baseAbility: number) {
  if (baseAbility < 0.38) {
    return {
      difficulty: "easy",
      depth: "detailed",
      support_level: "scaffolded",
      presentation_format: "step_by_step",
      examples_level: "multiple",
      terminology_level: "simple",
    } as const;
  }
  if (baseAbility > 0.72) {
    return {
      difficulty: "hard",
      depth: "brief",
      support_level: "minimal",
      presentation_format: "structured_list",
      examples_level: "single",
      terminology_level: "technical",
    } as const;
  }
  return {
    difficulty: "medium",
    depth: "standard",
    support_level: "guided",
    presentation_format: "step_by_step",
    examples_level: "single",
    terminology_level: "balanced",
  } as const;
}

function configMatchScore(
  deliveredConfig: Record<string, unknown>,
  effectiveConfig: Record<string, unknown>,
) {
  const matches = REQUIRED_FACTOR_KEYS.filter(
    (key) => deliveredConfig[key] === effectiveConfig[key],
  ).length;
  return matches / REQUIRED_FACTOR_KEYS.length;
}

function buildMockOutcome(params: {
  sessionIndex: number;
  random: () => number;
  deliveredConfig: Record<string, unknown>;
}) {
  const baseAbility = 0.25 + params.random() * 0.58;
  const priorCorrectRate = clamp01(baseAbility + (params.random() - 0.5) * 0.22);
  const recentCorrectRate = clamp01(priorCorrectRate + (params.random() - 0.5) * 0.24);
  const effectiveConfig = effectiveConfigForAbility(baseAbility);
  const matchScore = configMatchScore(params.deliveredConfig, effectiveConfig);
  const noise = (params.random() - 0.5) * 0.16;
  const postScore = clamp01(
    0.12 +
      baseAbility * 0.34 +
      recentCorrectRate * 0.22 +
      matchScore * 0.28 +
      (params.sessionIndex % 4) * 0.025 +
      noise,
  );

  return {
    baseAbility,
    priorCorrectRate,
    recentCorrectRate,
    preScore: priorCorrectRate,
    postScore,
    nextStepSuccess: postScore >= 0.7,
    effectiveConfig,
    matchScore,
  };
}

function runExport(params: {
  outPath: string;
  datasetOriginPrefix: string;
  includeOutcomeMissing: boolean;
}) {
  mkdirSync(path.dirname(params.outPath), { recursive: true });
  const exportArgs = [
    "scripts/export-real-user-training-observations.sh",
    "--out",
    params.outPath,
    "--limit",
    "1000",
    "--dataset-origin-prefix",
    params.datasetOriginPrefix,
  ];
  if (params.includeOutcomeMissing) {
    exportArgs.push("--include-outcome-missing");
  }

  const result = spawnSync("bash", exportArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      ["PILOT_EXPORT_FAILED", result.stdout.trim(), result.stderr.trim()]
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

async function cleanupPilotRecords(prisma: PrismaClient, runPrefix: string) {
  const episodes = await prisma.evaluationEpisode.findMany({
    where: { datasetOrigin: { startsWith: runPrefix } },
    select: { id: true },
  });
  const episodeIds = episodes.map((episode) => episode.id);
  const users = await prisma.user.findMany({
    where: { externalId: { startsWith: runPrefix } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const sessions = await prisma.chatSession.findMany({
    where: {
      OR: [
        episodeIds.length > 0
          ? { evaluationEpisodeId: { in: episodeIds } }
          : undefined,
        userIds.length > 0 ? { userId: { in: userIds } } : undefined,
      ].filter(Boolean) as Prisma.ChatSessionWhereInput[],
    },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);
  const tests = await prisma.generatedTest.findMany({
    where: {
      OR: [
        episodeIds.length > 0
          ? { evaluationEpisodeId: { in: episodeIds } }
          : undefined,
        userIds.length > 0 ? { userId: { in: userIds } } : undefined,
      ].filter(Boolean) as Prisma.GeneratedTestWhereInput[],
    },
    select: { id: true },
  });
  const testIds = tests.map((test) => test.id);

  return {
    chatMessages:
      sessionIds.length > 0
        ? (await prisma.chatMessage.deleteMany({
            where: { sessionId: { in: sessionIds } },
          })).count
        : 0,
    chatSessions:
      sessionIds.length > 0
        ? (await prisma.chatSession.deleteMany({
            where: { id: { in: sessionIds } },
          })).count
        : 0,
    evaluationItems:
      episodeIds.length > 0
        ? (await prisma.evaluationEpisodeItem.deleteMany({
            where: { episodeId: { in: episodeIds } },
          })).count
        : 0,
    generatedTests:
      testIds.length > 0
        ? (await prisma.generatedTest.deleteMany({
            where: { id: { in: testIds } },
          })).count
        : 0,
    evaluationEpisodes:
      episodeIds.length > 0
        ? (await prisma.evaluationEpisode.deleteMany({
            where: { id: { in: episodeIds } },
          })).count
        : 0,
    subjects:
      userIds.length > 0
        ? (await prisma.subject.deleteMany({
            where: { userId: { in: userIds } },
          })).count
        : 0,
    users:
      userIds.length > 0
        ? (await prisma.user.deleteMany({
            where: { id: { in: userIds } },
          })).count
        : 0,
  };
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function factorDistribution(rows: Record<string, unknown>[]) {
  const distribution: Record<string, Record<string, number>> = {};
  for (const key of REQUIRED_FACTOR_KEYS) {
    distribution[key] = {};
    for (const value of FACTOR_VALUES[key]) {
      distribution[key][value] = 0;
    }
  }

  for (const row of rows) {
    const deliveredConfig = asRecord(row.delivered_config);
    for (const key of REQUIRED_FACTOR_KEYS) {
      const value = deliveredConfig[key];
      if (typeof value === "string") {
        increment(distribution[key], value);
      }
    }
  }

  return distribution;
}

async function createPilotSession(params: {
  prisma: PrismaClient;
  options: CliOptions;
  runPrefix: string;
  sessionIndex: number;
  random: () => number;
}) {
  const sequence = params.sessionIndex + 1;
  const runId = `${params.runPrefix}_${String(sequence).padStart(3, "0")}`;
  const now = new Date(Date.now() + sequence * 60_000);
  const decisionCreatedAt = new Date(now.getTime() + 30_000);
  const precheckObservedAt = new Date(now.getTime() + 10_000);
  const outcomeObservedAt = new Date(now.getTime() + 8 * 60_000);
  const topic = `${params.options.topic} ${sequence}`;
  const conceptKey = `${runId}_concept`;
  const skillKey = `${runId}_skill`;
  const familyKey = `${runId}_family`;
  const sessionPosition = (params.sessionIndex % 5) + 1;
  const baseDecisionDifficulty =
    params.sessionIndex % 3 === 0
      ? "easy"
      : params.sessionIndex % 3 === 1
        ? "medium"
        : "hard";
  const baseDecisionDepth =
    params.sessionIndex % 3 === 0
      ? "detailed"
      : params.sessionIndex % 3 === 1
        ? "standard"
        : "brief";
  const smokeEnv = {
    ...process.env,
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    EDUAI_SIX_FACTOR_ARTIFACT_PATH: params.options.artifact,
  };

  const user = await params.prisma.user.create({
    data: {
      externalId: `${runId}_${params.options.userPrefix}`,
      email: `${runId}@example.invalid`,
      name: `ML Pilot User ${sequence}`,
      researchConsentAt: now,
      researchConsentVersion: "ml_six_factor_pilot_runner_v1",
      declaredPreferencesJson: toJsonValue({
        difficulty: baseDecisionDifficulty,
        depth: baseDecisionDepth,
        presentation_format: "step_by_step",
        pilotRunId: params.runPrefix,
        mockContent: params.options.mockContent,
      }),
      personalizationReady: true,
    },
    select: { id: true },
  });
  const subject = await params.prisma.subject.create({
    data: {
      userId: user.id,
      title: params.options.subject,
      description: `Controlled six-factor pilot subject for ${runId}.`,
    },
    select: { id: true },
  });

  const preliminaryOutcome = buildMockOutcome({
    sessionIndex: params.sessionIndex,
    random: params.random,
    deliveredConfig: effectiveConfigForAbility(0.5),
  });
  const featureContext = {
    userRef: user.id,
    subjectRef: subject.id,
    topicRef: conceptKey,
    conceptKey,
    skillKey,
    familyKey,
    topic,
    priorAttemptsCount: 2 + (params.sessionIndex % 6),
    priorCorrectRate: preliminaryOutcome.priorCorrectRate,
    recentCorrectRate: preliminaryOutcome.recentCorrectRate,
    recentAttemptsCount: 1 + (params.sessionIndex % 4),
    topicSeenCount: params.sessionIndex % 3,
    minutesSinceLastActivity: 5 + params.sessionIndex * 3,
    sessionPosition,
    previousDifficulty: baseDecisionDifficulty,
    previousDepth: baseDecisionDepth,
    declaredPreferences: {
      difficulty: baseDecisionDifficulty,
      depth: baseDecisionDepth,
      presentation_format: "step_by_step",
    },
    policyId: "six_factor_pilot_runner_v1",
    backendKind: "ml_policy",
    modelVersion: null,
  };

  const episode = await params.prisma.evaluationEpisode.create({
    data: {
      userId: user.id,
      clientKey: runId,
      subjectId: subject.id,
      datasetPhase: "real",
      datasetOrigin: params.runPrefix,
      objectiveKey: "learning_gain_support_v1",
      protocolKey: "ml_six_factor_pilot_runner_v1",
      status: "completed",
      policyArm: "predicted",
      primarySignalKind: "tests_primary_learning_signal",
      topic,
      conceptKey,
      skillKey,
      assignmentJson: toJsonValue({
        schemaVersion: "ml_six_factor_pilot_assignment_v1",
        arm: "predicted",
        runtimePolicyId: "six_factor_pilot_runner_v1",
        backendKind: "ml_policy",
        pilotRunId: params.runPrefix,
        mockContent: params.options.mockContent,
      }),
      designJson: toJsonValue({
        schemaVersion: "ml_six_factor_pilot_design_v1",
        expectedSequenceRoles: ["precheck", "learning_content", "postcheck"],
        expectedTouchpoints: ["pre_check", "content_delivery", "post_check"],
        pilotRunId: params.runPrefix,
      }),
    },
    select: { id: true },
  });

  const applyResult = buildAppliedSixFactorPromptInstructions({
    context: {
      ...featureContext,
      sessionRef: episode.id,
    },
    env: smokeEnv,
    path: "learning_content",
  });
  assertPilot(applyResult.applied, "six-factor apply must be enabled in pilot process");

  for (const factorKey of REQUIRED_FACTOR_KEYS) {
    assertPilot(
      applyResult.promptInstructionBlock.includes(`${factorKey}:`),
      `prompt instructions must include ${factorKey}`,
    );
  }

  const sixFactorDeliveredConfig = buildOptionalSixFactorDeliveredConfigMetadata({
    sixFactorShadow: applyResult.metadata,
    decisionCreatedAt,
    featuresCutoffAt: decisionCreatedAt,
    appliedPath: "learning_content",
    warnings: [
      `pilot_run_id:${params.runPrefix}`,
      "controlled_mock_pilot_data_not_real_educational_effect",
    ],
  });
  assertPilot(sixFactorDeliveredConfig, "sixFactorDeliveredConfig must be created");
  assertPilot(
    hasAllSixFactors(sixFactorDeliveredConfig.deliveredConfig),
    "deliveredConfig must include all six valid factors",
  );

  const finalOutcome = buildMockOutcome({
    sessionIndex: params.sessionIndex,
    random: params.random,
    deliveredConfig: sixFactorDeliveredConfig.deliveredConfig,
  });

  const precheck = await params.prisma.generatedTest.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      evaluationEpisodeId: episode.id,
      llmModel: "deterministic_mock_pilot",
      promptTemplateKey: "ml_six_factor_pilot_precheck",
      validationMetaJson: toJsonValue({
        pilotRunId: params.runPrefix,
        response_format: "mcq",
        mockContent: true,
      }),
      topic,
      questionCount: 4,
      mode: "quiz",
      questionsJson: toJsonValue([
        {
          id: `${runId}_precheck_q1`,
          question: "Controlled pilot precheck question",
          options: ["A", "B", "C", "D"],
          answer: "A",
          response_format: "mcq",
        },
      ]),
    },
    select: { id: true },
  });
  await params.prisma.evaluationEpisodeItem.create({
    data: {
      episodeId: episode.id,
      contentKind: "generated_test",
      contentId: precheck.id,
      sequenceIndex: 1,
      sequenceRole: "precheck",
      touchpointType: "pre_check",
      signalQuality: "primary_test",
      itemRole: "evaluation",
      itemVariant: "unknown",
      linkageKind: "none",
      familyKey,
      conceptKey,
      skillKey,
      holdoutStrategy: "none",
      policyArm: "predicted",
      subjectId: subject.id,
      topic,
      outcomeJson: toJsonValue({
        attemptId: `${runId}_precheck_attempt`,
        accuracy: finalOutcome.preScore,
        questionCount: 4,
        totalDurationMs: 50_000 + params.sessionIndex * 1000,
        submittedAtIso: precheckObservedAt.toISOString(),
        learningEligible: true,
        learningSkipReason: null,
        adaptiveStateUpdated: false,
      }),
      outcomeRecordedAt: precheckObservedAt,
    },
  });

  const appliedPrompt = [
    "Generate learning content strictly from the controlled pilot package.",
    applyResult.promptInstructionBlock,
  ].join("\n\n");
  const session = await params.prisma.chatSession.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      evaluationEpisodeId: episode.id,
      llmModel: "deterministic_mock_pilot",
      promptTemplateKey: "ml_six_factor_pilot_learning_content",
      promptTemplateSnapshot: appliedPrompt,
      declaredPreferencesJson: toJsonValue({
        difficulty: baseDecisionDifficulty,
        depth: baseDecisionDepth,
        pilotRunId: params.runPrefix,
      }),
      personalizationReady: true,
    },
    select: { id: true },
  });
  await params.prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content:
        "Controlled mock pilot learning content. External LLM/API is not called.",
      signalsJson: toJsonValue({
        source: "ml_six_factor_pilot_runner",
        pilotRunId: params.runPrefix,
        mockContent: true,
        promptInstructionFactorKeys: REQUIRED_FACTOR_KEYS,
        promptInstructionCount: 6,
        effectiveConfigDiagnostic: finalOutcome.effectiveConfig,
        matchScoreDiagnostic: finalOutcome.matchScore,
        technicalTestFormat: { response_format: "mcq" },
        sixFactorShadow: applyResult.metadata,
        sixFactorDeliveredConfig,
      }),
    },
  });
  await params.prisma.evaluationEpisodeItem.create({
    data: {
      episodeId: episode.id,
      contentKind: "chat_session",
      contentId: session.id,
      sequenceIndex: 2,
      sequenceRole: "learning_content",
      touchpointType: "content_delivery",
      signalQuality: "secondary_chat_support",
      itemRole: "training",
      itemVariant: "unknown",
      linkageKind: "none",
      familyKey,
      conceptKey,
      skillKey,
      holdoutStrategy: "none",
      policyArm: "predicted",
      subjectId: subject.id,
      topic,
      pedagogicalDecisionJson: toJsonValue({
        difficulty: baseDecisionDifficulty,
        depth: baseDecisionDepth,
      }),
      decisionRuntimeJson: toJsonValue({
        pilotRunId: params.runPrefix,
        mockContent: true,
        sixFactorShadow: applyResult.metadata,
        sixFactorDeliveredConfig,
      }),
      deliveredAt: decisionCreatedAt,
    },
  });

  const postcheck = await params.prisma.generatedTest.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      evaluationEpisodeId: episode.id,
      llmModel: "deterministic_mock_pilot",
      promptTemplateKey: "ml_six_factor_pilot_postcheck",
      validationMetaJson: toJsonValue({
        pilotRunId: params.runPrefix,
        response_format: "mcq",
        mockContent: true,
      }),
      topic,
      questionCount: 4,
      mode: "quiz",
      questionsJson: toJsonValue([
        {
          id: `${runId}_postcheck_q1`,
          question: "Controlled pilot postcheck question",
          options: ["A", "B", "C", "D"],
          answer: "A",
          response_format: "mcq",
        },
      ]),
    },
    select: { id: true },
  });
  await params.prisma.evaluationEpisodeItem.create({
    data: {
      episodeId: episode.id,
      contentKind: "generated_test",
      contentId: postcheck.id,
      sequenceIndex: 3,
      sequenceRole: "postcheck",
      touchpointType: "post_check",
      signalQuality: "primary_test",
      itemRole: "evaluation",
      itemVariant: "isomorphic_same_skill",
      linkageKind: "none",
      linkedContentId: session.id,
      familyKey,
      conceptKey,
      skillKey,
      holdoutStrategy: "none",
      policyArm: "predicted",
      subjectId: subject.id,
      topic,
      outcomeJson: toJsonValue({
        attemptId: `${runId}_postcheck_attempt`,
        accuracy: finalOutcome.postScore,
        questionCount: 4,
        totalDurationMs: 65_000 + params.sessionIndex * 1500,
        submittedAtIso: outcomeObservedAt.toISOString(),
        learningEligible: true,
        learningSkipReason: null,
        adaptiveStateUpdated: false,
      }),
      outcomeRecordedAt: outcomeObservedAt,
    },
  });

  assertPilot(
    outcomeObservedAt.getTime() > decisionCreatedAt.getTime(),
    "outcome timestamp must be after decision timestamp",
  );

  return {
    sessionIndex: sequence,
    userId: user.id,
    episodeId: episode.id,
    contentEventRef: session.id,
    testEventRef: postcheck.id,
    decisionSource: applyResult.metadata.decisionSource,
    fallbackUsed: applyResult.metadata.fallbackUsed,
    appliedToLearnerFacingOutput:
      sixFactorDeliveredConfig.appliedToLearnerFacingOutput,
    deliveredConfig: sixFactorDeliveredConfig.deliveredConfig,
    preScore: finalOutcome.preScore,
    postScore: finalOutcome.postScore,
  } satisfies PilotSessionSummary;
}

function summarizePilot(params: {
  options: CliOptions;
  runPrefix: string;
  sessions: PilotSessionSummary[];
  exportSummary: Record<string, unknown>;
  exportedRows: Record<string, unknown>[];
  validation: ReturnType<typeof runValidation>;
  cleanupCounts: Record<string, number> | null;
}) {
  const decisionSourceCounts: Record<string, number> = {};
  let fallbackUsedCount = 0;
  let appliedCount = 0;

  for (const session of params.sessions) {
    increment(decisionSourceCounts, session.decisionSource);
    if (session.fallbackUsed) fallbackUsedCount += 1;
    if (session.appliedToLearnerFacingOutput) appliedCount += 1;
  }

  const leakageViolations = params.exportedRows.filter((row) => {
    const guard = asRecord(row.leakage_guard);
    const pre = asRecord(row.pre_decision_features);
    return (
      guard.uses_only_pre_decision_data !== true ||
      FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS.some((field) => field in pre)
    );
  }).length;

  return {
    ok: params.validation.ok && params.exportedRows.length > 0,
    mode: params.options.mockContent ? "mock-content" : "live-content",
    runPrefix: params.runPrefix,
    sessionsRequested: params.options.sessions,
    sessionsCreated: params.sessions.length,
    outputPath: path.resolve(process.cwd(), params.options.out),
    exportSummary: params.exportSummary,
    observationsExported: params.exportedRows.length,
    withOutcome: params.exportedRows.filter(
      (row) => asRecord(row.outcome).outcome_available === true,
    ).length,
    withoutOutcome: params.exportedRows.filter(
      (row) => asRecord(row.outcome).outcome_available !== true,
    ).length,
    leakageViolations,
    decisionSourceCounts,
    fallbackUsedCount,
    appliedToLearnerFacingOutputCount: appliedCount,
    factorDistribution: factorDistribution(params.exportedRows),
    validation: params.validation,
    cleanup: {
      requested: params.options.cleanup,
      counts: params.cleanupCounts,
    },
    limitations: [
      "controlled/mock pilot data is not evidence of real educational effect",
      "external LLM/API is not called in --mock-content mode",
      "retraining is intentionally not run by this pilot runner",
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runPrefix = `ml_pilot_${timestampForRunId()}_seed${options.seed}`;
  const prisma = new PrismaClient();
  const random = mulberry32(options.seed);
  const sessions: PilotSessionSummary[] = [];
  let cleanupCounts: Record<string, number> | null = null;

  try {
    await ensureDbReady(prisma);

    for (let index = 0; index < options.sessions; index += 1) {
      sessions.push(
        await createPilotSession({
          prisma,
          options,
          runPrefix,
          sessionIndex: index,
          random,
        }),
      );
    }

    const exportSummary = runExport({
      outPath: options.out,
      datasetOriginPrefix: runPrefix,
      includeOutcomeMissing: options.includeOutcomeMissing,
    });
    const exportedRows = parseJsonl(options.out);
    const validation = runValidation(options.out);
    if (!validation.ok) {
      throw new Error(
        ["PILOT_EXPORT_VALIDATION_FAILED", validation.stdout, validation.stderr]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (options.cleanup) {
      cleanupCounts = await cleanupPilotRecords(prisma, runPrefix);
    }

    console.log(
      JSON.stringify(
        summarizePilot({
          options,
          runPrefix,
          sessions,
          exportSummary,
          exportedRows,
          validation,
          cleanupCounts,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    if (isDbUnavailable(error)) {
      console.error(
        "DB_UNAVAILABLE: Prisma cannot reach the dev database or required tables.",
      );
      console.log(
        JSON.stringify(
          {
            ok: false,
            code: "DB_UNAVAILABLE",
            databaseUrlPresent:
              typeof process.env.DATABASE_URL === "string" &&
              process.env.DATABASE_URL.trim().length > 0,
            hint:
              "Start the dev PostgreSQL database and apply migrations, for example: npm run db:up && npm run prisma:migrate:deploy.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main();
