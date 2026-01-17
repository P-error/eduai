import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { ensureDefaultCollection } from "@/lib/collections";

const CreateSchema = z.object({
  name: z.string().trim().min(2),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  await ensureDefaultCollection(user.id);

  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing or invalid token." },
      },
      { status: 401 },
    );
  }

  let payload: z.infer<typeof CreateSchema>;
  try {
    payload = CreateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message } },
      { status: 400 },
    );
  }

  if (payload.parentId) {
    const parent = await prisma.collection.findFirst({
      where: { id: payload.parentId, userId: user.id },
    });
    if (!parent) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INVALID_INPUT", message: "Parent collection not found." },
        },
        { status: 400 },
      );
    }
  }

  const existing = await prisma.collection.findFirst({
    where: {
      userId: user.id,
      parentId: payload.parentId ?? null,
      name: {
        equals: payload.name.trim(),
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "CONFLICT", message: "Collection name already exists." },
      },
      { status: 409 },
    );
  }

  try {
    const collection = await prisma.collection.create({
      data: {
        userId: user.id,
        name: payload.name.trim(),
        parentId: payload.parentId ?? null,
        sortOrder: payload.sortOrder ?? 0,
      },
    });

    console.info("CREATE_COLLECTION_OK", {
      userId: user.id,
      collectionId: collection.id,
    });

    return NextResponse.json({ ok: true, data: collection });
  } catch (error) {
    const traceId = `collection_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    console.error("CREATE_COLLECTION_FAIL", {
      traceId,
      userId: user.id,
      payload,
      error,
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "CONFLICT",
              message: "Collection name already exists.",
              details: { traceId },
            },
          },
          { status: 409 },
        );
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message, details: { traceId } },
      },
      { status: 500 },
    );
  }
}
