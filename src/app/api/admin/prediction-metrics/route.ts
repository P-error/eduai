import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPredictionMetrics } from "@/lib/prediction-metrics";

export const runtime = "nodejs";

type WindowKey = "all" | "7d" | "30d";
type PolicyFilter =
  | "any"
  | "personalization_on"
  | "personalization_off"
  | "manual_delivery_override";

function parseWindow(value: string | null): WindowKey {
  if (value === "all" || value === "7d" || value === "30d") return value;
  return "30d";
}

function parsePolicyMode(value: string | null): PolicyFilter {
  if (
    value === "any" ||
    value === "personalization_on" ||
    value === "personalization_off" ||
    value === "manual_delivery_override"
  ) {
    return value;
  }
  return "any";
}

export async function GET(request: Request) {
  const user = await getAdminFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const window = parseWindow(searchParams.get("window"));
  const policyMode = parsePolicyMode(searchParams.get("policyMode"));
  const subjectId = searchParams.get("subjectId");
  const includeExcluded = searchParams.get("includeExcluded") === "1";

  const payload = await getPredictionMetrics(prisma, {
    window,
    policyMode,
    subjectId,
    includeExcluded,
  });
  return NextResponse.json(payload);
}
