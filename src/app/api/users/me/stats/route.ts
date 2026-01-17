import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  computeEffectivePreferences,
  isPersonalizationReady,
} from "@/lib/statistics";

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
      where: { userId: user.id },
      include: { test: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const { axesReady } = computeEffectivePreferences(
    stats.map((stat) => ({
      axisKey: stat.axis.key,
      tagKey: stat.tag.key,
      correctCount: stat.correctCount,
      totalCount: stat.totalCount,
    })),
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
      subject: attempt.test.subject.title,
      topic: attempt.test.topic,
    })),
  });
}
