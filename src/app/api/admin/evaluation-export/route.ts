import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEvaluationEpisodeExport } from "@/lib/evaluation";
import {
  OPERATOR_AUDIT_ACTIONS,
  writeOperatorAuditEvent,
} from "@/lib/operator-audit";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
}

function parseFormat(value: string | null): "jsonl" | "json" | undefined {
  if (value === "jsonl" || value === "json") return value;
  return undefined;
}

function formatTimestamp(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 14);
}

export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const options = {
    timeRangeDays: parsePositiveInt(searchParams.get("timeRangeDays")),
    maxEpisodes: parsePositiveInt(searchParams.get("maxEpisodes")),
    format: parseFormat(searchParams.get("format")),
  };

  try {
    await rateLimitRouteOrThrow({
      routeClass: "admin_evaluation_export",
      request,
      userId: admin.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Evaluation export rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  try {
    const result = await getEvaluationEpisodeExport(prisma, options);
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: admin.id,
      action: OPERATOR_AUDIT_ACTIONS.EVALUATION_EXPORT,
      targetType: "evaluation_episode_export",
      result: "success",
      summary: {
        filters: options,
        counts: result.counts,
        schemaVersion: result.schemaVersion,
      },
    });

    const extension = result.format === "json" ? "json" : "jsonl";
    const contentType =
      result.format === "json"
        ? "application/json; charset=utf-8"
        : "application/x-ndjson; charset=utf-8";
    const fileName = `eduai_evaluation_${formatTimestamp(result.generatedAtIso)}.${extension}`;

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "X-Evaluation-Schema-Version": result.schemaVersion,
        "X-Episodes-Exported": String(result.counts.exportedEpisodes),
      },
    });
  } catch (error) {
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: admin.id,
      action: OPERATOR_AUDIT_ACTIONS.EVALUATION_EXPORT,
      targetType: "evaluation_episode_export",
      result: "failed",
      summary: {
        filters: options,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
