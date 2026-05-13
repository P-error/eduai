import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { ensureDefaultCollection } from "@/lib/collections";
import { GET as meRoute } from "@/app/api/users/me/route";
import { GET as profileRoute } from "@/app/api/users/me/profile/route";
import { GET as dashboardRoute } from "@/app/api/users/me/dashboard/route";
import { GET as subjectStatsRoute } from "@/app/api/subjects/[subjectId]/stats/route";
import { POST as submitTestRoute } from "@/app/api/tests/[id]/submit/route";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function authHeaders(token: string, init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
  return headers;
}

function buildGetRequest(path: string, token: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

function buildSubmitRequest(token: string, testId: string) {
  return new Request(`http://localhost/api/tests/${testId}/submit`, {
    method: "POST",
    headers: authHeaders(token, {
      "content-type": "application/json",
    }),
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
  assert(response.ok, `submit must succeed for ${testId}`);
  return responseJson(response);
}

async function cleanupUser(userId: string) {
  const [tests, subjects] = await Promise.all([
    prisma.generatedTest.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.subject.findMany({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const testIds = tests.map((item) => item.id);
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

    await tx.userTagStat.deleteMany({ where: { userId } });

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

export async function runLearnerTruthSelfCheck() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      externalId: `learner-truth-self-check:${stamp}`,
      email: `learner-truth-self-check-${stamp}@eduai.local`,
      name: "Learner Truth Self Check",
    },
  });
  const token = issueToken({ userId: user.id });

  try {
    const defaultCollection = await ensureDefaultCollection(user.id);
    const focusedCollection = await prisma.collection.create({
      data: {
        userId: user.id,
        name: "Focused Topics",
        sortOrder: 1,
      },
    });

    const defaultSubject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: "Default Collection Topic",
        collectionId: defaultCollection.id,
      },
    });
    const focusedSubject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: "Focused Topic",
        collectionId: focusedCollection.id,
      },
    });

    const eligibleDefaultTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: defaultSubject.id,
        topic: "Default eligible",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Eligible default question",
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
    const excludedDefaultTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: defaultSubject.id,
        topic: "Default excluded",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Excluded default question",
            options: ["Correct", "Incorrect"],
            answerIndex: 0,
          },
        ],
        validationMetaJson: {
          learningEligible: false,
          learningExcludedReason: "FALLBACK_GENERATION",
          fallback: true,
        },
      },
    });
    const eligibleFocusedTest = await prisma.generatedTest.create({
      data: {
        userId: user.id,
        subjectId: focusedSubject.id,
        topic: "Focused eligible",
        questionCount: 1,
        mode: "practice",
        questionsJson: [
          {
            prompt: "Eligible focused question",
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

    await submitTest(token, eligibleDefaultTest.id);
    await submitTest(token, excludedDefaultTest.id);
    await submitTest(token, eligibleFocusedTest.id);

    const meResponse = await meRoute(buildGetRequest("/api/users/me", token));
    const mePayload = await responseJson<{
      learnerSummary?: {
        attemptsRecorded?: number;
        attemptsLearningEligible?: number;
        attemptsExcluded?: number;
        learningUpdateCount?: number;
      } | null;
    }>(meResponse);
    assert(meResponse.ok, "me route must succeed");
    assert(
      mePayload.learnerSummary?.attemptsRecorded === 3 &&
        mePayload.learnerSummary.attemptsLearningEligible === 1 &&
        mePayload.learnerSummary.attemptsExcluded === 2 &&
        mePayload.learnerSummary.learningUpdateCount === 1,
      "me route must expose canonical recorded/eligible/excluded totals",
    );

    const profileResponse = await profileRoute(buildGetRequest("/api/users/me/profile", token));
    const profilePayload = await responseJson<{
      dataQuality?: {
        attemptsTotal?: number;
        attemptsLearningEligible?: number;
        attemptsExcluded?: number;
      };
      pedagogy?: {
        recentAccuracy?: {
          sampleSize?: number;
        };
      };
      subjects?: Array<{
        subjectId: string;
        attempts: number;
        attemptsLearningEligible: number;
        attemptsExcluded: number;
        isDefaultCollection: boolean;
      }>;
    }>(profileResponse);
    assert(profileResponse.ok, "profile route must succeed");
    assert(
      profilePayload.dataQuality?.attemptsTotal === 3 &&
        profilePayload.dataQuality.attemptsLearningEligible === 1 &&
        profilePayload.dataQuality.attemptsExcluded === 2,
      "profile route must reuse the same global truth counts",
    );
    assert(
      profilePayload.pedagogy?.recentAccuracy?.sampleSize === 1,
      "profile recent accuracy must use only learning-eligible evidence",
    );
    const profileDefaultSubject = profilePayload.subjects?.find(
      (subject) => subject.subjectId === defaultSubject.id,
    );
    assert(
      profileDefaultSubject?.attempts === 2 &&
        profileDefaultSubject.attemptsLearningEligible === 0 &&
        profileDefaultSubject.attemptsExcluded === 2 &&
        profileDefaultSubject.isDefaultCollection === true,
      "profile subject summary must preserve counts for default collection topics",
    );

    const globalDashboardResponse = await dashboardRoute(
      buildGetRequest("/api/users/me/dashboard?limit=20", token),
    );
    const globalDashboardPayload = await responseJson<{
      summary?: {
        attemptsRecorded?: number;
        attemptsLearningEligible?: number;
        attemptsExcluded?: number;
        recentAccuracy?: { sampleSize?: number };
      };
    }>(globalDashboardResponse);
    assert(globalDashboardResponse.ok, "dashboard route must succeed globally");
    assert(
      globalDashboardPayload.summary?.attemptsRecorded === 3 &&
        globalDashboardPayload.summary.attemptsLearningEligible === 1 &&
        globalDashboardPayload.summary.attemptsExcluded === 2 &&
        globalDashboardPayload.summary.recentAccuracy?.sampleSize === 1,
      "dashboard global summary must align with profile and me totals",
    );

    const scopedDashboardResponse = await dashboardRoute(
      buildGetRequest(
        `/api/users/me/dashboard?subjectId=${defaultSubject.id}&limit=20`,
        token,
      ),
    );
    const scopedDashboardPayload = await responseJson<{
      summary?: {
        attemptsRecorded?: number;
        attemptsLearningEligible?: number;
        attemptsExcluded?: number;
        recentAccuracy?: { sampleSize?: number };
      };
    }>(scopedDashboardResponse);
    assert(scopedDashboardResponse.ok, "dashboard route must succeed for subject scope");
    assert(
      scopedDashboardPayload.summary?.attemptsRecorded === 2 &&
        scopedDashboardPayload.summary.attemptsLearningEligible === 0 &&
        scopedDashboardPayload.summary.attemptsExcluded === 2 &&
        scopedDashboardPayload.summary.recentAccuracy?.sampleSize === 0,
      "dashboard subject scope must not silently mix global and topic-specific evidence",
    );

    const subjectStatsResponse = await subjectStatsRoute(
      buildGetRequest(`/api/subjects/${defaultSubject.id}/stats`, token),
      { params: Promise.resolve({ subjectId: defaultSubject.id }) },
    );
    const subjectStatsPayload = await responseJson<{
      subject?: { collectionName?: string | null };
      totals?: {
        attemptsRecorded?: number;
        attemptsLearningEligible?: number;
        attemptsExcluded?: number;
        recentAccuracy?: { sampleSize?: number };
      };
      attempts?: Array<{
        learningEligible?: boolean;
        exclusionReasonCode?: string | null;
      }>;
      excludedFromStats?: boolean;
    }>(subjectStatsResponse);
    assert(subjectStatsResponse.ok, "subject stats route must succeed");
    assert(
      subjectStatsPayload.totals?.attemptsRecorded === 2 &&
        subjectStatsPayload.totals.attemptsLearningEligible === 0 &&
        subjectStatsPayload.totals.attemptsExcluded === 2 &&
        subjectStatsPayload.totals.recentAccuracy?.sampleSize === 0,
      "subject stats must align with profile and scoped dashboard counts",
    );
    assert(
      subjectStatsPayload.subject?.collectionName === "Unassigned" &&
        subjectStatsPayload.excludedFromStats !== true,
      "default collection topic must stay visible in learner-facing stats",
    );
    assert(
      subjectStatsPayload.attempts?.some(
        (attempt) =>
          attempt.learningEligible === false &&
          attempt.exclusionReasonCode === "DEFAULT_COLLECTION",
      ) === true,
      "subject stats must preserve explicit excluded-attempt semantics",
    );

    return {
      ok: true,
      checks: [
        "me/profile/dashboard share recorded + eligible + excluded totals",
        "subject-scoped dashboard keeps topic evidence separate from global totals",
        "default collection topic stays visible and consistently excluded instead of zeroed subject stats",
        "excluded attempts keep explicit semantics across summary payloads",
      ],
    };
  } finally {
    await cleanupUser(user.id);
  }
}
