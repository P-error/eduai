import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

const CreateSchema = z.object({
  name: z.string().min(2),
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

  const collection = await prisma.collection.create({
    data: {
      userId: user.id,
      name: payload.name.trim(),
      parentId: payload.parentId ?? null,
      sortOrder: payload.sortOrder ?? 0,
    },
  });

  return NextResponse.json(collection);
}
