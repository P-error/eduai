import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { ALL_AXES, TAGS_BY_AXIS } from "@/lib/tags";

export const runtime = "nodejs";

const PreferencesSchema = z.record(z.string());

function filterPreferences(input: Record<string, string>) {
  const filtered: Record<string, string> = {};
  for (const axis of ALL_AXES) {
    if (input[axis]) {
      filtered[axis] = input[axis];
    }
  }
  return filtered;
}

function validatePreferences(input: Record<string, string>) {
  for (const axis of ALL_AXES) {
    const value = input[axis];
    if (!value) continue;

    if (
      axis === "response_format" &&
      value !== "mcq"
    ) {
      return {
        status: 400,
        error: "UNSUPPORTED_FEATURE",
        message: "response_format supports only mcq in this prototype.",
      };
    }

    const allowed = TAGS_BY_AXIS[axis].map((tag) => tag.key);
    if (!allowed.includes(value)) {
      return {
        status: 400,
        error: "INVALID_INPUT",
        message: `Invalid value for axis '${axis}'.`,
      };
    }
  }
  return null;
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    declared: (user.declaredPreferencesJson ?? {}) as Record<string, string>,
    effective: (user.effectivePreferencesJson ?? {}) as Record<string, string>,
  });
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  let payload: Record<string, string>;
  try {
    payload = PreferencesSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const validationError = validatePreferences(payload);
  if (validationError) {
    return NextResponse.json(
      {
        error: validationError.error,
        message: validationError.message,
      },
      { status: validationError.status },
    );
  }

  const declared = filterPreferences(payload);

  await prisma.user.update({
    where: { id: user.id },
    data: { declaredPreferencesJson: declared },
  });

  return NextResponse.json({ ok: true, declared });
}
