import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
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

  await prisma.$transaction(async (tx) => {
    await tx.promptTemplate.updateMany({
      where: { key: template.key, isActive: true },
      data: { isActive: false },
    });
    await tx.promptTemplate.update({
      where: { id: template.id },
      data: { isActive: true },
    });
  });

  return NextResponse.json({ ok: true });
}
