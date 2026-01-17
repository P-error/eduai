import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    testsTaken: user.testsTaken,
    personalizationReady: user.personalizationReady,
    declaredPreferences: user.declaredPreferencesJson ?? {},
    effectivePreferences: user.effectivePreferencesJson ?? {},
  });
}
