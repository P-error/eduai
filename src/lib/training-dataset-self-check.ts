import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  buildEvaluationAssignment,
  buildEvaluationEpisodeDesign,
  resolveEvaluationPolicySelection,
  STRUCTURED_EVALUATION_PROTOCOL_KEY,
} from "@/lib/evaluation";
import {
  advanceLearningEpisode,
  createLearningEpisode,
  getLearningEpisodeState,
} from "@/lib/learning-episode";
import { exportTrainingDatasetSnapshot } from "@/lib/training-dataset";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";

type GeneratedTestUser = {
  id: string;
  personalizationReady: boolean;
  declaredPreferencesJson: unknown;
  effectivePreferencesJson: unknown;
};

type StepWithTest = {
  test: {
    id: string;
  } | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function authHeaders(token: string) {
  return {
    "content-type": "application/json",
    cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
  };
}

async function buildAnswers(testId: string, invert = false) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: testId },
    select: {
      questionsJson: true,
    },
  });

  assert(test && Array.isArray(test.questionsJson), "missing generated test");

  return test.questionsJson.map((question) => {
    assert(question && typeof question === "object", "invalid question payload");
    const root = question as { answerIndex?: unknown; options?: unknown };
    const answerIndex = Number(root.answerIndex);
    const optionsCount = Array.isArray(root.options) ? root.options.length : 0;
    assert(Number.isInteger(answerIndex), "invalid answer index");
    assert(optionsCount > 0, "missing answer options");
    return invert ? (answerIndex + 1) % optionsCount : answerIndex;
  });
}

async function submitStepTest(params: {
  token: string;
  step: StepWithTest;
  invert?: boolean;
  totalDurationMs: number;
}) {
  assert(params.step.test?.id, "expected test step");
  const testId = params.step.test.id;
  const answers = await buildAnswers(testId, params.invert);
  const response = await submitTestRoute(
    new Request(`http://localhost/api/tests/${testId}/submit`, {
      method: "POST",
      headers: authHeaders(params.token),
      body: JSON.stringify({
        answers,
        totalDurationMs: params.totalDurationMs,
        answerChangeCount: params.invert ? 1 : 0,
      }),
    }),
    { params: Promise.resolve({ id: testId }) },
  );
  assert(response.ok, `submit failed for test ${testId}`);
}

