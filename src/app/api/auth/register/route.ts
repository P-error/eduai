import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueToken, isAdminEmail } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { RESEARCH_CONSENT_VERSION } from "@/lib/research-consent";
import {
  getRequestIp,
  RateLimitExceededError,
  rateLimitOrThrow,
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

const REGISTER_LIMIT_PER_IP_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

function maybeRateLimitRegister(request: Request) {
  try {
    const ip = getRequestIp(request);
    rateLimitOrThrow(
      `auth:register:ip:${ip}`,
      REGISTER_LIMIT_PER_IP_PER_HOUR,
      HOUR_MS,
    );
    return null;
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many registration attempts. Please try again later.",
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    throw error;
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
    token: params.token,
    user: {
      id: params.user.id,
      email: params.user.email,
      name: params.user.name,
    },
  });

  response.cookies.set(AUTH_COOKIE_NAME, params.token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function POST(request: Request) {
  const rateLimited = maybeRateLimitRegister(request);
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
  const isAdmin = isAdminEmail(email);
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
        isAdmin,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const token = issueToken({
      sub: externalId,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
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
