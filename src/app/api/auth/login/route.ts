import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueToken, isAdminEmail } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  getRequestIp,
  RateLimitExceededError,
  rateLimitOrThrow,
} from "@/lib/rate-limit";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "@/lib/auth-password";

export const runtime = "nodejs";

const LoginSchema = z.object({
  identifier: z.string().trim().min(2).max(160),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .optional(),
});

const LOGIN_LIMIT_PER_IP_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

function maybeRateLimitLogin(request: Request) {
  try {
    const ip = getRequestIp(request);
    rateLimitOrThrow(`auth:login:ip:${ip}`, LOGIN_LIMIT_PER_IP_PER_HOUR, HOUR_MS);
    return null;
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many login attempts. Please try again later.",
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

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function createLoginResponse(params: {
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
  const rateLimited = maybeRateLimitLogin(request);
  if (rateLimited) {
    return rateLimited;
  }

  let payload: z.infer<typeof LoginSchema>;
  try {
    payload = LoginSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const identifier = payload.identifier.trim();
  const email = isEmail(identifier) ? identifier.toLowerCase() : undefined;
  const externalId = email ? `email:${email}` : `nick:${identifier.toLowerCase()}`;
  const name = email ? identifier.split("@")[0] : identifier;
  try {
    const existing = await prisma.user.findUnique({
      where: { externalId },
      select: {
        id: true,
        externalId: true,
        email: true,
        name: true,
        isAdmin: true,
        passwordHash: true,
      },
    });

    const isAdmin = isAdminEmail(email);
    let user:
      | {
          id: string;
          email: string | null;
          name: string | null;
        }
      | null = null;

    if (payload.password) {
      if (!email) {
        return NextResponse.json(
          {
            error: "INVALID_INPUT",
            message: "Password login requires an email identifier.",
          },
          { status: 400 },
        );
      }

      if (!existing?.passwordHash) {
        return NextResponse.json(
          {
            error: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
          { status: 401 },
        );
      }

      const valid = verifyPassword(payload.password, existing.passwordHash);
      if (!valid) {
        return NextResponse.json(
          {
            error: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
          { status: 401 },
        );
      }

      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: email ?? undefined,
          name,
          isAdmin,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
      user = updated;
    } else {
      if (existing?.passwordHash) {
        return NextResponse.json(
          {
            error: "PASSWORD_REQUIRED",
            message: "This account requires password login.",
          },
          { status: 401 },
        );
      }

      const upserted = await prisma.user.upsert({
        where: { externalId },
        update: {
          email: email ?? undefined,
          name,
          isAdmin,
        },
        create: {
          externalId,
          email,
          name,
          isAdmin,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
      user = upserted;
    }

    const token = issueToken({
      sub: externalId,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    });

    return createLoginResponse({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
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
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Login failed." },
      { status: 500 },
    );
  }
}
