import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ subjectId: string; sectionId: string }> },
) {
  const { subjectId, sectionId } = await params;
  if (!sectionId || !subjectId) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing subject/section id." },
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

  let payload: z.infer<typeof UpdateSchema>;
  try {
    payload = UpdateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const section = await prisma.subjectSection.findFirst({
    where: { id: sectionId, subjectId, subject: { userId: user.id } },
  });

  if (!section) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Section not found." },
      { status: 404 },
    );
  }

  async function isDescendant(parentId: string, targetId: string) {
    let currentId: string | null = parentId;
    let guard = 0;
    while (currentId && guard < 20) {
      if (currentId === targetId) return true;
      const current: { parentId: string | null } | null =
        await prisma.subjectSection.findFirst({
        where: { id: currentId, subjectId },
        select: { parentId: true },
      });
      currentId = current?.parentId ?? null;
      guard += 1;
    }
    return false;
  }

  if (payload.parentId) {
    if (payload.parentId === section.id) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Section cannot parent itself." },
        { status: 400 },
      );
    }
    const parent = await prisma.subjectSection.findFirst({
      where: { id: payload.parentId, subjectId },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Parent section not found." },
        { status: 400 },
      );
    }

    const cyclic = await isDescendant(payload.parentId, section.id);
    if (cyclic) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Cyclic parent assignment." },
        { status: 400 },
      );
    }
  }

  await prisma.subjectSection.update({
    where: { id: sectionId },
    data: {
      title: payload.title?.trim(),
      description: payload.description?.trim() || null,
      parentId: payload.parentId ?? undefined,
      sortOrder: payload.sortOrder ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ subjectId: string; sectionId: string }> },
) {
  const { subjectId, sectionId } = await params;
  if (!sectionId || !subjectId) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing subject/section id." },
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

  const section = await prisma.subjectSection.findFirst({
    where: { id: sectionId, subjectId, subject: { userId: user.id } },
  });

  if (!section) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Section not found." },
      { status: 404 },
    );
  }

  await prisma.subjectSection.delete({ where: { id: sectionId } });
  return NextResponse.json({ ok: true });
}
