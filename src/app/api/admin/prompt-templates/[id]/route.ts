import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

const UpdateSchema = z.object({
  content: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Missing template id." } },
      { status: 400 },
    );
  }

  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }

  const template = await prisma.promptTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Template not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: template });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Missing template id." } },
      { status: 400 },
    );
  }

  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }

  let payload: z.infer<typeof UpdateSchema>;
  try {
    payload = UpdateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message } },
      { status: 400 },
    );
  }

  const template = await prisma.promptTemplate.update({
    where: { id },
    data: {
      template: payload.content ?? undefined,
      notes: payload.notes ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, data: template });
}
