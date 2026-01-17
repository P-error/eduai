import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/admin-analytics";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  const payload = await getAdminAnalytics();
  return NextResponse.json(payload);
}
