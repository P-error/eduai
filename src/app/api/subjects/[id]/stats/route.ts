import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
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
    where: { id, userId: user.id },
    include: { collection: true },
  });

  if (!subject) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  const isDefaultCollection =
    subject.collection?.name?.toLowerCase() ===
    DEFAULT_COLLECTION_NAME.toLowerCase();

  if (isDefaultCollection) {
    return NextResponse.json({
      subject: {
        id: subject.id,
        title: subject.title,
        description: subject.description,
        collectionId: subject.collectionId,
      },
      totals: {
        tests: 0,
        avgScore: 0,
      },
      attempts: [],
      excludedFromStats: true,
    });
  }

  const [attempts, aggregate] = await Promise.all([
    prisma.testAttempt.findMany({
      where: { userId: user.id, test: { subjectId: subject.id } },
      include: { test: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.testAttempt.aggregate({
      where: { userId: user.id, test: { subjectId: subject.id } },
      _count: { id: true },
      _avg: { score: true },
    }),
  ]);

  return NextResponse.json({
    subject: {
      id: subject.id,
      title: subject.title,
      description: subject.description,
      collectionId: subject.collectionId,
    },
    totals: {
      tests: aggregate._count.id ?? 0,
      avgScore: aggregate._avg.score ?? 0,
    },
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      score: attempt.score,
      createdAt: attempt.createdAt,
      topic: attempt.test.topic,
    })),
    excludedFromStats: false,
  });
}
