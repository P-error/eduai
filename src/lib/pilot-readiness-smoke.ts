import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { hashPassword } from "@/lib/auth-password";
import {
  advanceLearnerEpisode,
  loadLearnerEpisode,
  startLearnerEpisode,
  submitLearnerEpisodeTest,
  type LearnerEpisodeState,
} from "@/lib/learner-episode-client";
import {
  buildDatasetExportRecordsFromRows,
} from "@/lib/dataset-export";
import { loadPredictionBacktestRows } from "@/lib/prediction-backtest";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as readyRoute } from "@/app/api/ready/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/users/me/route";
import { GET as profileRoute } from "@/app/api/users/me/profile/route";
import { GET as dashboardRoute } from "@/app/api/users/me/dashboard/route";
import {
  GET as researchConsentGetRoute,
  PATCH as researchConsentPatchRoute,
} from "@/app/api/users/me/research-consent/route";
import { GET as subjectsRoute, POST as createSubjectRoute } from "@/app/api/subjects/route";
import { POST as createSectionRoute } from "@/app/api/subjects/[subjectId]/sections/route";
import { POST as generateTestRoute } from "@/app/api/tests/generate/route";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";
import { POST as createEpisodeRoute } from "@/app/api/evaluation/episodes/route";
import { GET as getEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/route";
import { POST as advanceEpisodeRoute } from "@/app/api/evaluation/episodes/[id]/next/route";
import { GET as adminOperationalSummaryRoute } from "@/app/api/admin/operational-summary/route";
import { GET as adminAuditEventsRoute } from "@/app/api/admin/audit-events/route";
import { GET as adminDatasetExportRoute } from "@/app/api/admin/dataset-export/route";
import { GET as adminEvaluationExportRoute } from "@/app/api/admin/evaluation-export/route";
import { POST as adminPromptTemplateRoute } from "@/app/api/admin/prompt-templates/route";

type RouteJson = Record<string, unknown>;

type SessionState = {
  cookieHeader: string | null;
  ip: string;
};

type DispatchInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeRequestBody(body: unknown): BodyInit | undefined {
  if (body == null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

function buildRequest(path: string, session: SessionState, init?: DispatchInit) {
  const url = new URL(path, "http://localhost");
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", session.ip);

  if (session.cookieHeader) {
    headers.set("cookie", session.cookieHeader);
  }

  const body = normalizeRequestBody(init?.body);
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url.toString(), {
    ...init,
    headers,
    body,
  });
}

function readSetCookie(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().join(", ");
  }
  return response.headers.get("set-cookie");
}

function updateSessionFromResponse(session: SessionState, response: Response) {
  const setCookie = readSetCookie(response);
  if (!setCookie) {
    return;
  }

  const match = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]*)`));
  if (!match) {
    return;
  }

  const value = decodeURIComponent(match[1] ?? "");
  session.cookieHeader =
    value.length > 0 ? `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}` : null;
}

async function dispatchRoute(
  session: SessionState,
  path: string,
  init?: DispatchInit,
) {
  const request = buildRequest(path, session, init);
  const url = new URL(request.url);
  const method = (init?.method ?? "GET").toUpperCase();

  let response: Response;

  if (method === "GET" && url.pathname === "/api/health") {
    response = await healthRoute();
  } else if (method === "GET" && url.pathname === "/api/ready") {
    response = await readyRoute();
  } else if (method === "POST" && url.pathname === "/api/auth/register") {
    response = await registerRoute(request);
  } else if (method === "POST" && url.pathname === "/api/auth/login") {
    response = await loginRoute(request);
  } else if (method === "POST" && url.pathname === "/api/auth/logout") {
    response = await logoutRoute();
  } else if (method === "GET" && url.pathname === "/api/users/me") {
    response = await meRoute(request);
  } else if (method === "GET" && url.pathname === "/api/users/me/profile") {
    response = await profileRoute(request);
  } else if (method === "GET" && url.pathname === "/api/users/me/dashboard") {
    response = await dashboardRoute(request);
  } else if (method === "GET" && url.pathname === "/api/users/me/research-consent") {
    response = await researchConsentGetRoute(request);
  } else if (
    method === "PATCH" &&
    url.pathname === "/api/users/me/research-consent"
  ) {
    response = await researchConsentPatchRoute(request);
  } else if (method === "GET" && url.pathname === "/api/subjects") {
    response = await subjectsRoute(request);
  } else if (method === "POST" && url.pathname === "/api/subjects") {
    response = await createSubjectRoute(request);
  } else if (method === "POST" && url.pathname === "/api/tests/generate") {
    response = await generateTestRoute(request);
  } else if (method === "POST" && url.pathname === "/api/evaluation/episodes") {
    response = await createEpisodeRoute(request);
  } else if (
    method === "GET" &&
    url.pathname === "/api/admin/operational-summary"
  ) {
    response = await adminOperationalSummaryRoute(request);
  } else if (method === "GET" && url.pathname === "/api/admin/audit-events") {
    response = await adminAuditEventsRoute(request);
  } else if (method === "GET" && url.pathname === "/api/admin/dataset-export") {
    response = await adminDatasetExportRoute(request);
  } else if (method === "GET" && url.pathname === "/api/admin/evaluation-export") {
    response = await adminEvaluationExportRoute(request);
  } else if (
    method === "POST" &&
    url.pathname === "/api/admin/prompt-templates"
  ) {
    response = await adminPromptTemplateRoute(request);
  } else {
    const subjectSectionsMatch = url.pathname.match(
      /^\/api\/subjects\/([^/]+)\/sections$/,
    );
    const submitMatch = url.pathname.match(/^\/api\/tests\/([^/]+)\/submit$/);
    const episodeMatch = url.pathname.match(/^\/api\/evaluation\/episodes\/([^/]+)$/);
    const episodeNextMatch = url.pathname.match(
      /^\/api\/evaluation\/episodes\/([^/]+)\/next$/,
    );

    if (method === "POST" && subjectSectionsMatch) {
      response = await createSectionRoute(request, {
        params: Promise.resolve({ subjectId: subjectSectionsMatch[1] }),
      });
    } else if (method === "POST" && submitMatch) {
      response = await submitTestRoute(request, {
        params: Promise.resolve({ id: submitMatch[1] }),
      });
    } else if (method === "GET" && episodeMatch) {
      response = await getEpisodeRoute(request, {
        params: Promise.resolve({ id: episodeMatch[1] }),
      });
    } else if (method === "POST" && episodeNextMatch) {
      response = await advanceEpisodeRoute(request, {
        params: Promise.resolve({ id: episodeNextMatch[1] }),
      });
    } else {
      throw new Error(`Unhandled pilot smoke route: ${method} ${url.pathname}`);
    }
  }

  updateSessionFromResponse(session, response);
  return response;
}

async function responseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function requestJson<T>(
  session: SessionState,
  path: string,
  init?: DispatchInit,
) {
  const response = await dispatchRoute(session, path, init);
  const payload = (await response.json().catch(() => null)) as T | RouteJson | null;

  if (!response.ok) {
    throw new Error(
      `Request failed: ${path} (${response.status}) ${JSON.stringify(payload)}`,
    );
  }

  return payload as T;
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
    return invert ? (answerIndex + 1) % optionsCount : answerIndex;
  });
}

async function cleanupUserArtifacts(userId: string) {
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
    await tx.operatorAuditEvent.deleteMany({
      where: { actorUserId: userId },
    });

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
    await tx.subjectSection.deleteMany({
      where: { subject: { userId } },
    });
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

function parseJsonl(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RouteJson);
}

export async function runPilotReadinessSmoke() {
  const stamp = Date.now();
  const learnerEmail = `pilot-smoke-learner-${stamp}@eduai.local`;
  const learnerPassword = `PilotSmoke!${stamp}`;
  const adminEmail = `pilot-smoke-admin-${stamp}@eduai.local`;
  const adminPassword = `PilotAdmin!${stamp}`;
  const promptTemplateKey = `pilot_smoke_template_${stamp}`;
  const learnerSession: SessionState = {
    cookieHeader: null,
    ip: `203.0.113.${(stamp % 200) + 1}`,
  };
  const adminSession: SessionState = {
    cookieHeader: null,
    ip: `203.0.113.${((stamp + 1) % 200) + 1}`,
  };

  let learnerUserId: string | null = null;
  let adminUserId: string | null = null;

  try {
    const healthResponse = await dispatchRoute(learnerSession, "/api/health");
    assert(healthResponse.ok, "health endpoint must return 200");
    const healthPayload = await responseJson<{ ok: boolean; status: string }>(healthResponse);
    assert(healthPayload.ok === true, "health payload must be ok");

    const readyResponse = await dispatchRoute(learnerSession, "/api/ready");
    assert(readyResponse.ok, "ready endpoint must return 200");
    const readyPayload = await responseJson<{
      ok: boolean;
      checks: Array<{ key: string; status: string }>;
    }>(readyResponse);
    assert(readyPayload.ok === true, "ready payload must be ok");

    const registerResponse = await dispatchRoute(learnerSession, "/api/auth/register", {
      method: "POST",
      body: {
        email: learnerEmail,
        password: learnerPassword,
        name: "Pilot Smoke Learner",
        researchConsent: true,
      },
    });
    assert(registerResponse.ok, "register route must succeed");
    const registerPayload = await responseJson<{ user: { id: string } }>(registerResponse);
    learnerUserId = registerPayload.user.id;
    assert(Boolean(learnerSession.cookieHeader), "register must issue session cookie");

    const logoutResponse = await dispatchRoute(learnerSession, "/api/auth/logout", {
      method: "POST",
    });
    assert(logoutResponse.ok, "logout route must succeed");
    assert(learnerSession.cookieHeader == null, "logout must clear session cookie");

    const meAfterLogout = await dispatchRoute(learnerSession, "/api/users/me");
    assert(meAfterLogout.status === 401, "logged out learner must lose access");

    const loginResponse = await dispatchRoute(learnerSession, "/api/auth/login", {
      method: "POST",
      body: {
        identifier: learnerEmail,
        password: learnerPassword,
      },
    });
    assert(loginResponse.ok, "login route must succeed");
    assert(Boolean(learnerSession.cookieHeader), "login must restore session cookie");

    const mePayload = await requestJson<{
      id: string;
      email: string | null;
      isAdmin: boolean;
    }>(learnerSession, "/api/users/me");
    assert(mePayload.email === learnerEmail, "learner me payload must match email");
    assert(mePayload.isAdmin === false, "learner must not have admin power");

    const learnerAdminAttempt = await dispatchRoute(
      learnerSession,
      "/api/admin/operational-summary",
    );
    assert(learnerAdminAttempt.status === 403, "learner must not access admin summary");

    const subjectPayload = await requestJson<{
      ok: boolean;
      data: { id: string };
    }>(learnerSession, "/api/subjects", {
      method: "POST",
      body: {
        title: "Pilot Smoke Topic",
        description: "Pilot readiness smoke topic",
      },
    });
    const subjectId = subjectPayload.data.id;

    const subjectsList = await requestJson<Array<{ id: string }>>(
      learnerSession,
      "/api/subjects",
    );
    assert(
      subjectsList.some((subject) => subject.id === subjectId),
      "created topic must be visible",
    );

    const sectionPayload = await requestJson<{ id: string }>(
      learnerSession,
      `/api/subjects/${subjectId}/sections`,
      {
        method: "POST",
        body: {
          title: "Forces",
          description: "Section used by the pilot readiness smoke",
        },
      },
    );
    const sectionId = sectionPayload.id;

    const practicePayload = await requestJson<{
      id: string;
      test: { questions: unknown[] };
    }>(learnerSession, "/api/tests/generate", {
      method: "POST",
      body: {
        subjectId,
        sectionId,
        topic: "Newton's second law",
        questionCount: 3,
        mode: "practice",
        personalizationMode: "on",
      },
    });
    assert(practicePayload.test.questions.length === 3, "practice test must contain questions");

    const practiceSubmitResponse = await dispatchRoute(
      learnerSession,
      `/api/tests/${practicePayload.id}/submit`,
      {
        method: "POST",
        body: {
          answers: await buildCorrectAnswers(practicePayload.id),
          totalDurationMs: 24_000,
          answerChangeCount: 0,
        },
      },
    );
    assert(practiceSubmitResponse.ok, "practice submit must succeed");

    const routeFetch = async (input: RequestInfo, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      return dispatchRoute(learnerSession, url, init as DispatchInit | undefined);
    };

    const started = await startLearnerEpisode(routeFetch, {
      subjectId,
      sectionId,
      topic: "Newton's second law",
      questionCount: 3,
      mode: "practice",
      personalizationMode: "on",
      assignmentArm: "predicted",
      includeHoldout: true,
    });
    const episodeId = extractEpisodeId(started);
    assert(
      started.currentStep.sequenceRole === "precheck",
      "episode must start at precheck",
    );

    const precheckTestId = extractCurrentTestId(started);
    await submitLearnerEpisodeTest(routeFetch, precheckTestId, {
      answers: await buildCorrectAnswers(precheckTestId, true),
      totalDurationMs: 42_000,
      answerChangeCount: 1,
    });

    const restoredAfterPrecheck = await loadLearnerEpisode(routeFetch, episodeId);
    assert(
      restoredAfterPrecheck.currentStep.status === "pending_materialization",
      "episode must restore pending learning content after precheck",
    );

    const learningStep = await advanceLearnerEpisode(routeFetch, episodeId, false);
    assert(
      learningStep.currentStep.sequenceRole === "learning_content",
      "episode must advance to learning content",
    );

    const postcheckStep = await advanceLearnerEpisode(routeFetch, episodeId, true);
    assert(
      postcheckStep.currentStep.sequenceRole === "postcheck",
      "episode must advance to postcheck after acknowledgement",
    );

    const postcheckTestId = extractCurrentTestId(postcheckStep);
    await submitLearnerEpisodeTest(routeFetch, postcheckTestId, {
      answers: await buildCorrectAnswers(postcheckTestId),
      totalDurationMs: 31_000,
      answerChangeCount: 0,
    });

    const holdoutStep = await advanceLearnerEpisode(routeFetch, episodeId, false);
    assert(holdoutStep.currentStep.sequenceRole === "holdout", "episode must reach holdout");

    const holdoutTestId = extractCurrentTestId(holdoutStep);
    await submitLearnerEpisodeTest(routeFetch, holdoutTestId, {
      answers: await buildCorrectAnswers(holdoutTestId),
      totalDurationMs: 29_000,
      answerChangeCount: 0,
    });

    const completed = await loadLearnerEpisode(routeFetch, episodeId);
    assert(completed.currentStep.status === "completed", "episode must complete");
    assert(completed.episode.status === "completed", "episode summary must complete");

    const profilePayload = await requestJson<RouteJson>(
      learnerSession,
      "/api/users/me/profile",
    );
    assert(profilePayload != null, "profile analytics must be accessible");

    const dashboardPayload = await requestJson<{
      attempts: Array<RouteJson>;
    }>(learnerSession, "/api/users/me/dashboard?limit=20");
    assert(
      Array.isArray(dashboardPayload.attempts) && dashboardPayload.attempts.length > 0,
      "analytics dashboard must expose attempts",
    );

    const consentBefore = await requestJson<{
      consent: {
        consentGranted: boolean;
        futureTrainingEligible: boolean;
      };
    }>(learnerSession, "/api/users/me/research-consent");
    assert(
      consentBefore.consent.consentGranted === true &&
        consentBefore.consent.futureTrainingEligible === true,
      "research consent must start enabled",
    );

    const consentAfter = await requestJson<{
      consent: {
        consentGranted: boolean;
        futureTrainingEligible: boolean;
        exclusionReason: string | null;
      };
    }>(learnerSession, "/api/users/me/research-consent", {
      method: "PATCH",
      body: { consented: false },
    });
    assert(
      consentAfter.consent.consentGranted === false,
      "consent withdrawal must revoke consent",
    );
    assert(
      consentAfter.consent.futureTrainingEligible === false,
      "consent withdrawal must exclude future training",
    );
    assert(
      consentAfter.consent.exclusionReason === "consent_withdrawn",
      "consent withdrawal must record exclusion reason",
    );

    const adminUser = await prisma.user.create({
      data: {
        externalId: `email:${adminEmail}`,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        name: "Pilot Smoke Admin",
        isAdmin: true,
      },
      select: { id: true },
    });
    adminUserId = adminUser.id;

    const adminLoginResponse = await dispatchRoute(adminSession, "/api/auth/login", {
      method: "POST",
      body: {
        identifier: adminEmail,
        password: adminPassword,
      },
    });
    assert(adminLoginResponse.ok, "admin login must succeed");

    const adminSummary = await requestJson<{
      readiness: { ok: boolean };
      runtime: { backendKind: string; rateLimiterBackend: string };
      artifactSlot: { slotStatus: string; runtimeArtifactStatus: string };
    }>(adminSession, "/api/admin/operational-summary");
    assert(adminSummary.readiness.ok === true, "admin summary must report readiness");
    assert(
      typeof adminSummary.runtime.backendKind === "string",
      "admin summary must expose runtime backend",
    );
    assert(
      typeof adminSummary.runtime.rateLimiterBackend === "string",
      "admin summary must expose rate limiter backend",
    );
    assert(
      typeof adminSummary.artifactSlot.slotStatus === "string" &&
        typeof adminSummary.artifactSlot.runtimeArtifactStatus === "string",
      "admin summary must expose artifact slot state",
    );

    const promptTemplateResponse = await dispatchRoute(
      adminSession,
      "/api/admin/prompt-templates",
      {
        method: "POST",
        body: {
          key: promptTemplateKey,
          content: "System prompt used only by the pilot readiness smoke suite.",
          notes: "Temporary smoke artifact",
        },
      },
    );
    assert(promptTemplateResponse.ok, "admin prompt template create must succeed");

    const evaluationExportResponse = await dispatchRoute(
      adminSession,
      "/api/admin/evaluation-export?format=json&timeRangeDays=1&maxEpisodes=50",
    );
    assert(evaluationExportResponse.ok, "evaluation export must succeed");
    const evaluationExportPayload = (await evaluationExportResponse.json()) as Array<{
      episodeId: string;
      status: string;
    }>;
    assert(
      evaluationExportPayload.some((episode) => episode.episodeId === episodeId),
      "evaluation export must contain completed episode",
    );

    const datasetExportAllResponse = await dispatchRoute(
      adminSession,
      "/api/admin/dataset-export?format=jsonl&timeRangeDays=1&maxAttempts=200&consentOnly=false",
    );
    assert(datasetExportAllResponse.ok, "dataset export must succeed");
    parseJsonl(await datasetExportAllResponse.text());

    const learnerBacktestRows = (
      await loadPredictionBacktestRows(prisma, {
        timeRangeDays: 1,
        maxAttempts: 200,
        includeExcluded: true,
        includeUnknownEligibility: true,
      })
    ).rows.filter((row) => row.userId === learnerUserId);
    assert(
      learnerBacktestRows.length > 0,
      "learner attempts must be present in the backtest/export source rows",
    );

    const learnerConsent = await prisma.user.findUnique({
      where: { id: learnerUserId },
      select: {
        id: true,
        researchConsentAt: true,
        researchConsentVersion: true,
        researchConsentWithdrawnAt: true,
        trainingDataExclusionAt: true,
        trainingDataExclusionReason: true,
      },
    });
    assert(learnerConsent, "learner consent snapshot must exist");

    const learnerConsentMap = new Map([
      [
        learnerUserId,
        {
          researchConsentAt: learnerConsent.researchConsentAt,
          researchConsentVersion: learnerConsent.researchConsentVersion,
          researchConsentWithdrawnAt: learnerConsent.researchConsentWithdrawnAt,
          trainingDataExclusionAt: learnerConsent.trainingDataExclusionAt,
          trainingDataExclusionReason: learnerConsent.trainingDataExclusionReason,
        },
      ],
    ]);

    const learnerAllExport = buildDatasetExportRecordsFromRows({
      rows: learnerBacktestRows,
      consentByUserId: learnerConsentMap,
      generatedAtIso: new Date().toISOString(),
      options: {
        eligibleOnly: false,
        consentOnly: false,
      },
      secret: "pilot-readiness-smoke",
    });
    const withdrawnRecords = learnerAllExport.records.filter(
      (record) =>
        record.futureTrainingEligible === false &&
        record.trainingExclusionReason === "consent_withdrawn",
    );
    assert(
      withdrawnRecords.length > 0,
      "dataset export must expose operational history even after consent withdrawal",
    );
    assert(
      withdrawnRecords.every(
        (record) =>
          record.consentGranted === false &&
          record.futureTrainingEligible === false &&
          record.trainingExclusionReason === "consent_withdrawn",
      ),
      "dataset export must mark withdrawn consent rows as excluded",
    );

    const datasetExportEligibleResponse = await dispatchRoute(
      adminSession,
      "/api/admin/dataset-export?format=jsonl&timeRangeDays=1&maxAttempts=200&consentOnly=true",
    );
    assert(datasetExportEligibleResponse.ok, "eligible-only dataset export must succeed");
    parseJsonl(await datasetExportEligibleResponse.text());

    const learnerEligibleExport = buildDatasetExportRecordsFromRows({
      rows: learnerBacktestRows,
      consentByUserId: learnerConsentMap,
      generatedAtIso: new Date().toISOString(),
      options: {
        eligibleOnly: false,
        consentOnly: true,
      },
      secret: "pilot-readiness-smoke",
    });
    assert(
      learnerEligibleExport.records.length === 0 &&
        learnerEligibleExport.counts.filteredByConsent === learnerBacktestRows.length,
      "eligible-only dataset export must exclude withdrawn learner rows",
    );

    const auditPayload = await requestJson<{
      events: Array<{ action: string; result: string }>;
    }>(adminSession, "/api/admin/audit-events?limit=20");
    const auditedActions = auditPayload.events.map((event) => event.action);
    assert(
      auditedActions.includes("dataset_export"),
      "audit trail must record dataset export",
    );
    assert(
      auditedActions.includes("evaluation_export"),
      "audit trail must record evaluation export",
    );
    assert(
      auditedActions.includes("prompt_template_create"),
      "audit trail must record prompt template create",
    );

    return {
      ok: true,
      smokeCommand: "npm run pilot-readiness:smoke",
      endpoints: {
        health: healthPayload.status,
        ready: readyPayload.ok,
      },
      learner: {
        userId: learnerUserId,
        subjectId,
        sectionId,
        episodeId,
      },
      consent: {
        before: consentBefore.consent,
        after: consentAfter.consent,
      },
      admin: {
        userId: adminUserId,
        auditedActions: auditedActions.slice(0, 10),
      },
    };
  } finally {
    await prisma.promptTemplate.deleteMany({
      where: { key: promptTemplateKey },
    });

    if (learnerUserId) {
      await cleanupUserArtifacts(learnerUserId);
    }
    if (adminUserId) {
      await cleanupUserArtifacts(adminUserId);
    }

    await prisma.$disconnect();
  }
}
