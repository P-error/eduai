import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listRecentOperatorAuditEvents } from "@/lib/admin-operational";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = parsePositiveInt(searchParams.get("limit")) ?? 20;

  return NextResponse.json({
    events: await listRecentOperatorAuditEvents(prisma, limit),
  });
}
