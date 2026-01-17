import { prisma } from "@/lib/prisma";
import { MIN_TOTAL_PER_TAG, TAG_AXES } from "@/lib/tags";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

type SubjectDelta = {
  subject: string;
  averageDelta: number;
  cohorts: number;
};

type AxisTagAgg = {
  correct: number;
  total: number;
};

type CohortRow = {
  label: string;
  total: number;
  ready: number;
};

export async function getAdminAnalytics() {
  const [userCount, readyCount, attempts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { personalizationReady: true } }),
    prisma.testAttempt.findMany({
      where: {
        test: {
          subject: {
            collection: {
              name: { not: DEFAULT_COLLECTION_NAME },
            },
          },
        },
      },
      include: { test: { include: { subject: { include: { collection: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const deltaBySubject = new Map<string, { total: number; count: number }>();
  const grouped = new Map<string, typeof attempts>();
  const subjectAgg = new Map<string, { total: number; scoreSum: number }>();
  const axisAgg: Record<string, Record<string, AxisTagAgg>> = {};

  for (const attempt of attempts) {
    const key = `${attempt.userId}:${attempt.test.subjectId}`;
    const list = grouped.get(key) ?? [];
    list.push(attempt);
    grouped.set(key, list);

    const subjectName = attempt.test.subject.title;
    const subjectEntry = subjectAgg.get(subjectName) ?? {
      total: 0,
      scoreSum: 0,
    };
    subjectEntry.total += 1;
    subjectEntry.scoreSum += attempt.score;
    subjectAgg.set(subjectName, subjectEntry);

    const byTag = attempt.byTagJson as Record<
      string,
      Record<string, { correct: number; total: number }>
    >;
    for (const [axisKey, tags] of Object.entries(byTag ?? {})) {
      if (!axisAgg[axisKey]) axisAgg[axisKey] = {};
      for (const [tagKey, stat] of Object.entries(tags ?? {})) {
        if (!axisAgg[axisKey][tagKey]) {
          axisAgg[axisKey][tagKey] = { correct: 0, total: 0 };
        }
        axisAgg[axisKey][tagKey].correct += stat.correct ?? 0;
        axisAgg[axisKey][tagKey].total += stat.total ?? 0;
      }
    }
  }

  const retakeUsers = new Set<string>();
  for (const attemptsForSubject of grouped.values()) {
    if (attemptsForSubject.length < 2) continue;
    retakeUsers.add(attemptsForSubject[0].userId);
    const first = attemptsForSubject[0];
    const last = attemptsForSubject[attemptsForSubject.length - 1];
    const delta = last.score - first.score;
    const subjectName = last.test.subject.title;
    const entry = deltaBySubject.get(subjectName) ?? { total: 0, count: 0 };
    entry.total += delta;
    entry.count += 1;
    deltaBySubject.set(subjectName, entry);
  }

  const subjectDeltas: SubjectDelta[] = Array.from(deltaBySubject.entries())
    .map(([subject, entry]) => ({
      subject,
      averageDelta: entry.count > 0 ? entry.total / entry.count : 0,
      cohorts: entry.count,
    }))
    .sort((a, b) => b.averageDelta - a.averageDelta);

  const retakeCount = retakeUsers.size;

  const stats = await prisma.userTagStat.findMany({
    include: { axis: true },
  });
  const statsByUser = new Map<string, typeof stats>();
  for (const stat of stats) {
    const list = statsByUser.get(stat.userId) ?? [];
    list.push(stat);
    statsByUser.set(stat.userId, list);
  }

  const users = await prisma.user.findMany();

  const mismatchCounts: Record<string, number> = Object.fromEntries(
    TAG_AXES.map((axis) => [axis, 0]),
  );

  for (const user of users) {
    const declared =
      (user.declaredPreferencesJson ?? {}) as Record<string, string>;
    const effective =
      (user.effectivePreferencesJson ?? {}) as Record<string, string>;
    const userStats = statsByUser.get(user.id) ?? [];

    for (const axisKey of TAG_AXES) {
      const declaredTag = declared[axisKey];
      const effectiveTag = effective[axisKey];
      if (!declaredTag || !effectiveTag) continue;

      const totalForAxis = userStats
        .filter((stat) => stat.axis.key === axisKey)
        .reduce((sum, stat) => sum + stat.totalCount, 0);

      if (totalForAxis < MIN_TOTAL_PER_TAG) continue;
      if (declaredTag !== effectiveTag) {
        mismatchCounts[axisKey] += 1;
      }
    }
  }

  const subjectSummaries = Array.from(subjectAgg.entries())
    .map(([subject, entry]) => ({
      subject,
      totalAttempts: entry.total,
      avgScore: entry.total > 0 ? entry.scoreSum / entry.total : 0,
    }))
    .sort((a, b) => b.totalAttempts - a.totalAttempts);

  const axisSummaries = Object.entries(axisAgg)
    .map(([axisKey, tags]) => ({
      axisKey,
      tags: Object.entries(tags)
        .map(([tagKey, stat]) => ({
          tagKey,
          accuracy: stat.total > 0 ? stat.correct / stat.total : 0,
          total: stat.total,
        }))
        .sort((a, b) => b.accuracy - a.accuracy),
    }))
    .sort((a, b) => a.axisKey.localeCompare(b.axisKey));

  const cohorts: CohortRow[] = [
    { label: "0 tests", total: 0, ready: 0 },
    { label: "1-2 tests", total: 0, ready: 0 },
    { label: "3-5 tests", total: 0, ready: 0 },
    { label: "6+ tests", total: 0, ready: 0 },
  ];

  for (const user of users) {
    const bucket =
      user.testsTaken === 0
        ? 0
        : user.testsTaken <= 2
          ? 1
          : user.testsTaken <= 5
            ? 2
            : 3;
    cohorts[bucket].total += 1;
    if (user.personalizationReady) {
      cohorts[bucket].ready += 1;
    }
  }

  return {
    userCount,
    readyCount,
    retakeCount,
    subjectDeltas,
    subjectSummaries,
    cohorts,
    axisSummaries,
    mismatchCounts,
  };
}
