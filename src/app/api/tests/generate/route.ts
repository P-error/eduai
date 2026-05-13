import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";
import { sanitizeQuestionsForClient } from "@/lib/test-payload";
import {
  GenerateSchema,
  TestGenerationError,
  generateTestForUser,
} from "@/lib/test-generation";

export const runtime = "nodejs";

async function maybeRateLimitGenerate(request: Request, userId: string) {
  try {
    await rateLimitRouteOrThrow({
      routeClass: "test_generate",
      request,
      userId,
    });
    return null;
  } catch (error) {
    return buildRateLimitErrorResponse(
      error,
      "Practice generation rate limit reached. Please try again later.",
    );
  }
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const rateLimited = await maybeRateLimitGenerate(request, user.id);
  if (rateLimited) {
    return rateLimited;
  }

  const rawBody = await request.json();
  const payload = GenerateSchema.parse(rawBody);

  try {
    const result = await generateTestForUser({
      user: {
        id: user.id,
        personalizationReady: user.personalizationReady,
        declaredPreferencesJson: user.declaredPreferencesJson,
        effectivePreferencesJson: user.effectivePreferencesJson,
      },
      payload,
      rawBody,
    });

    return NextResponse.json({
      id: result.id,
      test: {
        title: result.title,
        questions: sanitizeQuestionsForClient(result.questions),
      },
    });
  } catch (error) {
    if (error instanceof TestGenerationError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status },
      );
    }

    throw error;
  }
}