async function cleanupSelfCheckUser(userId: string) {
  const [tests, sessions, episodes] = await Promise.all([
    prisma.generatedTest.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.chatSession.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.evaluationEpisode.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const testIds = tests.map((item) => item.id);
  const sessionIds = sessions.map((item) => item.id);
  const episodeIds = episodes.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    if (testIds.length > 0) {
      await tx.testAttempt.deleteMany({
        where: {
          OR: [{ userId }, { testId: { in: testIds } }],
        },
      });
      await tx.tagAssignment.deleteMany({
        where: { testId: { in: testIds } },
      });
      await tx.generatedTest.deleteMany({
        where: { id: { in: testIds } },
      });
    }

    if (sessionIds.length > 0) {
      await tx.chatMessage.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.chatSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    if (episodeIds.length > 0) {
      await tx.evaluationEpisodeItem.deleteMany({
        where: { episodeId: { in: episodeIds } },
      });
      await tx.evaluationEpisode.deleteMany({
        where: { id: { in: episodeIds } },
      });
    }

    await tx.userTagStat.deleteMany({ where: { userId } });
    await tx.subject.deleteMany({ where: { userId } });
    await tx.collection.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

async function completeEpisode(params: {
  user: GeneratedTestUser;
  token: string;
  subjectId: string;
  phase: "real";
  origin: string;
}) {
  const created = await createLearningEpisode(params.user, {
    subjectId: params.subjectId,
    topic: `${params.phase} dataset self-check`,
    questionCount: 3,
    mode: "practice",
    personalizationMode: "on",
    assignmentArm: "predicted",
    conceptKey: `${params.phase}_concept`,
    skillKey: `${params.phase}_skill`,
    datasetPhase: params.phase,
    datasetOrigin: params.origin,
  });
  assert(created.episode, "expected created episode summary");
  const episodeId = created.episode.episodeId;

  await submitStepTest({
    token: params.token,
    step: created.currentStep,
    invert: false,
    totalDurationMs: 31_000,
  });

  const learningContent = await advanceLearningEpisode(
    params.user,
    episodeId,
    false,
  );
  assert(
    learningContent.currentStep.sequenceRole === "learning_content",
    "expected learning content step",
  );

  const postcheck = await advanceLearningEpisode(
    params.user,
    episodeId,
    true,
  );
  assert(
    postcheck.currentStep.sequenceRole === "postcheck",
    "expected postcheck step",
  );

  await submitStepTest({
    token: params.token,
    step: postcheck.currentStep,
    invert: false,
    totalDurationMs: 28_000,
  });

  const finalState = await getLearningEpisodeState(
    params.user.id,
    episodeId,
  );
  assert(finalState.episode, "expected final episode summary");
  assert(finalState.episode.status === "completed", "episode should be completed");

  return episodeId;
}

async function seedSyntheticEpisode(params: {
  userId: string;
  subjectId: string;
  stamp: number;
}) {
  const selection = resolveEvaluationPolicySelection({
    surface: "test",
    requestedArm: "predicted",
    personalizationMode: "on",
  });
  const assignment = buildEvaluationAssignment({
    selection,
    runtimePolicyId: "synthetic_training_seed_runtime_v1",
    backendKind: "synthetic_seed",
    backendId: "synthetic_self_check_backend",
  });
  const createdAt = new Date();
  const deliveredAt = new Date(createdAt.getTime() + 60_000);
  const contentAt = new Date(createdAt.getTime() + 180_000);
  const outcomeAt = new Date(createdAt.getTime() + 360_000);
  const pedagogicalDecision = {
    difficulty: "medium",
    depth: "standard",
  };
  const decisionRuntime = {
    runtimePolicyId: "synthetic_training_seed_runtime_v1",
    backendKind: "synthetic_seed",
    backendId: "synthetic_self_check_backend",
  };

  const episode = await prisma.evaluationEpisode.create({
    data: {
      userId: params.userId,
      subjectId: params.subjectId,
      datasetPhase: "synthetic",
      datasetOrigin: "synthetic_self_check",
      objectiveKey: "learning_gain_support_v1",
      protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
      status: "completed",
      policyArm: assignment.arm,
      primarySignalKind: "tests_primary_learning_signal",
      topic: "synthetic dataset self-check",
      conceptKey: "synthetic_concept",
      skillKey: "synthetic_skill",
      assignmentJson: assignment,
      designJson: buildEvaluationEpisodeDesign({
        protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
        expectedSequenceRoles: [
          "precheck",
          "learning_content",
          "postcheck",
        ],
        holdoutStrategy: "none",
        itemVariant: "unknown",
      }),
      createdAt,
      updatedAt: outcomeAt,
    },
  });

  await prisma.evaluationEpisodeItem.createMany({
    data: [
      {
        episodeId: episode.id,
        contentKind: "generated_test",
        contentId: `synthetic-precheck-${params.stamp}`,
        sequenceIndex: 1,
        sequenceRole: "precheck",
        touchpointType: "pre_check",
        signalQuality: "primary_test",
        itemRole: "evaluation",
        itemVariant: "unknown",
        linkageKind: "none",
        linkedContentId: null,
        familyKey: `synthetic_family_${params.stamp}`,
        conceptKey: "synthetic_concept",
        skillKey: "synthetic_skill",
        holdoutStrategy: "none",
        delayedMinutes: null,
        policyArm: assignment.arm,
        subjectId: params.subjectId,
        sectionId: null,
        topic: "synthetic dataset self-check",
        pedagogicalDecisionJson: pedagogicalDecision,
        decisionRuntimeJson: decisionRuntime,
        outcomeJson: {
          attemptId: `synthetic-attempt-precheck-${params.stamp}`,
          accuracy: 0.34,
          questionCount: 3,
          totalDurationMs: 32_000,
          submittedAtIso: deliveredAt.toISOString(),
          learningEligible: true,
        },
        deliveredAt,
        outcomeRecordedAt: deliveredAt,
      },
      {
        episodeId: episode.id,
        contentKind: "chat_session",
        contentId: `synthetic-learning-${params.stamp}`,
        sequenceIndex: 2,
        sequenceRole: "learning_content",
        touchpointType: "content_delivery",
        signalQuality: "secondary_chat_support",
        itemRole: "supporting_signal",
        itemVariant: "unknown",
        linkageKind: "none",
        linkedContentId: null,
        familyKey: `synthetic_family_${params.stamp}`,
        conceptKey: "synthetic_concept",
        skillKey: "synthetic_skill",
        holdoutStrategy: "none",
        delayedMinutes: null,
        policyArm: assignment.arm,
        subjectId: params.subjectId,
        sectionId: null,
        topic: "synthetic dataset self-check",
        pedagogicalDecisionJson: pedagogicalDecision,
        decisionRuntimeJson: decisionRuntime,
        outcomeJson: Prisma.JsonNull,
        deliveredAt: contentAt,
        outcomeRecordedAt: null,
      },
      {
        episodeId: episode.id,
        contentKind: "generated_test",
        contentId: `synthetic-postcheck-${params.stamp}`,
        sequenceIndex: 3,
        sequenceRole: "postcheck",
        touchpointType: "post_check",
        signalQuality: "primary_test",
        itemRole: "evaluation",
        itemVariant: "unknown",
        linkageKind: "none",
        linkedContentId: null,
        familyKey: `synthetic_family_${params.stamp}`,
        conceptKey: "synthetic_concept",
        skillKey: "synthetic_skill",
        holdoutStrategy: "none",
        delayedMinutes: null,
        policyArm: assignment.arm,
        subjectId: params.subjectId,
        sectionId: null,
        topic: "synthetic dataset self-check",
        pedagogicalDecisionJson: pedagogicalDecision,
        decisionRuntimeJson: decisionRuntime,
        outcomeJson: {
          attemptId: `synthetic-attempt-postcheck-${params.stamp}`,
          accuracy: 1,
          questionCount: 3,
          totalDurationMs: 24_000,
          submittedAtIso: outcomeAt.toISOString(),
          learningEligible: true,
        },
        deliveredAt: outcomeAt,
        outcomeRecordedAt: outcomeAt,
      },
    ],
  });

  return episode.id;
}

export async function runTrainingDatasetSelfCheck() {
  const stamp = Date.now();
  const tempRoot = path.join(
    process.env.TMPDIR || "/tmp",
    `eduai-training-dataset-self-check-${stamp}`,
  );
  const externalId = `training-dataset-self-check:${stamp}`;
  const email = `training-dataset-self-check-${stamp}@eduai.local`;

  const user = await prisma.user.create({
    data: {
      externalId,
      email,
      name: "Training Dataset Self Check",
      personalizationReady: true,
      researchConsentAt: new Date(),
      researchConsentVersion: "v1_2026_03",
      declaredPreferencesJson: {
        tone: "formal",
        explanation_style: "stepwise",
        response_format: "mcq",
        difficulty_target: "medium",
      },
      effectivePreferencesJson: {
        tone: "formal",
        explanation_style: "stepwise",
        response_format: "mcq",
        difficulty_target: "medium",
      },
    },
  });

  const subject = await prisma.subject.create({
    data: {
      userId: user.id,
      title: "Training Dataset Self-check Subject",
      description: "Disposable subject for training dataset export verification.",
    },
  });

  const token = issueToken({ userId: user.id });

  const generatedTestUser: GeneratedTestUser = {
    id: user.id,
    personalizationReady: user.personalizationReady,
    declaredPreferencesJson: user.declaredPreferencesJson,
    effectivePreferencesJson: user.effectivePreferencesJson,
  };

  try {
    await completeEpisode({
      user: generatedTestUser,
      token,
      subjectId: subject.id,
      phase: "real",
      origin: "runtime_self_check",
    });
    await seedSyntheticEpisode({
      userId: user.id,
      subjectId: subject.id,
      stamp,
    });

    const syntheticExport = await exportTrainingDatasetSnapshot(prisma, {
      phase: "synthetic",
      timeRangeDays: 1,
      maxEpisodes: 20,
      consentOnly: false,
      outputRoot: tempRoot,
    });
    const realExport = await exportTrainingDatasetSnapshot(prisma, {
      phase: "real",
      timeRangeDays: 1,
      maxEpisodes: 20,
      consentOnly: true,
      outputRoot: tempRoot,
    });

    assert(
      syntheticExport.snapshot.counts.exportedRows > 0,
      "synthetic export must contain rows",
    );
    assert(realExport.snapshot.counts.exportedRows > 0, "real export must contain rows");
    assert(
      syntheticExport.snapshot.records.every(
        (record) => record.datasetPhase === "synthetic",
      ),
      "synthetic snapshot leaked non-synthetic rows",
    );
    assert(
      realExport.snapshot.records.every((record) => record.datasetPhase === "real"),
      "real snapshot leaked non-real rows",
    );
    assert(
      existsSync(syntheticExport.files.dataset.path) &&
        existsSync(realExport.files.dataset.path),
      "exported dataset files are missing",
    );

    const syntheticSchema = readFileSync(syntheticExport.files.schema.path, "utf8");
    const realSchema = readFileSync(realExport.files.schema.path, "utf8");
    assert(
      syntheticSchema === realSchema,
      "synthetic and real schema contracts diverged",
    );

    return {
      ok: true,
      syntheticRows: syntheticExport.snapshot.counts.exportedRows,
      realRows: realExport.snapshot.counts.exportedRows,
      syntheticSnapshotDir: syntheticExport.snapshotDir,
      realSnapshotDir: realExport.snapshotDir,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    await cleanupSelfCheckUser(user.id);
    await prisma.$disconnect();
  }
}
