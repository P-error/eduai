import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildAuthCookieOptions, issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { RESEARCH_CONSENT_VERSION } from "@/lib/research-consent";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
} from "@/lib/auth-password";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().min(1).max(120).optional(),
  researchConsent: z.boolean().optional().default(false),
});

async function maybeRateLimitRegister(request: Request) {
  try {
    await rateLimitRouteOrThrow({
      routeClass: "auth_register",
      request,
    });
    return null;
  } catch (error) {
    return buildRateLimitErrorResponse(
      error,
      "Too many registration attempts. Please try again later.",
    );
  }
}

function defaultNameFromEmail(email: string) {
  return email.split("@")[0] ?? "User";
}

function isDatabaseUnavailableError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientInitializationError &&
    typeof error.errorCode === "string"
  ) {
    return error.errorCode === "P1001";
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1001"
  ) {
    return true;
  }

  return false;
}

function createAuthResponse(params: {
  token: string;
  user: { id: string; email: string | null; name: string | null };
}) {
  const response = NextResponse.json({
    ok: true,
    user: {
      id: params.user.id,
      email: params.user.email,
      name: params.user.name,
    },
  });

  response.cookies.set(
    AUTH_COOKIE_NAME,
    params.token,
    buildAuthCookieOptions(),
  );

  return response;
}

export async function POST(request: Request) {
  const rateLimited = await maybeRateLimitRegister(request);
  if (rateLimited) {
    return rateLimited;
  }

  let payload: z.infer<typeof RegisterSchema>;
  try {
    payload = RegisterSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const email = payload.email.trim().toLowerCase();
  const externalId = `email:${email}`;
  const name = payload.name?.trim() || defaultNameFromEmail(email);
  const passwordHash = hashPassword(payload.password);
  const researchConsentAt = payload.researchConsent ? new Date() : null;
  const researchConsentVersion = payload.researchConsent
    ? RESEARCH_CONSENT_VERSION
    : null;

  try {
    const user = await prisma.user.create({
      data: {
        externalId,
        email,
        passwordHash,
        researchConsentAt,
        researchConsentVersion,
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const token = issueToken({
      userId: user.id,
    });

    return createAuthResponse({ token, user });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          error: "DB_UNAVAILABLE",
          message: "Database is unavailable. Try again later.",
        },
        { status: 503 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "EMAIL_TAKEN",
          message: "Email is already used by another account.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to create account." },
      { status: 500 },
    );
  }
}
