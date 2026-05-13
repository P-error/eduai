import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { POST as createEpisodeRoute } from "@/app/api/evaluation/episodes/route";
import { GET as learnerFlowEntryRoute } from "@/app/api/learner-flow/entry/route";
import {
  buildCustomPracticeHref,
  buildPracticeResultCtaHierarchy,
  buildTopicDetailsHref,
  launchOwnerPathEpisode,
} from "@/lib/learner-orchestration";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRequest(path: string, token: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
  });
}

function authHeaders(token: string, init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
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

    throw new Error(`Unhandled orchestration self-check route: ${method} ${url.pathname}`);
  };
}

async function responseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function cleanupUser(userId: string) {
  const [tests, sessions, episodes, subjects] = await Promise.all([
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
    prisma.subject.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const testIds = tests.map((item) => item.id);
  const sessionIds = sessions.map((item) => item.id);
  const episodeIds = episodes.map((item) => item.id);
  const subjectIds = subjects.map((item) => item.id);

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

    if (subjectIds.length > 0) {
      await tx.subjectSection.deleteMany({
        where: { subjectId: { in: subjectIds } },
      });
      await tx.subject.deleteMany({
        where: { id: { in: subjectIds } },
      });
    }

    await tx.collection.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

export async function runLearnerOrchestrationSelfCheck() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      externalId: `learner-orchestration-self-check:${stamp}`,
      email: `learner-orchestration-self-check-${stamp}@eduai.local`,
      name: "Learner Orchestration Self Check",
      personalizationReady: true,
    },
  });

  const token = issueToken({ userId: user.id });

  try {
    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: "Orchestration Physics",
      },
    });

    const section = await prisma.subjectSection.create({
      data: {
        subjectId: subject.id,
        title: "Kinematics",
        sortOrder: 0,
      },
    });

    assert(
      buildTopicDetailsHref(subject.id) === `/topics/${subject.id}`,
      "topic creation handoff must point to topic details",
    );

    const customPracticeHref = buildCustomPracticeHref({
      subjectId: subject.id,
      sectionId: section.id,
      topic: section.title,
    });
    assert(
      customPracticeHref ===
        `/practice?subjectId=${subject.id}&sectionId=${section.id}&topic=Kinematics`,
      "custom practice href must preserve subject, section, and topic focus",
    );

    const ctaHierarchy = buildPracticeResultCtaHierarchy({
      subjectId: subject.id,
      sectionId: section.id,
      topic: section.title,
    });
    assert(
      ctaHierarchy.primaryHref === DEFAULT_LEARNER_ENTRY_HREF,
      "result primary CTA must return to canonical Learn entry",
    );
    assert(
      ctaHierarchy.secondaryHref === customPracticeHref,
      "result secondary CTA must keep custom practice secondary",
    );

    const entryBeforeEpisode = await learnerFlowEntryRoute(
      buildRequest("/api/learner-flow/entry", token),
    );
    const entryBeforeEpisodePayload = await responseJson<{
      target?: { kind?: string; href?: string };
    }>(entryBeforeEpisode);
    assert(
      entryBeforeEpisodePayload.target?.kind === "learn" &&
        entryBeforeEpisodePayload.target.href === "/learn",
      "stage 1 learn entry must remain intact before direct topic launch",
    );

    const routeFetch = await makeRouteFetcher(token);

    const topicLaunch = await launchOwnerPathEpisode(routeFetch, {
      subjectId: subject.id,
      subjectTitle: subject.title,
    });
    assert(
      topicLaunch.state.currentStep.sequenceRole === "precheck",
      "topic launch must create an episode immediately",
    );
    assert(
      topicLaunch.href === `/learn?episode=${topicLaunch.state.episode.episodeId}`,
      "topic launch must open Learn on the created episode",
    );

    await prisma.evaluationEpisode.update({
      where: { id: topicLaunch.state.episode.episodeId },
      data: { status: "completed" },
    });

    const sectionLaunch = await launchOwnerPathEpisode(routeFetch, {
      subjectId: subject.id,
      subjectTitle: subject.title,
      sectionId: section.id,
      sectionTitle: section.title,
    });
    assert(
      sectionLaunch.state.episode.sectionId === section.id,
      "subtopic launch must preserve section scope",
    );
    assert(
      sectionLaunch.state.currentStep.sequenceRole === "precheck",
      "subtopic launch must create the owner-path episode immediately",
    );

    const entryAfterEpisode = await learnerFlowEntryRoute(
      buildRequest("/api/learner-flow/entry", token),
    );
    const entryAfterEpisodePayload = await responseJson<{
      target?: { kind?: string; href?: string };
    }>(entryAfterEpisode);
    assert(
      entryAfterEpisodePayload.target?.kind === "resume" &&
        entryAfterEpisodePayload.target.href ===
          `/learn?episode=${sectionLaunch.state.episode.episodeId}&resume=1`,
      "stage 1 resume entry must remain intact after direct topic launch",
    );

    return {
      ok: true,
      checks: [
        "topic create handoff -> /topics/:id",
        "direct topic start -> immediate Learn episode",
        "direct subtopic start -> immediate Learn episode with section scope",
        "custom practice href stays secondary and scoped",
        "practice result CTA hierarchy keeps Learn primary",
        "stage 1 learn/resume entry remains intact",
      ],
    };
  } finally {
    await cleanupUser(user.id);
  }
}
