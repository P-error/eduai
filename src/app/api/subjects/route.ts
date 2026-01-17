import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

const CreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
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

  const subjects = await prisma.subject.findMany({
    where: {
      userId: user.id,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(subjects);
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
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
  }

  const subject = await prisma.subject.create({
    data: {
      userId: user.id,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      collectionId: payload.collectionId ?? null,
    },
  });

  return NextResponse.json(subject);
}
