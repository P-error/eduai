import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildLearnerTruthOverview } from "@/lib/learner-truth";
import { sanitizePreferenceMap } from "@/lib/tags";

export const runtime = "nodejs";

const UpdateMeSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
});

function buildUserResponse(user: {
  id: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
  testsTaken: number;
  personalizationReady: boolean;
  declaredPreferencesJson: unknown;
  effectivePreferencesJson: unknown;
}, learnerSummary?: {
  attemptsRecorded: number;
  attemptsLearningEligible: number;
  attemptsExcluded: number;
  recentAccuracy: { value: number | null; sampleSize: number };
  recentEvidence: {
    windowSize: number;
    recorded: number;
    learningEligible: number;
    excluded: number;
  };
  lastRecordedAttemptAt: string | null;
  learningUpdateCount: number;
  currentDifficultyTarget: "easy" | "medium" | "hard" | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    testsTaken: user.testsTaken,
    personalizationReady: user.personalizationReady,
    declaredPreferences: sanitizePreferenceMap(
      (user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
    ),
    effectivePreferences: sanitizePreferenceMap(
      (user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
    ),
    learnerSummary:
      learnerSummary == null
        ? null
        : {
            attemptsRecorded: learnerSummary.attemptsRecorded,
            attemptsLearningEligible: learnerSummary.attemptsLearningEligible,
            attemptsExcluded: learnerSummary.attemptsExcluded,
            recentAccuracy: learnerSummary.recentAccuracy,
            recentEvidence: learnerSummary.recentEvidence,
            lastRecordedAttemptAt: learnerSummary.lastRecordedAttemptAt,
            learningUpdateCount: learnerSummary.learningUpdateCount,
            currentDifficultyTarget: learnerSummary.currentDifficultyTarget,
          },
  };
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const overview = await buildLearnerTruthOverview(prisma, user.id);

  return NextResponse.json(
    buildUserResponse(user, {
      attemptsRecorded: overview.global.attemptsRecorded,
      attemptsLearningEligible: overview.global.attemptsLearningEligible,
      attemptsExcluded: overview.global.attemptsExcluded,
      recentAccuracy: overview.global.recentAccuracy,
      recentEvidence: overview.global.recentEvidence,
      lastRecordedAttemptAt: overview.global.lastRecordedAttemptAt,
      learningUpdateCount: overview.adaptiveState.learningUpdateCount,
      currentDifficultyTarget: overview.adaptiveState.currentDifficultyTarget,
    }),
  );
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  let payload: z.infer<typeof UpdateMeSchema>;
  try {
    payload = UpdateMeSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const nextName = payload.name?.trim() ? payload.name.trim() : null;
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { name: nextName },
  });

  return NextResponse.json({
    ok: true,
    user: buildUserResponse(updatedUser),
  });
}
