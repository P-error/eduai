import { type Prisma, type PrismaClient } from "@prisma/client";

export type SixFactorLearnerStateAggregateFeatures = {
  priorAttemptsCount: number;
  priorCorrectRate: number | null;
  recentCorrectRate: number | null;
  recentAttemptsCount: number;
  topicSeenCount: number | null;
  minutesSinceLastActivity: number | null;
  sessionPosition: number | null;
};

export type BuildSixFactorLearnerStateAggregatesParams = {
  prisma: PrismaClient;
  userId: string;
  subjectId?: string | null;
  topicRef?: string | null;
  topic?: string | null;
  conceptKey?: string | null;
  skillKey?: string | null;
  familyKey?: string | null;
  evaluationEpisodeId?: string | null;
  decisionCreatedAt?: Date | string | null;
  recentWindowSize?: number;
  historyScanLimit?: number;
};

function readDate(value: Date | string | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value);
  }
  return new Date();
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function normalizePositiveInteger(
  value: number | null | undefined,
  fallback: number,
) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function nonEmptyStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

function buildAttemptWhere(params: {
  userId: string;
  subjectId?: string | null;
  cutoff: Date;
}) {
  const where: Prisma.TestAttemptWhereInput = {
    userId: params.userId,
    createdAt: { lte: params.cutoff },
  };
  if (params.subjectId) {
    where.test = { subjectId: params.subjectId };
  }
  return where;
}

function matchesTopic(
  attempt: {
    test: {
      topic: string;
      evaluationEpisode: {
        topic: string | null;
        conceptKey: string | null;
        skillKey: string | null;
      } | null;
    };
  },
  topicKeys: Set<string>,
) {
  if (topicKeys.size === 0) return false;
  const candidates = nonEmptyStrings([
    attempt.test.topic,
    attempt.test.evaluationEpisode?.topic,
    attempt.test.evaluationEpisode?.conceptKey,
    attempt.test.evaluationEpisode?.skillKey,
  ]);
  return candidates.some((candidate) => topicKeys.has(candidate));
}

export async function buildLearnerStateAggregatesForSixFactorPolicy(
  params: BuildSixFactorLearnerStateAggregatesParams,
): Promise<SixFactorLearnerStateAggregateFeatures> {
  const cutoff = readDate(params.decisionCreatedAt);
  const recentWindowSize = normalizePositiveInteger(params.recentWindowSize, 5);
  const historyScanLimit = Math.max(
    recentWindowSize,
    normalizePositiveInteger(params.historyScanLimit, 200),
  );
  const where = buildAttemptWhere({
    userId: params.userId,
    subjectId: params.subjectId,
    cutoff,
  });

  const [aggregate, attempts, sessionItemCount] = await Promise.all([
    params.prisma.testAttempt.aggregate({
      where,
      _count: { _all: true },
      _avg: { score: true },
    }),
    params.prisma.testAttempt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: historyScanLimit,
      select: {
        score: true,
        createdAt: true,
        test: {
          select: {
            topic: true,
            evaluationEpisode: {
              select: {
                topic: true,
                conceptKey: true,
                skillKey: true,
              },
            },
          },
        },
      },
    }),
    params.evaluationEpisodeId
      ? params.prisma.evaluationEpisodeItem.count({
          where: {
            episodeId: params.evaluationEpisodeId,
            deliveredAt: { lte: cutoff },
          },
        })
      : Promise.resolve(null),
  ]);

  const recentAttempts = attempts.slice(0, recentWindowSize);
  const latestAttempt = attempts[0] ?? null;
  const topicKeys = new Set(
    nonEmptyStrings([
      params.topicRef,
      params.conceptKey,
      params.skillKey,
      params.topic,
    ]),
  );
  const topicSeenCount =
    topicKeys.size === 0
      ? null
      : attempts.filter((attempt) => matchesTopic(attempt, topicKeys)).length;
  const minutesSinceLastActivity =
    latestAttempt == null
      ? null
      : Math.max(
          0,
          (cutoff.getTime() - latestAttempt.createdAt.getTime()) / 60_000,
        );

  return {
    priorAttemptsCount: aggregate._count._all,
    priorCorrectRate: clampRate(aggregate._avg.score),
    recentCorrectRate: average(recentAttempts.map((attempt) => attempt.score)),
    recentAttemptsCount: recentAttempts.length,
    topicSeenCount,
    minutesSinceLastActivity,
    sessionPosition:
      typeof sessionItemCount === "number" ? sessionItemCount + 1 : null,
  };
}
