import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { advanceLearningEpisode } from "@/lib/learning-episode";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const AdvanceSchema = z.object({
  acknowledgeLearningContent: z.boolean().optional().default(false),
});

function mapEpisodeError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === "EPISODE_NOT_FOUND") {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Episode not found." },
      { status: 404 },
    );
  }
  if (error.message === "EPISODE_ORCHESTRATION_MISSING") {
    return NextResponse.json(
      {
        error: "INVALID_EVALUATION_EPISODE",
        message: "Episode orchestration metadata is missing.",
      },
      { status: 400 },
    );
  }

  return null;
}

export async function POST(
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
    await rateLimitRouteOrThrow({
      routeClass: "episode_advance",
      request,
      userId: user.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Episode advance rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  let payload: z.infer<typeof AdvanceSchema>;
  try {
    payload = AdvanceSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid advance payload." },
      { status: 400 },
    );
  }

  try {
    const state = await advanceLearningEpisode(
      {
        id: user.id,
        personalizationReady: user.personalizationReady,
        declaredPreferencesJson: user.declaredPreferencesJson,
        effectivePreferencesJson: user.effectivePreferencesJson,
      },
      id,
      payload.acknowledgeLearningContent,
    );

    return NextResponse.json(state);
  } catch (error) {
    const mapped = mapEpisodeError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}
