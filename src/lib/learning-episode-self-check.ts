import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { getEvaluationEpisodeExport } from "@/lib/evaluation";
import {
  isMlSixFactorConfig,
  readSixFactorDeliveredConfigMetadata,
} from "@/lib/ml-six-factor-decision-metadata";
import { POST as createEpisodeRoute } from "@/app/api/evaluation/episodes/route";
import { GET as getEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/route";
import { POST as advanceEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/next/route";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";

type RouteJson = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function parseJson(response: Response) {
  return (await response.json()) as RouteJson;
}

async function assertOkResponse(response: Response, message: string) {
  if (response.ok) return;
  let detail = "";
  try {
    detail = JSON.stringify(await response.json());
  } catch {
    detail = await response.text().catch(() => "");
  }
  throw new Error(`${message}: ${response.status} ${detail.slice(0, 500)}`);
}

function authHeaders(token: string) {
  return {
    "content-type": "application/json",
    cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
  };
}

async function buildCorrectAnswers(testId: string, invert = false) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: testId },
    select: {
      questionsJson: true,
    },
  });

  assert(test && Array.isArray(test.questionsJson), "missing generated test");
  return test.questionsJson.map((question) => {
    assert(
      question && typeof question === "object",
      "invalid stored question payload",
    );
    const root = question as { answerIndex?: unknown; options?: unknown };
    const answerIndex = Number(root.answerIndex);
    const optionsCount = Array.isArray(root.options) ? root.options.length : 0;
    assert(Number.isInteger(answerIndex), "invalid answer index");
    assert(optionsCount > 0, "missing options");
    if (!invert) {
      return answerIndex;
    }
    return (answerIndex + 1) % optionsCount;
  });
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

