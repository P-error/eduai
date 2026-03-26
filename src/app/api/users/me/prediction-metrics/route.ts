import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPredictionMetrics } from "@/lib/prediction-metrics";

export const runtime = "nodejs";

type WindowKey = "all" | "7d" | "30d";

function parseWindow(value: string | null): WindowKey {
  if (value === "all" || value === "7d" || value === "30d") return value;
  return "30d";
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const window = parseWindow(searchParams.get("window"));
  const subjectId = searchParams.get("subjectId");
  const includeExcluded = searchParams.get("includeExcluded") === "1";

  const payload = await getPredictionMetrics(prisma, {
    window,
    policyMode: "any",
    subjectId,
    userId: user.id,
    includeExcluded,
  });

  return NextResponse.json(payload);
}
