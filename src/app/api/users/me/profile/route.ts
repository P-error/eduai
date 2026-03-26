import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildUserProfile } from "@/lib/profile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  try {
    const profile = await buildUserProfile(prisma, user.id);
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to build user profile." },
      { status: 500 },
    );
  }
}
