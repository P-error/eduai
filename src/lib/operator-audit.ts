import { Prisma, PrismaClient } from "@prisma/client";
import { getRequestIp } from "@/lib/rate-limit";

export const OPERATOR_AUDIT_ACTIONS = {
  DATASET_EXPORT: "dataset_export",
  EVALUATION_EXPORT: "evaluation_export",
  PROMPT_TEMPLATE_CREATE: "prompt_template_create",
  PROMPT_TEMPLATE_UPDATE: "prompt_template_update",
  PROMPT_TEMPLATE_ACTIVATE: "prompt_template_activate",
} as const;

export type OperatorAuditAction =
  (typeof OPERATOR_AUDIT_ACTIONS)[keyof typeof OPERATOR_AUDIT_ACTIONS];

function toAuditSummaryJson(
  value: Record<string, unknown>,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeOperatorAuditEvent(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  request?: Request | null;
  actorUserId?: string | null;
  action: OperatorAuditAction;
  targetType: string;
  targetId?: string | null;
  result: "success" | "rejected" | "failed";
  summary?: Record<string, unknown> | null;
}) {
  await params.prisma.operatorAuditEvent.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      result: params.result,
      ipAddress: params.request ? getRequestIp(params.request) : null,
      summaryJson:
        params.summary == null
          ? Prisma.JsonNull
          : toAuditSummaryJson(params.summary),
    },
  });
}
