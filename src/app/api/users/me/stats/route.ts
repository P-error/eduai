import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  computeLayeredPreferences,
  isPersonalizationReady,
} from "@/lib/statistics";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const [stats, attempts] = await Promise.all([
    prisma.userTagStat.findMany({
      where: { userId: user.id },
      include: { axis: true, tag: true },
    }),
    prisma.testAttempt.findMany({
      where: {
        userId: user.id,
        test: {
          subject: {
            collection: {
              name: { not: DEFAULT_COLLECTION_NAME },
            },
          },
        },
      },
      include: { test: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const averageScore =
    attempts.length > 0
      ? attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length
      : 0.7;

  const policyMeta = attempts
    .map((attempt) => {
      const byTag = attempt.byTagJson as Record<string, unknown>;
      return byTag?._meta && typeof byTag._meta === "object"
        ? (byTag._meta as Record<string, unknown>)
        : null;
    })
    .filter((value): value is Record<string, unknown> => Boolean(value));

  const uxRewards = policyMeta
    .map((meta) => {
      const ux = meta.ux as Record<string, unknown> | undefined;
      const reward = ux?.reward;
      return typeof reward === "number" ? reward : null;
    })
    .filter((value): value is number => value != null);

  const explorationCount = policyMeta.filter((meta) => {
    const recommendation = meta.recommendation as Record<string, unknown> | undefined;
    return recommendation?.explorationUsed === true;
  }).length;

  const difficultyTransitions = policyMeta.filter((meta) => {
    const pedagogy = meta.pedagogy as Record<string, unknown> | undefined;
    return pedagogy?.changed === true;
  }).length;

  const { axesReady } = computeLayeredPreferences(
    stats.map((stat) => ({
      axisKey: stat.axis.key,
      tagKey: stat.tag.key,
      correctCount: stat.correctCount,
      totalCount: stat.totalCount,
    })),
    ((user.effectivePreferencesJson ?? {}) as Record<string, string>),
    averageScore,
  );

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      testsTaken: user.testsTaken,
      personalizationReady: user.personalizationReady,
    },
    declaredPreferences: user.declaredPreferencesJson ?? {},
    effectivePreferences: user.effectivePreferencesJson ?? {},
    axesReady,
    computedReady: isPersonalizationReady(axesReady, user.testsTaken),
    tagStats: stats.map((stat) => ({
      axisKey: stat.axis.key,
      tagKey: stat.tag.key,
      correctCount: stat.correctCount,
      totalCount: stat.totalCount,
    })),
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      score: attempt.score,
      createdAt: attempt.createdAt,
      subjectId: attempt.test.subjectId,
      sectionId: attempt.test.sectionId ?? null,
      subject: attempt.test.subject.title,
      topic: attempt.test.topic,
    })),
    policyMetrics: {
      averageUxReward:
        uxRewards.length > 0
          ? uxRewards.reduce((sum, value) => sum + value, 0) / uxRewards.length
          : null,
      uxRewardSamples: uxRewards.length,
      difficultyTransitions,
      explorationCount,
      explorationRate:
        attempts.length > 0 ? explorationCount / attempts.length : 0,
      attemptsAnalyzed: attempts.length,
    },
  });
}
