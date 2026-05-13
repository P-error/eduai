import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  OPERATOR_AUDIT_ACTIONS,
  writeOperatorAuditEvent,
} from "@/lib/operator-audit";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";

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

  try {
    await rateLimitRouteOrThrow({
      routeClass: "admin_prompt_template_mutation",
      request,
      userId: user.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Prompt template change rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  let payload: z.infer<typeof CreateSchema>;
  try {
    payload = CreateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: user.id,
      action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_CREATE,
      targetType: "prompt_template",
      result: "rejected",
      summary: {
        reason: "invalid_input",
        message,
      },
    });
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
      await writeOperatorAuditEvent({
        prisma,
        request,
        actorUserId: user.id,
        action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_CREATE,
        targetType: "prompt_template",
        targetId: payload.baseId,
        result: "rejected",
        summary: {
          reason: "base_template_not_found",
        },
      });
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

  try {
    const template = await prisma.promptTemplate.create({
      data: {
        key,
        version,
        template: payload.content,
        notes: payload.notes ?? null,
        isActive: false,
      },
    });

    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: user.id,
      action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_CREATE,
      targetType: "prompt_template",
      targetId: template.id,
      result: "success",
      summary: {
        key: template.key,
        version: template.version,
        baseId: payload.baseId ?? null,
      },
    });

    return NextResponse.json({ ok: true, data: template });
  } catch (error) {
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: user.id,
      action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_CREATE,
      targetType: "prompt_template",
      result: "failed",
      summary: {
        key,
        version,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
