import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildAuthCookieOptions, issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "@/lib/auth-password";

export const runtime = "nodejs";

const LoginSchema = z.object({
  identifier: z.string().trim().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

async function maybeRateLimitLogin(request: Request) {
  try {
    await rateLimitRouteOrThrow({
      routeClass: "auth_login",
      request,
    });
    return null;
  } catch (error) {
    return buildRateLimitErrorResponse(
      error,
      "Too many login attempts. Please try again later.",
    );
  }
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
  const rateLimited = await maybeRateLimitLogin(request);
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

  const email = payload.identifier.trim().toLowerCase();
  const externalId = `email:${email}`;
  const defaultName = email.split("@")[0] ?? "User";
  try {
    const existing = await prisma.user.findUnique({
      where: { externalId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
      },
    });

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

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        name: existing.name ?? defaultName,
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
