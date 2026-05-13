import { NextResponse } from "next/server";
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

  const template = await prisma.promptTemplate.findUnique({ where: { id } });
  if (!template) {
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: user.id,
      action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_ACTIVATE,
      targetType: "prompt_template",
      targetId: id,
      result: "rejected",
      summary: {
        reason: "template_not_found",
      },
    });
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Template not found." } },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.promptTemplate.updateMany({
        where: { key: template.key, isActive: true },
        data: { isActive: false },
      });
      await tx.promptTemplate.update({
        where: { id: template.id },
        data: { isActive: true },
      });

      await writeOperatorAuditEvent({
        prisma: tx,
        request,
        actorUserId: user.id,
        action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_ACTIVATE,
        targetType: "prompt_template",
        targetId: template.id,
        result: "success",
        summary: {
          key: template.key,
          version: template.version,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: user.id,
      action: OPERATOR_AUDIT_ACTIONS.PROMPT_TEMPLATE_ACTIVATE,
      targetType: "prompt_template",
      targetId: template.id,
      result: "failed",
      summary: {
        key: template.key,
        version: template.version,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
