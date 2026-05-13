import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildLearnerTruthOverview,
  buildLearnerTruthScopeSummary,
} from "@/lib/learner-truth";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function parseAttemptMeta(byTagJson: unknown) {
  const root = asRecord(byTagJson);
  const meta = asRecord(root._meta);
  const prediction = asRecord(meta.prediction);
  const pedagogy = asRecord(meta.pedagogy);
  const learning = asRecord(meta.learning);

  return {
    prediction: {
      expectedAccuracy: parseNumber(prediction.expectedAccuracy),
      expectedTotalDurationMs: parseNumber(prediction.expectedTotalDurationMs),
      durationConfidence: parseNumber(prediction.durationConfidence),
      durationBasis: parseString(prediction.durationBasis),
      policyId: parseString(prediction.policyId),
      predictorVersion: parseString(prediction.predictorVersion),
      actualAccuracy: parseNumber(prediction.actualAccuracy),
      actualTotalDurationMs: parseNumber(prediction.actualTotalDurationMs),
    },
    pedagogy: {
      currentDifficulty: parseString(pedagogy.currentDifficulty),
      nextDifficulty: parseString(pedagogy.nextDifficulty),
      changed: parseBoolean(pedagogy.changed) === true,
      reason: parseString(pedagogy.reason),
    },
    learning: {
      eligible: parseBoolean(learning.eligible),
    },
  };
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get("subjectId");
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);

  const overview = await buildLearnerTruthOverview(prisma, user.id);
  const scopedAttempts = subjectId
    ? overview.attempts.filter((attempt) => attempt.subjectId === subjectId)
    : overview.attempts;
  const scopeSummary = buildLearnerTruthScopeSummary({
    attempts: scopedAttempts,
    difficultyFallback: subjectId ? null : overview.adaptiveState.currentDifficultyTarget,
  });

  const rows = scopedAttempts.slice(0, limit).map((attempt) => {
    const meta = parseAttemptMeta(attempt.byTagJson);
    return {
      id: attempt.id,
      createdAt: attempt.createdAt.toISOString(),
      subjectId: attempt.subjectId,
      subjectTitle: attempt.subjectTitle,
      topic: attempt.topic,
      questionCount: attempt.questionCount,
      score: attempt.score,
      actualAccuracy: meta.prediction.actualAccuracy ?? attempt.score,
      actualTotalDurationMs:
        meta.prediction.actualTotalDurationMs ?? attempt.totalDurationMs ?? null,
      predictedAccuracy: meta.prediction.expectedAccuracy,
      predictedTotalDurationMs: meta.prediction.expectedTotalDurationMs,
      durationConfidence: meta.prediction.durationConfidence,
      durationBasis: meta.prediction.durationBasis,
      policyId: meta.prediction.policyId,
      predictorVersion: meta.prediction.predictorVersion,
      difficulty: {
        current: meta.pedagogy.currentDifficulty,
        next: meta.pedagogy.nextDifficulty,
        changed: meta.pedagogy.changed,
        reason: meta.pedagogy.reason,
      },
      learningEligible: attempt.evidence.learning.eligible,
    };
  });

  return NextResponse.json({
    context: {
      subjectId: subjectId ?? null,
      limit,
      scope: subjectId ? "subject" : "global",
    },
    summary: {
      attemptsRecorded: scopeSummary.attemptsRecorded,
      attemptsLearningEligible: scopeSummary.attemptsLearningEligible,
      attemptsExcluded: scopeSummary.attemptsExcluded,
      recentAccuracy: scopeSummary.recentAccuracy,
      recentEvidence: scopeSummary.recentEvidence,
      currentDifficultyTarget: scopeSummary.currentDifficultyTarget,
      lastRecordedAttemptAt: scopeSummary.lastRecordedAttemptAt,
      hasPredictedAccuracy: rows.some((row) => row.predictedAccuracy != null),
      hasPredictedDuration: rows.some((row) => row.predictedTotalDurationMs != null),
    },
    attempts: rows,
  });
}
