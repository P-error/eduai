import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

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
  });

  if (!subject) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  const sections = await prisma.subjectSection.findMany({
    where: { subjectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(sections);
}

export async function POST(
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
  });

  if (!subject) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  let payload: z.infer<typeof CreateSchema>;
  try {
    payload = CreateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  if (payload.parentId) {
    const parent = await prisma.subjectSection.findFirst({
      where: { id: payload.parentId, subjectId },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Parent section not found." },
        { status: 400 },
      );
    }
  }

  const section = await prisma.subjectSection.create({
    data: {
      subjectId,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      parentId: payload.parentId ?? null,
      sortOrder: payload.sortOrder ?? 0,
    },
  });

  return NextResponse.json(section);
}
