import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { isDefaultCollectionName } from "@/lib/collection-constants";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  name: z.string().min(2).optional(),
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
      { error: "INVALID_INPUT", message: "Missing collection id." },
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

  if (payload.parentId) {
    const parent = await prisma.collection.findFirst({
      where: { id: payload.parentId, userId: user.id },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Parent collection not found." },
        { status: 400 },
      );
    }
  }

  const current = await prisma.collection.findFirst({
    where: { id, userId: user.id },
  });

  if (!current) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Collection not found." },
      { status: 404 },
    );
  }

  if (isDefaultCollectionName(current.name) && current.parentId === null) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Default collection is locked." },
      { status: 400 },
    );
  }

  if (payload.name || payload.parentId) {
    const nextName = payload.name?.trim() ?? current.name;
    const nextParentId =
      payload.parentId !== undefined ? payload.parentId : current.parentId;

    const existing = await prisma.collection.findFirst({
      where: {
        userId: user.id,
        parentId: nextParentId ?? null,
        name: {
          equals: nextName,
          mode: "insensitive",
        },
        NOT: { id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Collection name already exists." },
        { status: 400 },
      );
    }
  }

  await prisma.collection.updateMany({
    where: { id, userId: user.id },
    data: {
      name: payload.name?.trim(),
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
      { error: "INVALID_INPUT", message: "Missing collection id." },
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

  const current = await prisma.collection.findFirst({
    where: { id, userId: user.id },
  });

  if (!current) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Collection not found." },
      { status: 404 },
    );
  }

  if (isDefaultCollectionName(current.name) && current.parentId === null) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Default collection is locked." },
      { status: 400 },
    );
  }

  await prisma.collection.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
