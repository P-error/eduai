import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";
import { ensureDefaultCollection } from "@/lib/collections";

const UpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
  archivedAt: z.string().datetime().optional().nullable(),
});

export async function PATCH(
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

  let nextCollectionId = payload.collectionId;
  if (payload.collectionId !== undefined) {
    if (payload.collectionId) {
      const collection = await prisma.collection.findFirst({
        where: { id: payload.collectionId, userId: user.id },
      });
      if (!collection) {
        return NextResponse.json(
          { error: "INVALID_INPUT", message: "Collection not found." },
          { status: 400 },
        );
      }
    } else {
      nextCollectionId = (await ensureDefaultCollection(user.id)).id;
    }
  }

  const current = await prisma.subject.findFirst({
    where: { id, userId: user.id },
  });

  if (!current) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  if (payload.title || payload.collectionId !== undefined) {
    const nextTitle = payload.title?.trim() ?? current.title;
    const resolvedCollectionId =
      payload.collectionId !== undefined
        ? (nextCollectionId ?? null)
        : current.collectionId;

    const existing = await prisma.subject.findFirst({
      where: {
        userId: user.id,
        collectionId: resolvedCollectionId ?? null,
        archivedAt: null,
        title: {
          equals: nextTitle,
          mode: "insensitive",
        },
        NOT: { id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Subject already exists." },
        { status: 400 },
      );
    }
  }

  const subject = await prisma.subject.updateMany({
    where: { id, userId: user.id },
    data: {
      title: payload.title?.trim(),
      description: payload.description?.trim() || null,
      collectionId:
        payload.collectionId !== undefined ? (nextCollectionId ?? null) : undefined,
      archivedAt: payload.archivedAt ? new Date(payload.archivedAt) : undefined,
    },
  });

  if (subject.count === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Subject not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  await prisma.subject.updateMany({
    where: { id, userId: user.id },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
