import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSubjectRecommendation } from "@/lib/recommendation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  const { subjectId } = await params;
  if (!subjectId) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Missing subject id." } },
      { status: 400 },
    );
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid token." } },
      { status: 401 },
    );
  }

  const recommendation = await getSubjectRecommendation(user.id, subjectId);
  if (!recommendation.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: recommendation.rationale } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    preset: recommendation.preset,
    rationale: recommendation.rationale,
    dataStatus: recommendation.dataStatus,
  });
}
