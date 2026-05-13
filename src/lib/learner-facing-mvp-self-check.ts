import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { getEvaluationEpisodeExport } from "@/lib/evaluation";
import { POST as createEpisodeRoute } from "@/app/api/evaluation/episodes/route";
import { GET as getEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/route";
import { POST as dialogueEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/dialogue/route";
import { POST as advanceEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/next/route";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";
import {
  advanceLearnerEpisode,
  loadLearnerEpisode,
  sendLearnerEpisodeDialogueTurn,
  startLearnerEpisode,
  submitLearnerEpisodeTest,
  type LearnerEpisodeState,
} from "@/lib/learner-episode-client";

type RouteJson = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function authHeaders(token: string, init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
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

function extractEpisodeId(state: LearnerEpisodeState) {
  const episodeId = state.episode.episodeId;
  assert(typeof episodeId === "string" && episodeId.length > 0, "missing episode id");
  return episodeId;
}

function extractCurrentTestId(state: LearnerEpisodeState) {
  const step = state.currentStep;
  assert(step.contentKind === "generated_test" && step.test, "expected generated test step");
  return step.test.id;
}

async function makeRouteFetcher(token: string) {
  return async function routeFetch(input: RequestInfo, init?: RequestInit) {
    const url =
      typeof input === "string"
        ? new URL(input, "http://localhost")
        : new URL(input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = authHeaders(token, init?.headers);
    const request = new Request(url.toString(), {
      ...init,
      method,
      headers,
    });

    if (method === "POST" && url.pathname === "/api/evaluation/episodes") {
      return createEpisodeRoute(request);
    }

    const episodeMatch = url.pathname.match(/^\/api\/evaluation\/episodes\/([^/]+)$/);
    if (method === "GET" && episodeMatch) {
      return getEpisodeRoute(request, {
        params: Promise.resolve({ id: episodeMatch[1] }),
      });
    }

    const episodeNextMatch = url.pathname.match(
      /^\/api\/evaluation\/episodes\/([^/]+)\/next$/,
    );
    if (method === "POST" && episodeNextMatch) {
      return advanceEpisodeRoute(request, {
        params: Promise.resolve({ id: episodeNextMatch[1] }),
      });
    }

    const episodeDialogueMatch = url.pathname.match(
      /^\/api\/evaluation\/episodes\/([^/]+)\/dialogue$/,
    );
    if (method === "POST" && episodeDialogueMatch) {
      return dialogueEpisodeRoute(request, {
        params: Promise.resolve({ id: episodeDialogueMatch[1] }),
      });
    }

    const submitMatch = url.pathname.match(/^\/api\/tests\/([^/]+)\/submit$/);
    if (method === "POST" && submitMatch) {
      return submitTestRoute(request, {
        params: Promise.resolve({ id: submitMatch[1] }),
      });
    }

    throw new Error(`Unhandled self-check route: ${method} ${url.pathname}`);
  };
}

export async function runLearnerFacingMvpSelfCheck() {
  const stamp = Date.now();
  const externalId = `learner-facing-mvp-self-check:${stamp}`;
  const email = `learner-facing-mvp-self-check-${stamp}@eduai.local`;
  const user = await prisma.user.create({
    data: {
      externalId,
      email,
      name: "Learner Facing MVP Self Check",
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
      title: "Self-check Physics",
      description: "Disposable subject for learner-facing MVP verification.",
    },
  });

  const token = issueToken({ userId: user.id });

  try {
    const routeFetch = await makeRouteFetcher(token);

    const created = await startLearnerEpisode(routeFetch, {
      subjectId: subject.id,
      topic: "Newton's second law",
      questionCount: 3,
      mode: "practice",
      personalizationMode: "on",
      assignmentArm: "predicted",
      includeHoldout: true,
    });
    const episodeId = extractEpisodeId(created);
    assert(
      created.currentStep.sequenceRole === "precheck" &&
        created.currentStep.contentKind === "generated_test",
      "expected precheck test on learner flow start",
    );

    const precheckTestId = extractCurrentTestId(created);
    await submitLearnerEpisodeTest(routeFetch, precheckTestId, {
      answers: await buildCorrectAnswers(precheckTestId, true),
      totalDurationMs: 42_000,
      answerChangeCount: 1,
    });

    const restoredAfterPrecheck = await loadLearnerEpisode(routeFetch, episodeId);
    assert(
      restoredAfterPrecheck.currentStep.status === "pending_materialization" &&
        restoredAfterPrecheck.currentStep.sequenceRole === "learning_content",
      "expected pending learning content after restoring submitted precheck",
    );

    const learningStep = await advanceLearnerEpisode(routeFetch, episodeId, false);
    assert(
      learningStep.currentStep.sequenceRole === "learning_content" &&
        learningStep.currentStep.contentKind === "chat_session",
      "expected learning content after advancing learner flow",
    );
    const learningContent =
      learningStep.currentStep.contentKind === "chat_session"
        ? learningStep.currentStep.learningContent
        : null;
    assert(learningContent, "expected learning content payload");
    assert(
      learningContent.dialogueThread.length === 0,
      "expected empty dialogue thread before first learner question",
    );

    const learningDialogueState = await sendLearnerEpisodeDialogueTurn(
      routeFetch,
      episodeId,
      "Can you explain the force-acceleration relationship in simpler terms?",
    );
    assert(
      learningDialogueState.currentStep.sequenceRole === "learning_content" &&
        learningDialogueState.currentStep.contentKind === "chat_session",
      "expected learner dialogue to keep the episode in learning content",
    );
    const dialogueContent =
      learningDialogueState.currentStep.contentKind === "chat_session"
        ? learningDialogueState.currentStep.learningContent
        : null;
    assert(dialogueContent, "expected dialogue content payload");
    assert(
      dialogueContent.dialogueThread.length === 2,
      "expected one learner/system dialogue pair after first turn",
    );
    assert(
      dialogueContent.dialogueThread[0]?.role === "user",
      "expected learner turn to be stored first in dialogue thread",
    );
    assert(
      dialogueContent.dialogueBudget.learnerTurnsUsed === 1,
      "expected dialogue budget to count learner turns",
    );

    const restoredLearning = await loadLearnerEpisode(routeFetch, episodeId);
    assert(
      restoredLearning.currentStep.status === "acknowledge_learning_content" &&
        restoredLearning.currentStep.sequenceRole === "learning_content",
      "expected learning content acknowledgement after restore",
    );
    const restoredLearningContent =
      restoredLearning.currentStep.contentKind === "chat_session"
        ? restoredLearning.currentStep.learningContent
        : null;
    assert(restoredLearningContent, "expected restored learning content payload");
    assert(
      restoredLearningContent.dialogueThread.length === 2,
      "expected dialogue thread to persist after restore",
    );

    const postcheckStep = await advanceLearnerEpisode(routeFetch, episodeId, true);
    assert(
      postcheckStep.currentStep.sequenceRole === "postcheck" &&
        postcheckStep.currentStep.contentKind === "generated_test",
      "expected postcheck test after acknowledging learning content",
    );

    const postcheckTestId = extractCurrentTestId(postcheckStep);
    await submitLearnerEpisodeTest(routeFetch, postcheckTestId, {
      answers: await buildCorrectAnswers(postcheckTestId),
      totalDurationMs: 36_000,
      answerChangeCount: 0,
    });

    const restoredAfterPostcheck = await loadLearnerEpisode(routeFetch, episodeId);
    assert(
      restoredAfterPostcheck.currentStep.status === "pending_materialization" &&
        restoredAfterPostcheck.currentStep.sequenceRole === "holdout",
      "expected pending holdout after restoring submitted postcheck",
    );

    const holdoutStep = await advanceLearnerEpisode(routeFetch, episodeId, false);
    assert(
      holdoutStep.currentStep.sequenceRole === "holdout" &&
        holdoutStep.currentStep.contentKind === "generated_test",
      "expected holdout test after learner continue",
    );

    const holdoutTestId = extractCurrentTestId(holdoutStep);
    await submitLearnerEpisodeTest(routeFetch, holdoutTestId, {
      answers: await buildCorrectAnswers(holdoutTestId),
      totalDurationMs: 33_000,
      answerChangeCount: 0,
    });

    const completed = await loadLearnerEpisode(routeFetch, episodeId);
    assert(completed.currentStep.status === "completed", "learner flow should complete");
    assert(completed.episode.status === "completed", "episode summary should be completed");

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

    return {
      ok: true,
      episodeId,
      restoredStatuses: {
        afterPrecheck: restoredAfterPrecheck.currentStep.status,
        learning: restoredLearning.currentStep.status,
        afterPostcheck: restoredAfterPostcheck.currentStep.status,
        completed: completed.currentStep.status,
      },
      exportStatus: exportedEpisode.status,
      counts: exportedEpisode.counts,
    };
  } finally {
    await cleanupSelfCheckUser(user.id);
    await prisma.$disconnect();
  }
}
