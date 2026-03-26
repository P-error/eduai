import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BACKTEST_POLICIES,
  getPredictionBacktest,
  type BacktestPolicyId,
} from "@/lib/prediction-backtest";

export const runtime = "nodejs";

const POLICY_IDS = new Set<BacktestPolicyId>(
  BACKTEST_POLICIES.map((policy) => policy.id),
);

function parsePolicyId(value: string | null): BacktestPolicyId | null {
  if (!value) return null;
  if (POLICY_IDS.has(value as BacktestPolicyId)) {
    return value as BacktestPolicyId;
  }
  return null;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.floor(parsed));
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
  const policyA = parsePolicyId(searchParams.get("policyA"));
  const policyB = parsePolicyId(searchParams.get("policyB"));
  const policyIds = [policyA, policyB].filter(
    (policyId): policyId is BacktestPolicyId => policyId != null,
  );

  const payload = await getPredictionBacktest(prisma, {
    policyIds: policyIds.length > 0 ? policyIds : undefined,
    timeRangeDays: parsePositiveInt(searchParams.get("timeRangeDays")),
    maxAttempts: parsePositiveInt(searchParams.get("maxAttempts")),
    includeExcluded: parseFlag(searchParams.get("includeExcluded")),
    includeUnknownEligibility: parseFlag(
      searchParams.get("includeUnknownEligibility"),
    ),
  });

  return NextResponse.json(payload);
}
