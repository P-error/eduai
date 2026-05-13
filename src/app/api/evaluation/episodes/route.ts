import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import {
  EVALUATION_HOLDOUT_STRATEGIES,
  EVALUATION_POLICY_ARMS,
  EVALUATION_SEQUENCE_ROLES,
} from "@/lib/evaluation";
import { createLearningEpisode } from "@/lib/learning-episode";
import { prisma } from "@/lib/prisma";
import { listOperatorEpisodes } from "@/lib/operator-episodes";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const CreateEpisodeSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().min(1).optional().nullable(),
  topic: z.string().min(2),
  clientKey: z.string().min(8).max(120).optional(),
  questionCount: z.number().int().min(1).max(20).optional(),
  mode: z.enum(["quiz", "exam", "practice"]).optional(),
  personalizationMode: z.enum(["on", "off"]).optional(),
  assignmentArm: z.enum(EVALUATION_POLICY_ARMS).optional(),
  conceptKey: z.string().min(1).optional().nullable(),
  skillKey: z.string().min(1).optional().nullable(),
  familyKey: z.string().min(1).optional().nullable(),
  includeHoldout: z.boolean().optional(),
  holdoutStrategy: z.enum(EVALUATION_HOLDOUT_STRATEGIES).optional(),
  delayedRecheckMinutes: z.number().int().positive().optional().nullable(),
  expectedSequenceRoles: z
    .array(z.enum(EVALUATION_SEQUENCE_ROLES))
    .max(6)
    .optional(),
});

function mapEpisodeError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === "EPISODE_SUBJECT_NOT_FOUND") {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Subject not found." },
      { status: 400 },
    );
  }
  if (error.message === "EPISODE_SECTION_NOT_FOUND") {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Section not found." },
      { status: 400 },
    );
  }
  if (
    error.message.startsWith("EVALUATION_ASSIGNMENT_") ||
    error.message.startsWith("EVALUATION_EPISODE_")
  ) {
    return NextResponse.json(
      {
        error: error.message.startsWith("EVALUATION_ASSIGNMENT_")
          ? "INVALID_EVALUATION_ASSIGNMENT"
          : "INVALID_EVALUATION_EPISODE",
        message: error.message.startsWith("EVALUATION_ASSIGNMENT_")
          ? "Evaluation arm conflicts with the requested delivery path."
          : error.message === "EVALUATION_EPISODE_CLIENT_KEY_MISMATCH"
            ? "Episode start key does not match the current learner request."
            : "Evaluation episode linkage is invalid for this request.",
        details: { reason: error.message },
      },
      { status: 400 },
    );
  }

  return null;
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
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus === "active" || rawStatus === "completed" ? rawStatus : null;
  if (rawStatus && !status) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid episode status filter." },
      { status: 400 },
    );
  }

  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : null;
  if (
    rawLimit &&
    (
      parsedLimit == null ||
      !Number.isFinite(parsedLimit) ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1
    )
  ) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid episode limit." },
      { status: 400 },
    );
  }

  const episodes = await listOperatorEpisodes(prisma, user.id, {
    subjectId: searchParams.get("subjectId"),
    status,
    limit: parsedLimit ?? undefined,
  });

  return NextResponse.json({
    episodes,
  });
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  try {
    await rateLimitRouteOrThrow({
      routeClass: "episode_start",
      request,
      userId: user.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Episode start rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  let payload: z.infer<typeof CreateEpisodeSchema>;
  try {
    payload = CreateEpisodeSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid episode payload." },
      { status: 400 },
    );
  }

  try {
    const state = await createLearningEpisode(
      {
        id: user.id,
        personalizationReady: user.personalizationReady,
        declaredPreferencesJson: user.declaredPreferencesJson,
        effectivePreferencesJson: user.effectivePreferencesJson,
      },
      payload,
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
