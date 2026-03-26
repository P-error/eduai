import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildUserPredictions } from "@/lib/prediction";
import { getActivePredictionPolicyId } from "@/lib/active-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const subjectId = searchParams.get("subjectId");

  try {
    const predictionPolicyId = await getActivePredictionPolicyId();
    const predictions = await buildUserPredictions({
      prisma,
      userId: user.id,
      subjectId,
      predictionPolicyId,
    });
    return NextResponse.json(predictions);
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to build predictions." },
      { status: 500 },
    );
  }
}
