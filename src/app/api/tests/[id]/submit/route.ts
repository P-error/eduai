import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  computeEffectivePreferences,
  isPersonalizationReady,
} from "@/lib/statistics";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

const SubmitSchema = z.object({
  answers: z.array(z.number().int().nonnegative()),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing test id." },
      { status: 400 },
    );
  }
  const payload = SubmitSchema.parse(await request.json());
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const test = await prisma.generatedTest.findUnique({
    where: { id },
    include: {
      subject: { include: { collection: true } },
      tagAssignments: {
        include: {
          axis: true,
          tag: true,
        },
      },
    },
  });

  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  const questions = test.questionsJson as {
    prompt: string;
    options: string[];
    answerIndex: number;
  }[];

  const answerMap = payload.answers.map((answer) =>
    Number.isFinite(answer) ? answer : -1,
  );

  const correctness = questions.map(
    (question, index) => answerMap[index] === question.answerIndex,
  );

  const byTag: Record<
    string,
    Record<string, { correct: number; total: number; accuracy: number }>
  > = {};

  for (const assignment of test.tagAssignments) {
    const axisKey = assignment.axis.key;
    const tagKey = assignment.tag.key;
    if (!byTag[axisKey]) byTag[axisKey] = {};
    if (!byTag[axisKey][tagKey]) {
      byTag[axisKey][tagKey] = { correct: 0, total: 0, accuracy: 0 };
    }

    const isCorrect = correctness[assignment.questionIndex] ?? false;
    byTag[axisKey][tagKey].total += 1;
    if (isCorrect) byTag[axisKey][tagKey].correct += 1;
  }

  for (const axisKey of Object.keys(byTag)) {
    for (const tagKey of Object.keys(byTag[axisKey])) {
      const entry = byTag[axisKey][tagKey];
      entry.accuracy = entry.total > 0 ? entry.correct / entry.total : 0;
    }
  }

  const score =
    correctness.length > 0
      ? correctness.filter(Boolean).length / correctness.length
      : 0;

  const isDefaultCollection =
    test.subject.collection?.name?.toLowerCase() ===
    DEFAULT_COLLECTION_NAME.toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.testAttempt.create({
      data: {
        testId: test.id,
        userId: user.id,
        answersJson: answerMap,
        score,
        byTagJson: byTag,
      },
    });

    if (isDefaultCollection) {
      return;
    }

    const statUpdates = test.tagAssignments.map((assignment) => {
      const isCorrect = correctness[assignment.questionIndex] ?? false;
      return tx.userTagStat.upsert({
        where: {
          userId_axisId_tagId: {
            userId: user.id,
            axisId: assignment.axisId,
            tagId: assignment.tagId,
          },
        },
        update: {
          totalCount: { increment: 1 },
          correctCount: { increment: isCorrect ? 1 : 0 },
        },
        create: {
          userId: user.id,
          axisId: assignment.axisId,
          tagId: assignment.tagId,
          totalCount: 1,
          correctCount: isCorrect ? 1 : 0,
        },
      });
    });

    await Promise.all(statUpdates);

    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { testsTaken: { increment: 1 } },
    });

    const stats = await tx.userTagStat.findMany({
      where: { userId: user.id },
      include: { axis: true, tag: true },
    });

    const { effective, axesReady } = computeEffectivePreferences(
      stats.map((stat) => ({
        axisKey: stat.axis.key,
        tagKey: stat.tag.key,
        correctCount: stat.correctCount,
        totalCount: stat.totalCount,
      })),
    );

    await tx.user.update({
      where: { id: user.id },
      data: {
        effectivePreferencesJson: effective,
        personalizationReady: isPersonalizationReady(
          axesReady,
          updatedUser.testsTaken,
        ),
      },
    });
  });

  return NextResponse.json({
    score,
    byTag,
  });
}
