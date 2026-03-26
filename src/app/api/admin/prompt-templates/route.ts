import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

const CreateSchema = z.object({
  key: z.string().min(2),
  baseId: z.string().optional(),
  content: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  const templates = await prisma.promptTemplate.findMany({
    where: key ? { key } : undefined,
    orderBy: [{ key: "asc" }, { version: "desc" }],
  });

  return NextResponse.json({ ok: true, data: templates });
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
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

  let key = payload.key.trim();
  if (payload.baseId) {
    const base = await prisma.promptTemplate.findUnique({
      where: { id: payload.baseId },
    });
    if (!base) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Base template not found." } },
        { status: 404 },
      );
    }
    key = base.key;
  }

  const maxVersion = await prisma.promptTemplate.aggregate({
    where: { key },
    _max: { version: true },
  });

  const version = (maxVersion._max.version ?? 0) + 1;

  const template = await prisma.promptTemplate.create({
    data: {
      key,
      version,
      template: payload.content,
      notes: payload.notes ?? null,
      isActive: false,
    },
  });

  return NextResponse.json({ ok: true, data: template });
}
