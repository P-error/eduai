import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { LEARNING_DIALOGUE_MAX_MESSAGE_CHARS } from "@/lib/chat";
import { appendLearningEpisodeDialogueTurn } from "@/lib/learning-dialogue";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const DialogueTurnSchema = z.object({
  message: z.string().trim().min(1).max(LEARNING_DIALOGUE_MAX_MESSAGE_CHARS),
});

function mapDialogueError(error: unknown) {
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
  if (error.message === "EPISODE_LEARNING_DIALOGUE_UNAVAILABLE") {
    return NextResponse.json(
      {
        error: "INVALID_EPISODE_STEP",
        message: "Dialogue is only available during the learning-content step.",
      },
      { status: 409 },
    );
  }
  if (error.message === "EPISODE_DIALOGUE_TURN_LIMIT_REACHED") {
    return NextResponse.json(
      {
        error: "DIALOGUE_TURN_LIMIT_REACHED",
        message: "The dialogue loop limit for this episode step has been reached.",
      },
      { status: 409 },
    );
  }
  if (error.message === "EPISODE_STEP_CHAT_NOT_FOUND") {
    return NextResponse.json(
      {
        error: "INVALID_EVALUATION_EPISODE",
        message: "Episode dialogue session is missing.",
      },
      { status: 400 },
    );
  }
  if (error.message === "LEARNING_DIALOGUE_MESSAGE_TOO_LONG") {
    return NextResponse.json(
      {
        error: "INVALID_INPUT",
        message: "Dialogue message is too long.",
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
      routeClass: "chat_turn",
      request,
      userId: user.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Learn dialogue rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  let payload: z.infer<typeof DialogueTurnSchema>;
  try {
    payload = DialogueTurnSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid dialogue payload." },
      { status: 400 },
    );
  }

  try {
    const state = await appendLearningEpisodeDialogueTurn(
      {
        id: user.id,
        personalizationReady: user.personalizationReady,
        declaredPreferencesJson: user.declaredPreferencesJson,
        effectivePreferencesJson: user.effectivePreferencesJson,
      },
      id,
      payload.message,
    );
    return NextResponse.json(state);
  } catch (error) {
    const mapped = mapDialogueError(error);
    if (mapped) {
      return mapped;
    }
    if (error instanceof Error && error.message === "LLM_BAD_RESPONSE") {
      return NextResponse.json(
        {
          error: "LLM_BAD_RESPONSE",
          message: "Unable to generate Learn dialogue reply.",
        },
        { status: 502 },
      );
    }
    throw error;
  }
}
