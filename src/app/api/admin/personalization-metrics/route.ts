import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminPersonalizationMetrics } from "@/lib/admin-observability";

export const runtime = "nodejs";

function parseWindow(value: string | null): "7d" | "30d" | "all" {
  if (value === "7d" || value === "30d" || value === "all") return value;
  return "30d";
}

function parsePolicyMode(value: string | null) {
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
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const payload = await getAdminPersonalizationMetrics(prisma, {
    window: parseWindow(searchParams.get("window")),
    policyMode: parsePolicyMode(searchParams.get("policyMode")),
    subjectId: searchParams.get("subjectId"),
    includeExcluded: searchParams.get("includeExcluded") === "1",
  });

  return NextResponse.json(payload);
}
