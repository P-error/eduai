import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

const UpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing section id." },
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
    where: { id, subject: { userId: user.id } },
  });

  if (!section) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Section not found." },
      { status: 404 },
    );
  }

  if (payload.parentId) {
    const parent = await prisma.subjectSection.findFirst({
      where: { id: payload.parentId, subjectId: section.subjectId },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Parent section not found." },
        { status: 400 },
      );
    }
  }

  await prisma.subjectSection.update({
    where: { id },
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Missing section id." },
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
    where: { id, subject: { userId: user.id } },
  });

  if (!section) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Section not found." },
      { status: 404 },
    );
  }

  await prisma.subjectSection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
