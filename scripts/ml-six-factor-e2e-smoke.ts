import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import {
  buildOptionalSixFactorDeliveredConfigMetadata,
  isMlSixFactorConfig,
} from "@/lib/ml-six-factor-decision-metadata";

type CliOptions = {
  out: string;
  keepRecords: boolean;
};

type CleanupCounts = {
  chatMessages: number;
  chatSessions: number;
  evaluationItems: number;
  generatedTests: number;
  evaluationEpisodes: number;
  subjects: number;
  users: number;
};

const DEFAULT_OUT =
  "exports/ml_e2e_smoke_real_user_training_observations.jsonl" as const;
const REQUIRED_FACTOR_KEYS = [
  "difficulty",
  "depth",
  "support_level",
  "presentation_format",
  "examples_level",
  "terminology_level",
] as const;
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
    out: DEFAULT_OUT,
    keepRecords: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[index + 1] ?? DEFAULT_OUT;
      index += 1;
    } else if (arg === "--keep-records") {
      options.keepRecords = true;
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
    .replace(/\.\d{3}Z$/, "");
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SMOKE_ASSERTION_FAILED: ${message}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonFromStdout(stdout: string) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Could not parse export summary JSON from stdout: ${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
}

function parseJsonl(filePath: string) {
  if (!existsSync(filePath)) {
    throw new Error(`Exported JSONL file is missing: ${filePath}`);
  }
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function hasAllSixFactors(value: unknown) {
  const record = asRecord(value);
  return REQUIRED_FACTOR_KEYS.every((key) => key in record) && isMlSixFactorConfig(record);
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

async function cleanupSmokeRecords(prisma: PrismaClient, runId: string) {
  const episodes = await prisma.evaluationEpisode.findMany({
    where: { datasetOrigin: runId },
    select: { id: true },
  });
  const episodeIds = episodes.map((episode) => episode.id);
  const users = await prisma.user.findMany({
    where: { externalId: runId },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (episodeIds.length === 0 && userIds.length === 0) {
    return {
      chatMessages: 0,
      chatSessions: 0,
      evaluationItems: 0,
      generatedTests: 0,
      evaluationEpisodes: 0,
      subjects: 0,
      users: 0,
    } satisfies CleanupCounts;
  }
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

  const counts: CleanupCounts = {
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
            where: { userId: { in: userIds }, title: runId },
          })).count
        : 0,
    users:
      userIds.length > 0
        ? (await prisma.user.deleteMany({
            where: { id: { in: userIds } },
          })).count
        : 0,
  };

  return counts;
}

function runLiveExport(params: { outPath: string; runId: string }) {
  mkdirSync(path.dirname(params.outPath), { recursive: true });
  const exportArgs = [
    "scripts/export-real-user-training-observations.sh",
    "--out",
    params.outPath,
    "--limit",
    "1000",
    "--include-outcome-missing",
    "--dataset-origin-prefix",
    params.runId,
  ];
  const result = spawnSync("bash", exportArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "LIVE_EXPORT_FAILED",
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return parseJsonFromStdout(result.stdout);
}

async function createSmokeRecords(params: {
  prisma: PrismaClient;
  runId: string;
  outPath: string;
}) {
  const now = new Date();
  const decisionCreatedAt = new Date(now.getTime() + 30_000);
  const outcomeObservedAt = new Date(now.getTime() + 8 * 60_000);
  const topic = `${params.runId}_topic`;
  const conceptKey = `${params.runId}_concept`;
  const skillKey = `${params.runId}_skill`;
  const familyKey = `${params.runId}_family`;
  const smokeEnv = {
    ...process.env,
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    EDUAI_SIX_FACTOR_ARTIFACT_PATH:
      process.env.EDUAI_SIX_FACTOR_ARTIFACT_PATH ??
      "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json",
  };

  await cleanupSmokeRecords(params.prisma, params.runId);

  const user = await params.prisma.user.create({
    data: {
      externalId: params.runId,
      email: `${params.runId}@example.invalid`,
      name: "ML E2E Smoke",
      researchConsentAt: now,
      researchConsentVersion: "ml_e2e_smoke_v1",
      declaredPreferencesJson: toJsonValue({
        difficulty: "medium",
        depth: "standard",
        presentation_format: "step_by_step",
        smokeRunId: params.runId,
      }),
      personalizationReady: true,
    },
    select: { id: true },
  });
  const subject = await params.prisma.subject.create({
    data: {
      userId: user.id,
      title: params.runId,
      description: "Controlled ML six-factor E2E smoke subject.",
    },
    select: { id: true },
  });
  const episode = await params.prisma.evaluationEpisode.create({
    data: {
      userId: user.id,
      clientKey: params.runId,
      subjectId: subject.id,
      datasetPhase: "real",
      datasetOrigin: params.runId,
      objectiveKey: "learning_gain_support_v1",
      protocolKey: "ml_six_factor_e2e_smoke_v1",
      status: "completed",
      policyArm: "predicted",
      primarySignalKind: "tests_primary_learning_signal",
      topic,
      conceptKey,
      skillKey,
      assignmentJson: toJsonValue({
        schemaVersion: "ml_e2e_smoke_assignment_v1",
        arm: "predicted",
        runtimePolicyId: "six_factor_e2e_smoke",
        backendKind: "ml_policy",
        smokeRunId: params.runId,
      }),
      designJson: toJsonValue({
        schemaVersion: "ml_e2e_smoke_design_v1",
        expectedSequenceRoles: ["precheck", "learning_content", "postcheck"],
        expectedTouchpoints: ["pre_check", "content_delivery", "post_check"],
        smokeRunId: params.runId,
      }),
    },
    select: { id: true },
  });

  const featureContext = {
    userRef: user.id,
    subjectRef: subject.id,
    topicRef: conceptKey,
    conceptKey,
    skillKey,
    familyKey,
    topic,
    sessionRef: episode.id,
    priorAttemptsCount: 3,
    priorCorrectRate: 0.4,
    recentCorrectRate: 0.5,
    recentAttemptsCount: 2,
    topicSeenCount: 1,
    minutesSinceLastActivity: 12,
    sessionPosition: 2,
    previousDifficulty: "medium",
    previousDepth: "standard",
    declaredPreferences: {
      difficulty: "medium",
      depth: "standard",
      presentation_format: "step_by_step",
    },
    policyId: "six_factor_e2e_smoke",
    backendKind: "ml_policy",
    modelVersion: null,
    postScore: 1,
    nextStepSuccess: true,
    normalizedLearningGain: 1,
  };
  const applyResult = buildAppliedSixFactorPromptInstructions({
    context: featureContext,
    env: smokeEnv,
    path: "learning_content",
  });
  assertSmoke(applyResult.applied, "EDUAI_SIX_FACTOR_APPLY must apply instructions");
  assertSmoke(
    applyResult.metadata.decisionSource === "ml_policy",
    "valid artifact smoke should use ml_policy decision source",
  );
  assertSmoke(
    applyResult.metadata.appliedToLearnerFacingOutput === true,
    "apply metadata must mark learner-facing application",
  );
  assertSmoke(
    applyResult.metadata.candidateCount != null &&
      applyResult.metadata.candidateCount > 0,
    "ML metadata must include candidateCount",
  );
  for (const factorKey of REQUIRED_FACTOR_KEYS) {
    assertSmoke(
      applyResult.promptInstructionBlock.includes(`${factorKey}:`),
      `prompt instructions must include ${factorKey}`,
    );
  }
  for (const forbidden of FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS) {
    assertSmoke(
      !(forbidden in asRecord(applyResult.metadata.featuresSnapshot)),
      `featuresSnapshot must not include ${forbidden}`,
    );
  }

  const basePrompt =
    "Generate learning content strictly from the smoke learning package.";
  const appliedPrompt = `${basePrompt}\n\n${applyResult.promptInstructionBlock}`;
  const technicalTestFormat = { response_format: "mcq" as const };
  assertSmoke(
    technicalTestFormat.response_format === "mcq",
    "technical test response_format must remain mcq",
  );

  const sixFactorDeliveredConfig = buildOptionalSixFactorDeliveredConfigMetadata({
    sixFactorShadow: applyResult.metadata,
    decisionCreatedAt,
    featuresCutoffAt: decisionCreatedAt,
    appliedPath: "learning_content",
    warnings: [`smoke_run_id:${params.runId}`],
  });
  assertSmoke(sixFactorDeliveredConfig, "delivered_config metadata must exist");
  assertSmoke(
    hasAllSixFactors(sixFactorDeliveredConfig.candidateConfig),
    "candidateConfig must include valid six-factor config",
  );
  assertSmoke(
    hasAllSixFactors(sixFactorDeliveredConfig.deliveredConfig),
    "deliveredConfig must include valid six-factor config",
  );
  assertSmoke(
    sixFactorDeliveredConfig.appliedToLearnerFacingOutput === true,
    "canonical metadata must preserve applied=true",
  );

  const precheck = await params.prisma.generatedTest.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      evaluationEpisodeId: episode.id,
      llmModel: "deterministic_smoke",
      promptTemplateKey: "ml_e2e_smoke_precheck",
      validationMetaJson: toJsonValue({
        smokeRunId: params.runId,
        response_format: "mcq",
      }),
      topic,
      questionCount: 2,
      mode: "quiz",
      questionsJson: toJsonValue([
        {
          id: "precheck_q1",
          question: "Smoke precheck question",
          options: ["A", "B"],
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
        attemptId: `${params.runId}_precheck_attempt`,
        accuracy: 0.4,
        questionCount: 2,
        totalDurationMs: 60_000,
        submittedAtIso: new Date(now.getTime() + 15_000).toISOString(),
        learningEligible: true,
        learningSkipReason: null,
        adaptiveStateUpdated: false,
      }),
      outcomeRecordedAt: new Date(now.getTime() + 15_000),
    },
  });

  const session = await params.prisma.chatSession.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      evaluationEpisodeId: episode.id,
      llmModel: "deterministic_smoke",
      promptTemplateKey: "ml_e2e_smoke_learning_content",
      promptTemplateSnapshot: appliedPrompt,
      declaredPreferencesJson: toJsonValue({
        difficulty: "medium",
        depth: "standard",
        smokeRunId: params.runId,
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
        "Controlled smoke learning content. The LLM is not called during this check.",
      signalsJson: toJsonValue({
        source: "ml_e2e_smoke",
        smokeRunId: params.runId,
        promptInstructionFactorKeys: REQUIRED_FACTOR_KEYS,
        promptInstructionCount: 6,
        technicalTestFormat,
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
        difficulty: "medium",
        depth: "standard",
      }),
      decisionRuntimeJson: toJsonValue({
        smokeRunId: params.runId,
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
      llmModel: "deterministic_smoke",
      promptTemplateKey: "ml_e2e_smoke_postcheck",
      validationMetaJson: toJsonValue({
        smokeRunId: params.runId,
        response_format: "mcq",
      }),
      topic,
      questionCount: 2,
      mode: "quiz",
      questionsJson: toJsonValue([
        {
          id: "postcheck_q1",
          question: "Smoke postcheck question",
          options: ["A", "B"],
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
        attemptId: `${params.runId}_postcheck_attempt`,
        accuracy: 0.8,
        questionCount: 2,
        totalDurationMs: 75_000,
        submittedAtIso: outcomeObservedAt.toISOString(),
        learningEligible: true,
        learningSkipReason: null,
        adaptiveStateUpdated: false,
      }),
      outcomeRecordedAt: outcomeObservedAt,
    },
  });

  const exportSummary = runLiveExport({
    outPath: params.outPath,
    runId: params.runId,
  });
  const rows = parseJsonl(params.outPath);
  const exported = rows.find((row) => {
    const ids = asRecord(row.ids);
    return ids.session_ref === episode.id && ids.content_event_ref === session.id;
  });
  assertSmoke(exported, "live export must contain the smoke learning-content row");
  assertSmoke(
    asRecord(exported.source).source_kind === "real_user",
    "exported observation source_kind must be real_user",
  );
  assertSmoke(
    hasAllSixFactors(exported.candidate_config),
    "exported candidate_config must include six valid factors",
  );
  assertSmoke(
    hasAllSixFactors(exported.delivered_config),
    "exported delivered_config must include six valid factors",
  );
  const leakageGuard = asRecord(exported.leakage_guard);
  assertSmoke(
    leakageGuard.uses_only_pre_decision_data === true,
    "exported leakage_guard must preserve pre-decision guard",
  );
  const preDecisionFeatures = asRecord(exported.pre_decision_features);
  for (const forbidden of FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS) {
    assertSmoke(
      !(forbidden in preDecisionFeatures),
      `exported pre_decision_features must not include ${forbidden}`,
    );
  }
  const outcome = asRecord(exported.outcome);
  assertSmoke(outcome.outcome_available === true, "exported outcome must be available");
  assertSmoke(
    typeof outcome.normalized_learning_gain === "number" &&
      outcome.normalized_learning_gain >= 0 &&
      outcome.normalized_learning_gain <= 1,
    "normalized_learning_gain must be computed and clamped 0..1",
  );
  assertSmoke(
    new Date(String(asRecord(exported.timestamps).outcome_observed_at)).getTime() >
      new Date(String(asRecord(exported.timestamps).decision_created_at)).getTime(),
    "outcome_observed_at must be after decision_created_at",
  );

  return {
    runId: params.runId,
    flags: {
      EDUAI_SIX_FACTOR_SHADOW: smokeEnv.EDUAI_SIX_FACTOR_SHADOW,
      EDUAI_SIX_FACTOR_ML_POLICY: smokeEnv.EDUAI_SIX_FACTOR_ML_POLICY,
      EDUAI_SIX_FACTOR_APPLY: smokeEnv.EDUAI_SIX_FACTOR_APPLY,
      EDUAI_SIX_FACTOR_ARTIFACT_PATH: smokeEnv.EDUAI_SIX_FACTOR_ARTIFACT_PATH,
    },
    decision: {
      decisionSource: applyResult.metadata.decisionSource,
      modelVersion: applyResult.metadata.modelVersion,
      artifactPath: applyResult.metadata.artifactPath,
      fallbackUsed: applyResult.metadata.fallbackUsed,
      candidateCount: applyResult.metadata.candidateCount,
      warnings: applyResult.metadata.warnings,
    },
    apply: {
      applied: applyResult.applied,
      appliedToLearnerFacingOutput:
        sixFactorDeliveredConfig.appliedToLearnerFacingOutput,
      promptInstructionCount: applyResult.promptInstructions.length,
      promptContainsAllSixFactors: REQUIRED_FACTOR_KEYS.every((key) =>
        applyResult.promptInstructionBlock.includes(`${key}:`),
      ),
      technicalTestResponseFormat: technicalTestFormat.response_format,
    },
    deliveredConfig: {
      candidateConfig: sixFactorDeliveredConfig.candidateConfig,
      deliveredConfig: sixFactorDeliveredConfig.deliveredConfig,
    },
    createdRecords: {
      userId: user.id,
      subjectId: subject.id,
      episodeId: episode.id,
      contentEventRef: session.id,
      testEventRef: postcheck.id,
    },
    export: {
      out: params.outPath,
      summary: exportSummary,
      exportedRows: rows.length,
    },
    exportedObservationChecks: {
      sourceKind: asRecord(exported.source).source_kind,
      leakageGuard: leakageGuard.uses_only_pre_decision_data,
      outcomeAvailable: outcome.outcome_available,
      normalizedLearningGain: outcome.normalized_learning_gain,
      forbiddenOutcomeFeaturesPresent: FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS.filter(
        (field) => field in preDecisionFeatures,
      ),
    },
    optionalRetraining: {
      status: rows.length < 10 ? "skipped" : "not_run",
      reason:
        rows.length < 10
          ? "dataset_too_small_for_meaningful_train_validation_test_split"
          : "run training command manually if needed",
      observationCount: rows.length,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outPath = path.resolve(process.cwd(), options.out);
  const runId = `ml_e2e_smoke_${timestampForRunId()}`;
  const prisma = new PrismaClient();
  let cleanup: CleanupCounts | null = null;

  try {
    await ensureDbReady(prisma);
    const result = await createSmokeRecords({ prisma, runId, outPath });
    if (!options.keepRecords) {
      cleanup = await cleanupSmokeRecords(prisma, runId);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          db: "connected",
          ...result,
          cleanup: {
            performed: !options.keepRecords,
            counts: cleanup,
          },
        },
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
    if (!options.keepRecords) {
      try {
        await cleanupSmokeRecords(prisma, runId);
      } catch {
        // Очистка smoke-записей не должна скрывать основную причину сбоя.
      }
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

main();
