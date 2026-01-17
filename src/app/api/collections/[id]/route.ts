import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

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

  const updated = await prisma.collection.updateMany({
    where: { id, userId: user.id },
    data: {
      name: payload.name?.trim(),
      parentId: payload.parentId ?? undefined,
      sortOrder: payload.sortOrder ?? undefined,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Collection not found." },
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

  await prisma.collection.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
