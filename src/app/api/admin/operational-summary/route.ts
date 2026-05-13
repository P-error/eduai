import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminOperationalSummary } from "@/lib/admin-operational";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  return NextResponse.json(await getAdminOperationalSummary(prisma));
}
