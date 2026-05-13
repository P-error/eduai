import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { sanitizePreferenceMap } from "@/lib/tags";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const effective = sanitizePreferenceMap(
    (user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
  );

  if (Object.keys(effective).length === 0) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "No effective preferences yet." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { declaredPreferencesJson: effective },
  });

  return NextResponse.json({ ok: true, declared: effective });
}
