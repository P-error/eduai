import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { GET as listEpisodesRoute, POST as createEpisodeRoute } from "@/app/api/evaluation/episodes/route";
import { GET as getEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/route";
import { POST as advanceEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/next/route";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";
import { POST as createSubjectRoute } from "@/app/api/subjects/route";
import { POST as createSectionRoute } from "@/app/api/subjects/[subjectId]/sections/route";

type RouteJson = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function parseJson(response: Response) {
  return (await response.json()) as RouteJson;
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
    assert(question && typeof question === "object", "invalid stored question payload");
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

export async function runOperatorResearchSelfCheck() {
  const stamp = Date.now();
  const externalId = `operator-research-self-check:${stamp}`;
  const email = `operator-research-self-check-${stamp}@eduai.local`;
  const user = await prisma.user.create({
    data: {
      externalId,
      email,
      name: "Operator Research Self Check",
      isAdmin: true,
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

  const token = issueToken({ userId: user.id });

  try {
    const createSubjectResponse = await createSubjectRoute(
      new Request("http://localhost/api/subjects", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          title: "Operator Self-check Calculus",
          description: "Disposable subject for operator workflow verification.",
        }),
      }),
    );
    assert(createSubjectResponse.ok, "create subject route failed");
    const createdSubject = await parseJson(createSubjectResponse);
    const subjectData = createdSubject.data as RouteJson;
    const subjectId = String(subjectData.id ?? "");
    assert(subjectId.length > 0, "missing subject id");

    const createSectionResponse = await createSectionRoute(
      new Request(`http://localhost/api/subjects/${subjectId}/sections`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          title: "Derivative rules",
          description: "Disposable section for operator workflow verification.",
          sortOrder: 0,
        }),
      }),
      { params: Promise.resolve({ subjectId }) },
    );
    assert(createSectionResponse.ok, "create section route failed");
    const createdSection = await parseJson(createSectionResponse);
    const sectionId = String(createdSection.id ?? "");
    assert(sectionId.length > 0, "missing section id");

    const createEpisodeResponse = await createEpisodeRoute(
      new Request("http://localhost/api/evaluation/episodes", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          subjectId,
          sectionId,
          topic: "Derivative rules",
          questionCount: 3,
          mode: "practice",
          personalizationMode: "on",
          assignmentArm: "predicted",
          conceptKey: "derivative_rules",
          skillKey: "apply_derivative_rules",
          includeHoldout: true,
        }),
      }),
    );
    assert(createEpisodeResponse.ok, "create episode route failed");
    const createdEpisode = await parseJson(createEpisodeResponse);
    const createdEpisodeSummary = createdEpisode.episode as RouteJson;
    const createdStep = createdEpisode.currentStep as RouteJson;
    const episodeId = String(createdEpisodeSummary.episodeId ?? "");
    const precheckTest = createdStep.test as RouteJson;
    const precheckTestId = String(precheckTest.id ?? "");
    assert(episodeId.length > 0, "missing episode id");
    assert(createdStep.sequenceRole === "precheck", "expected precheck on start");

    const initialListResponse = await listEpisodesRoute(
      new Request("http://localhost/api/evaluation/episodes?limit=10", {
        method: "GET",
        headers: authHeaders(token),
      }),
    );
    assert(initialListResponse.ok, "episode list route failed");
    const initialList = await parseJson(initialListResponse);
    const initialEpisodes = (initialList.episodes as RouteJson[]) ?? [];
    const initialEntry =
      initialEpisodes.find((item) => item.episodeId === episodeId) ?? null;
    assert(initialEntry, "missing episode in operator episode list");
    assert(initialEntry.arm === "predicted", "operator list arm mismatch");
    assert(
      ((initialEntry.subject as RouteJson | undefined)?.title ?? null) ===
        "Operator Self-check Calculus",
      "operator list subject title mismatch",
    );
    assert(
      ((initialEntry.section as RouteJson | undefined)?.title ?? null) ===
        "Derivative rules",
      "operator list section title mismatch",
    );
    assert(
      ((initialEntry.exportReadiness as RouteJson | undefined)?.ready ?? null) === false,
      "operator list should not be export-ready before completion",
    );

    const detailResponse = await getEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    assert(detailResponse.ok, "episode detail route failed");
    const detailState = await parseJson(detailResponse);
    const detailEpisode = detailState.episode as RouteJson;
    const detailAssignment = detailEpisode.assignment as RouteJson;
    assert(detailEpisode.topic === "Derivative rules", "topic linkage mismatch");
    assert(detailEpisode.conceptKey === "derivative_rules", "concept linkage mismatch");
    assert(detailEpisode.skillKey === "apply_derivative_rules", "skill linkage mismatch");
    assert(detailAssignment.arm === "predicted", "detail assignment arm mismatch");
    assert(
      typeof detailAssignment.backendKind === "string" &&
        detailAssignment.backendKind.length > 0,
      "detail backend provenance missing",
    );

    const precheckSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${precheckTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: await buildCorrectAnswers(precheckTestId, true),
          totalDurationMs: 41_000,
          answerChangeCount: 1,
        }),
      }),
      { params: Promise.resolve({ id: precheckTestId }) },
    );
    assert(precheckSubmit.ok, "precheck submit failed");

    const learningContentResponse = await advanceEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ acknowledgeLearningContent: false }),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    assert(learningContentResponse.ok, "advance to learning content failed");

    const postcheckState = await parseJson(
      await advanceEpisodeRoute(
        new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ acknowledgeLearningContent: true }),
        }),
        { params: Promise.resolve({ id: episodeId }) },
      ),
    );
    const postcheckStep = postcheckState.currentStep as RouteJson;
    const postcheckTest = postcheckStep.test as RouteJson;
    const postcheckTestId = String(postcheckTest.id ?? "");

    const postcheckSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${postcheckTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: await buildCorrectAnswers(postcheckTestId),
          totalDurationMs: 35_000,
          answerChangeCount: 0,
        }),
      }),
      { params: Promise.resolve({ id: postcheckTestId }) },
    );
    assert(postcheckSubmit.ok, "postcheck submit failed");

    const holdoutState = await parseJson(
      await advanceEpisodeRoute(
        new Request(`http://localhost/api/evaluation/episodes/${episodeId}/next`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ acknowledgeLearningContent: false }),
        }),
        { params: Promise.resolve({ id: episodeId }) },
      ),
    );
    const holdoutStep = holdoutState.currentStep as RouteJson;
    const holdoutTest = holdoutStep.test as RouteJson;
    const holdoutTestId = String(holdoutTest.id ?? "");

    const holdoutSubmit = await submitTestRoute(
      new Request(`http://localhost/api/tests/${holdoutTestId}/submit`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          answers: await buildCorrectAnswers(holdoutTestId),
          totalDurationMs: 32_000,
          answerChangeCount: 0,
        }),
      }),
      { params: Promise.resolve({ id: holdoutTestId }) },
    );
    assert(holdoutSubmit.ok, "holdout submit failed");

    const finalDetailResponse = await getEpisodeRoute(
      new Request(`http://localhost/api/evaluation/episodes/${episodeId}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      { params: Promise.resolve({ id: episodeId }) },
    );
    assert(finalDetailResponse.ok, "final episode detail route failed");
    const finalState = await parseJson(finalDetailResponse);
    const finalEpisode = finalState.episode as RouteJson;
    const finalCurrentStep = finalState.currentStep as RouteJson;
    assert(finalEpisode.status === "completed", "episode should be completed");
    assert(finalCurrentStep.status === "completed", "current step should be completed");

    const finalListResponse = await listEpisodesRoute(
      new Request("http://localhost/api/evaluation/episodes?limit=10", {
        method: "GET",
        headers: authHeaders(token),
      }),
    );
    assert(finalListResponse.ok, "final episode list route failed");
    const finalList = await parseJson(finalListResponse);
    const finalEpisodes = (finalList.episodes as RouteJson[]) ?? [];
    const finalEntry = finalEpisodes.find((item) => item.episodeId === episodeId) ?? null;
    assert(finalEntry, "missing episode in final operator episode list");
    assert(
      ((finalEntry.exportReadiness as RouteJson | undefined)?.ready ?? null) === true,
      "operator list should mark completed episode as export-ready",
    );

    return {
      ok: true,
      episodeId,
      subjectId,
      sectionId,
      initialExportReady: (initialEntry.exportReadiness as RouteJson).ready,
      finalExportReady: (finalEntry.exportReadiness as RouteJson).ready,
      finalStatus: finalEpisode.status,
      sequenceCompleted: (finalEpisode.sequence as RouteJson).completed,
    };
  } finally {
    await cleanupSelfCheckUser(user.id);
    await prisma.$disconnect();
  }
}
