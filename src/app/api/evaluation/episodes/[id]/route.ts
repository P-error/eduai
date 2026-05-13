import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getLearningEpisodeState } from "@/lib/learning-episode";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  try {
    const state = await getLearningEpisodeState(user.id, id);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof Error && error.message === "EPISODE_NOT_FOUND") {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Episode not found." },
        { status: 404 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "EPISODE_ORCHESTRATION_MISSING"
    ) {
      return NextResponse.json(
        {
          error: "INVALID_EVALUATION_EPISODE",
          message: "Episode orchestration metadata is missing.",
        },
        { status: 400 },
      );
    }
    throw error;
  }
}
