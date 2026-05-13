import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  buildLearnerTruthOverview,
  buildLearnerTruthScopeSummary,
} from "@/lib/learner-truth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  const { subjectId } = await params;
  if (!subjectId) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing subject id." },
      { status: 400 },
    );
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId: user.id },
    include: { collection: true },
  });

  if (!subject) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  const overview = await buildLearnerTruthOverview(prisma, user.id);
  const attempts = overview.attempts.filter((attempt) => attempt.subjectId === subject.id);
  const summary = buildLearnerTruthScopeSummary({
    attempts,
  });

  return NextResponse.json({
    subject: {
      id: subject.id,
      title: subject.title,
      description: subject.description,
      collectionId: subject.collectionId,
      collectionName: subject.collection?.name ?? null,
    },
    totals: {
      attemptsRecorded: summary.attemptsRecorded,
      attemptsLearningEligible: summary.attemptsLearningEligible,
      attemptsExcluded: summary.attemptsExcluded,
      recentAccuracy: summary.recentAccuracy,
      recentEvidence: summary.recentEvidence,
      currentDifficultyTarget: summary.currentDifficultyTarget,
    },
    attempts: attempts.slice(0, 8).map((attempt) => ({
      id: attempt.id,
      score: attempt.score,
      createdAt: attempt.createdAt.toISOString(),
      topic: attempt.topic,
      learningEligible: attempt.evidence.learning.eligible,
      exclusionReasonCode: attempt.evidence.learning.exclusionReasonCode,
    })),
  });
}
