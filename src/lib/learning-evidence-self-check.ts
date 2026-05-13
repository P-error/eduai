import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";
import { buildEvaluationEpisodeSummary } from "@/lib/evaluation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSubmitRequest(token: string, testId: string) {
  return new Request(`http://localhost/api/tests/${testId}/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
    body: JSON.stringify({
      answers: [0],
      totalDurationMs: 12000,
      perQuestionFirstAnswerMs: [5000],
      answerChangeCount: 0,
    }),
  });
}

async function responseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function submitTest(token: string, testId: string) {
  const response = await submitTestRoute(buildSubmitRequest(token, testId), {
    params: Promise.resolve({ id: testId }),
  });
  const payload = await responseJson<{
    score?: number;
    meta?: {
      evidence?: {
        path?: { kind?: string; canonical?: boolean };
        learning?: {
          eligible?: boolean;
          status?: string;
          exclusionReasonCode?: string | null;
        };
        adaptive?: {
          updatesState?: boolean;
          impactKind?: string;
        };
        signals?: {
          chatSecondary?: boolean;
        };
      };
    } | null;
  }>(response);

  assert(response.ok, `submit must succeed for ${testId}`);

  return payload;
}

async function cleanupUser(userId: string) {
  const [tests, episodes, subjects] = await Promise.all([
    prisma.generatedTest.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.evaluationEpisode.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.subject.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const testIds = tests.map((item) => item.id);
  const episodeIds = episodes.map((item) => item.id);
  const subjectIds = subjects.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    if (testIds.length > 0) {
      await tx.testAttempt.deleteMany({
        where: {
          OR: [{ userId }, { testId: { in: testIds } }],
        },
      });
      await tx.generatedTest.deleteMany({
        where: { id: { in: testIds } },
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

    if (subjectIds.length > 0) {
      await tx.subjectSection.deleteMany({
        where: { subjectId: { in: subjectIds } },
      });
      await tx.subject.deleteMany({
        where: { id: { in: subjectIds } },
      });
    }

    await tx.user.deleteMany({ where: { id: userId } });
  });
}

export async function runLearningEvidenceSelfCheck() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      externalId: `learning-evidence-self-check:${stamp}`,
      email: `learning-evidence-self-check-${stamp}@eduai.local`,
      name: "Learning Evidence Self Check",
    },
  });
  const token = issueToken({ userId: user.id });

  try {
    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: "Evidence Semantics",
      },
    });

    const episode = await prisma.evaluationEpisode.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        objectiveKey: "learning_gain_support_v1",
        protocolKey: "learning_gain_episode_v1",
        policyArm: "predicted",
        primarySignalKind: "test_outcome",
        topic: "Episode evidence topic",
        assignmentJson: {},
        designJson: {},
      },
    });

    const episodeTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        evaluationEpisodeId: episode.id,
        topic: "Episode evidence topic",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Episode question",
            options: ["Correct", "Incorrect"],
            answerIndex: 0,
          },
        ],
        validationMetaJson: {
          learningEligible: true,
          learningExcludedReason: null,
          evaluation: {
            protocolKey: "learning_gain_episode_v1",
            signalQuality: "primary_test",
            touchpointType: "pre_check",
            sequenceRole: "precheck",
            itemRole: "evaluation",
          },
        },
      },
    });

    await prisma.evaluationEpisodeItem.create({
      data: {
        episodeId: episode.id,
        contentKind: "generated_test",
        contentId: episodeTest.id,
        sequenceIndex: 0,
        sequenceRole: "precheck",
        touchpointType: "pre_check",
        signalQuality: "primary_test",
        itemRole: "evaluation",
        itemVariant: "unknown",
        linkageKind: "none",
        linkedContentId: null,
        familyKey: null,
        conceptKey: null,
        skillKey: null,
        holdoutStrategy: "none",
        delayedMinutes: null,
        policyArm: "predicted",
        subjectId: subject.id,
        sectionId: null,
        topic: "Episode evidence topic",
      },
    });

    const customPracticeEligibleTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        topic: "Eligible custom practice",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Practice question",
            options: ["Correct", "Incorrect"],
            answerIndex: 0,
          },
        ],
        validationMetaJson: {
          learningEligible: true,
          learningExcludedReason: null,
        },
      },
    });

    const customPracticeExcludedTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        topic: "Excluded custom practice",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Excluded practice question",
            options: ["Correct", "Incorrect"],
            answerIndex: 0,
          },
        ],
        validationMetaJson: {
          learningEligible: false,
          learningExcludedReason: "FALLBACK_GENERATION",
          fallback: true,
          generationSource: "fallback",
        },
      },
    });

    const episodePayload = await submitTest(token, episodeTest.id);
    assert(
      episodePayload.meta?.evidence?.path?.kind === "learn_episode" &&
        episodePayload.meta.evidence.path.canonical === true,
      "episode submit must be classified as canonical Learn evidence",
    );
    assert(
      episodePayload.meta?.evidence?.learning?.status === "eligible" &&
        episodePayload.meta.evidence.learning.eligible === true,
      "episode submit must stay learning-eligible",
    );
    assert(
      episodePayload.meta?.evidence?.adaptive?.updatesState === true &&
        episodePayload.meta.evidence.adaptive.impactKind === "canonical_learn_update",
      "eligible Learn episode attempt must update adaptive state",
    );
    assert(
      episodePayload.meta?.evidence?.signals?.chatSecondary === true,
      "episode submit must keep dialogue as secondary supporting signal",
    );

    const afterEpisode = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { testsTaken: true },
    });
    assert(
      afterEpisode.testsTaken === 1,
      "eligible episode attempt must increment adaptive testsTaken",
    );

    const episodeSummary = await buildEvaluationEpisodeSummary(prisma, episode.id);
    const primaryOutcome = episodeSummary?.primaryOutcomes[0] ?? null;
    assert(
      primaryOutcome?.learningEligible === true &&
        primaryOutcome?.adaptiveStateUpdated === true,
      "episode summary must persist learning eligibility and adaptive impact",
    );

    const customPracticeEligiblePayload = await submitTest(
      token,
      customPracticeEligibleTest.id,
    );
    assert(
      customPracticeEligiblePayload.meta?.evidence?.path?.kind === "custom_practice" &&
        customPracticeEligiblePayload.meta.evidence.path.canonical === false,
      "standalone custom practice must stay a secondary path",
    );
    assert(
      customPracticeEligiblePayload.meta?.evidence?.adaptive?.updatesState === true &&
        customPracticeEligiblePayload.meta.evidence.adaptive.impactKind ===
          "secondary_practice_update",
      "eligible custom practice must update adaptive state without becoming canonical",
    );

    const afterEligiblePractice = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { testsTaken: true },
    });
    assert(
      afterEligiblePractice.testsTaken === 2,
      "eligible custom practice must still increment adaptive testsTaken",
    );

    const customPracticeExcludedPayload = await submitTest(
      token,
      customPracticeExcludedTest.id,
    );
    assert(
      customPracticeExcludedPayload.meta?.evidence?.learning?.status === "excluded" &&
        customPracticeExcludedPayload.meta.evidence.learning.exclusionReasonCode ===
          "FALLBACK_GENERATION",
      "excluded practice must expose a precise exclusion reason",
    );
    assert(
      customPracticeExcludedPayload.meta?.evidence?.adaptive?.updatesState === false &&
        customPracticeExcludedPayload.meta.evidence.adaptive.impactKind === "record_only",
      "excluded attempt must remain recorded-only without adaptive update",
    );

    const afterExcludedPractice = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { testsTaken: true },
    });
    assert(
      afterExcludedPractice.testsTaken === 2,
      "excluded practice must not increment adaptive testsTaken",
    );

    return {
      ok: true,
      checks: [
        "learn episode submit -> recorded + learning-eligible + canonical adaptive update",
        "episode summary persists learning eligibility and adaptive impact",
        "eligible custom practice -> secondary path + adaptive update",
        "excluded custom practice -> recorded only + explicit exclusion reason",
      ],
    };
  } finally {
    await cleanupUser(user.id);
  }
}
