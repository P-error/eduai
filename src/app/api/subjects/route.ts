import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";
import { ensureDefaultCollection } from "@/lib/collections";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  let subjects = await prisma.subject.findMany({
    where: {
      userId: user.id,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const needsDefault = subjects.some((subject) => !subject.collectionId);
  if (needsDefault) {
    const defaultCollection = await ensureDefaultCollection(user.id);
    await prisma.subject.updateMany({
      where: { userId: user.id, collectionId: null },
      data: { collectionId: defaultCollection.id },
    });
    subjects = await prisma.subject.findMany({
      where: {
        userId: user.id,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  return NextResponse.json(subjects);
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

  const resolvedCollection =
    payload.collectionId
      ? await prisma.collection.findFirst({
          where: { id: payload.collectionId, userId: user.id },
        })
      : await ensureDefaultCollection(user.id);

  if (!resolvedCollection) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Collection not found." } },
      { status: 400 },
    );
  }

  const existing = await prisma.subject.findFirst({
    where: {
      userId: user.id,
      collectionId: resolvedCollection.id,
      archivedAt: null,
      title: {
        equals: payload.title.trim(),
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "CONFLICT", message: "Subject already exists." },
      },
      { status: 409 },
    );
  }

  try {
    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        collectionId: resolvedCollection.id,
      },
    });

    console.info("CREATE_SUBJECT_OK", {
      userId: user.id,
      subjectId: subject.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...subject,
        collectionName: resolvedCollection.name,
        isDefaultCollection:
          resolvedCollection.name.toLowerCase() ===
          DEFAULT_COLLECTION_NAME.toLowerCase(),
      },
    });
  } catch (error) {
    const traceId = `subject_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    console.error("CREATE_SUBJECT_FAIL", {
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
              message: "Subject already exists.",
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
