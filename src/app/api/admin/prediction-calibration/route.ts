import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runPredictionCalibration } from "@/lib/prediction-calibration";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
}

function parseGrid(value: string | null): "small" | "medium" | "large" | undefined {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return undefined;
}

function parseFlag(value: string | null): boolean {
  return value === "1" || value === "true";
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
  const payload = await runPredictionCalibration(prisma, {
    timeRangeDays: parsePositiveInt(searchParams.get("timeRangeDays")),
    maxAttempts: parsePositiveInt(searchParams.get("maxAttempts")),
    includeExcluded: parseFlag(searchParams.get("includeExcluded")),
    includeUnknownEligibility: parseFlag(
      searchParams.get("includeUnknownEligibility"),
    ),
    grid: parseGrid(searchParams.get("grid")),
    apply: parseFlag(searchParams.get("apply")),
  });

  return NextResponse.json(payload);
}
