import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminDatasetExport } from "@/lib/dataset-export";
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

function parseFlag(value: string | null): boolean | undefined {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

function parseFormat(value: string | null): "jsonl" | "csv" | undefined {
  if (value === "jsonl" || value === "csv") return value;
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
    maxAttempts: parsePositiveInt(searchParams.get("maxAttempts")),
    eligibleOnly: parseFlag(searchParams.get("eligibleOnly")),
    consentOnly: parseFlag(searchParams.get("consentOnly")),
    format: parseFormat(searchParams.get("format")),
  };

  try {
    await rateLimitRouteOrThrow({
      routeClass: "admin_dataset_export",
      request,
      userId: admin.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Dataset export rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  try {
    const result = await getAdminDatasetExport(prisma, options);
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: admin.id,
      action: OPERATOR_AUDIT_ACTIONS.DATASET_EXPORT,
      targetType: "training_dataset_export",
      result: "success",
      summary: {
        filters: result.filters,
        counts: result.counts,
        datasetVersion: result.datasetVersion,
      },
    });

    const extension = result.format === "csv" ? "csv" : "jsonl";
    const contentType =
      result.format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/x-ndjson; charset=utf-8";
    const fileName = `eduai_dataset_${formatTimestamp(result.generatedAtIso)}.${extension}`;

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "X-Dataset-Version": result.datasetVersion,
        "X-Records-Scanned": String(result.counts.scanned),
        "X-Records-Exported": String(result.counts.exported),
      },
    });
  } catch (error) {
    await writeOperatorAuditEvent({
      prisma,
      request,
      actorUserId: admin.id,
      action: OPERATOR_AUDIT_ACTIONS.DATASET_EXPORT,
      targetType: "training_dataset_export",
      result: "failed",
      summary: {
        filters: options,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