export async function runLearningEpisodeSelfCheck() {
  const stamp = Date.now();
  const externalId = `learning-episode-self-check:${stamp}`;
  const email = `learning-episode-self-check-${stamp}@eduai.local`;
  const user = await prisma.user.create({
    data: {
      externalId,
      email,
      name: "Learning Episode Self Check",
      personalizationReady: true,
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
      title: "Self-check Algebra",
      description: "Disposable subject for episode flow verification.",
    },
  });

  const token = issueToken({ userId: user.id });

  try {
    const createResponse = await createEpisodeRoute(
      new Request("http://localhost/api/evaluation/episodes", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          subjectId: subject.id,
          topic: "Linear equations",
          questionCount: 3,
          mode: "practice",
          personalizationMode: "on",
          assignmentArm: "predicted",
          conceptKey: "linear_equations",
          skillKey: "solve_linear_equation",
          includeHoldout: true,
        }),
      }),
    );
    await assertOkResponse(createResponse, "create episode route failed");
    const created = await parseJson(createResponse);
    const episode = created.episode as RouteJson;
    const currentStep = created.currentStep as RouteJson;
    const episodeId = String(episode.episodeId ?? "");
    const precheckTest = currentStep.test as RouteJson;
    const precheckTestId = String(precheckTest.id ?? "");
    assert(episodeId.length > 0, "missing episode id");
    assert(
      currentStep.sequenceRole === "precheck" &&
        currentStep.contentKind === "generated_test",
      "expected precheck test on episode start",
    );
    const precheckRecord = await prisma.generatedTest.findUnique({
      where: { id: precheckTestId },
      select: { validationMetaJson: true },
    });
    const precheckSixFactor = readSixFactorDeliveredConfigMetadata(
      precheckRecord?.validationMetaJson,
    );
    assert(
      precheckSixFactor &&
        isMlSixFactorConfig(precheckSixFactor.deliveredConfig) &&
        precheckSixFactor.appliedToLearnerFacingOutput === true,
      "precheck must include applied complete six-factor delivered config",
    );
    assert(
      precheckSixFactor.decisionSource !== "legacy_derived" &&
        precheckSixFactor.policyId !== "prediction_runtime_v1_2026_03",
      "precheck must not use the old two-factor runtime as the primary source",
    );

    const precheckAnswers = await buildCorrectAnswers(precheckTestId, true);
    const precheckSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${precheckTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: precheckAnswers,
          totalDurationMs: 42_000,
          answerChangeCount: 1,
        }),
      }),
      { params: Promise.resolve({ id: precheckTestId }) },
    );
    await assertOkResponse(precheckSubmit, "precheck submit failed");

    const learningContentResponse = await advanceEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ acknowledgeLearningContent: false }),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    await assertOkResponse(
      learningContentResponse,
      "advance to learning content failed",
    );
    const learningContentState = await parseJson(learningContentResponse);
    const learningContentStep = learningContentState.currentStep as RouteJson;
    assert(
      learningContentStep.sequenceRole === "learning_content" &&
        learningContentStep.contentKind === "chat_session",
      "expected learning-content step after precheck",
    );
    const learningContent = learningContentStep.learningContent as RouteJson;
    const mlPersonalization = learningContent.mlPersonalization as RouteJson;
    const selectedConfig = mlPersonalization.selected_config as RouteJson;
    assert(
      isMlSixFactorConfig(selectedConfig),
      "learning-content API view must expose all six personalization factors",
    );
    assert(
      typeof (learningContent.pedagogicalContext as RouteJson).supportLevel ===
        "string" &&
        typeof (learningContent.pedagogicalContext as RouteJson)
          .presentationFormat === "string",
      "learning-content pedagogicalContext must include six-factor fields",
    );

    const learningAckState = await parseJson(
      await advanceEpisodeRoute(
        new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ acknowledgeLearningContent: false }),
        }),
        { params: Promise.resolve({ id: episodeId }) },
      ),
    );
    assert(
      (learningAckState.currentStep as RouteJson).status ===
        "acknowledge_learning_content",
      "learning content should require explicit acknowledgement",
    );

    const postcheckResponse = await advanceEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ acknowledgeLearningContent: true }),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    await assertOkResponse(postcheckResponse, "advance to postcheck failed");
    const postcheckState = await parseJson(postcheckResponse);
    const postcheckTest = (postcheckState.currentStep as RouteJson).test as RouteJson;
    const postcheckTestId = String(postcheckTest.id ?? "");
    const postcheckAnswers = await buildCorrectAnswers(postcheckTestId);
    const postcheckSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${postcheckTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: postcheckAnswers,
          totalDurationMs: 36_000,
          answerChangeCount: 0,
        }),
      }),
      { params: Promise.resolve({ id: postcheckTestId }) },
    );
    await assertOkResponse(postcheckSubmit, "postcheck submit failed");

    const holdoutResponse = await advanceEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ acknowledgeLearningContent: false }),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    await assertOkResponse(holdoutResponse, "advance to holdout failed");
    const holdoutState = await parseJson(holdoutResponse);
    const holdoutTest = (holdoutState.currentStep as RouteJson).test as RouteJson;
    const holdoutTestId = String(holdoutTest.id ?? "");
    const holdoutAnswers = await buildCorrectAnswers(holdoutTestId);
    const holdoutSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${holdoutTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: holdoutAnswers,
          totalDurationMs: 33_000,
          answerChangeCount: 0,
        }),
      }),
      { params: Promise.resolve({ id: holdoutTestId }) },
    );
    await assertOkResponse(holdoutSubmit, "holdout submit failed");

    const stateResponse = await getEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    await assertOkResponse(stateResponse, "episode state route failed");
    const finalState = await parseJson(stateResponse);
    const finalEpisode = finalState.episode as RouteJson;
    const finalCurrentStep = finalState.currentStep as RouteJson;
    assert(finalEpisode.status === "completed", "episode should be completed");
    assert(finalCurrentStep.status === "completed", "current step should be completed");

    const exportResult = await getEvaluationEpisodeExport(prisma, {
      timeRangeDays: 1,
      maxEpisodes: 20,
      format: "json",
    });
    const exportedEpisodes = JSON.parse(exportResult.content) as Array<RouteJson>;
    const exportedEpisode = exportedEpisodes.find(
      (candidate) => candidate.episodeId === episodeId,
    );
    assert(exportedEpisode, "episode missing from evaluation export");
    assert(exportedEpisode.status === "completed", "exported episode not completed");
    assert(
      (exportedEpisode.counts as RouteJson).chatItems === 1,
      "expected one learning-content chat item",
    );
    assert(
      (exportedEpisode.counts as RouteJson).testItems === 3,
      "expected precheck/postcheck/holdout test items",
    );
    const exportedItems = exportedEpisode.items as RouteJson[];
    const exportedLearningItem = exportedItems.find(
      (item) => item.sequenceRole === "learning_content",
    );
    const exportedDecisionRuntime = exportedLearningItem?.decisionRuntime as RouteJson;
    const exportedSixFactor = readSixFactorDeliveredConfigMetadata(
      exportedDecisionRuntime,
    );
    assert(
      exportedSixFactor &&
        isMlSixFactorConfig(exportedSixFactor.deliveredConfig),
      "evaluation export must retain all six factors in decisionRuntimeJson",
    );
    const storedLearningItem = await prisma.evaluationEpisodeItem.findFirst({
      where: {
        episodeId,
        sequenceRole: "learning_content",
      },
      select: {
        pedagogicalDecisionJson: true,
      },
    });
    const exportedPedagogicalDecision =
      storedLearningItem?.pedagogicalDecisionJson as RouteJson;
    assert(
      exportedPedagogicalDecision.compatibilityRole ===
        "derived_two_factor_projection",
      "exported pedagogicalDecision must be marked as derived compatibility",
    );

    return {
      ok: true,
      episodeId,
      exportStatus: exportedEpisode.status,
      stepStatus: finalCurrentStep.status,
      counts: exportedEpisode.counts,
    };
  } finally {
    await cleanupSelfCheckUser(user.id);
    await prisma.$disconnect();
  }
}
