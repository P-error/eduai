import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Admin access required." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error: "deprecated",
      replacement: "/api/admin/data-quality-metrics",
      details:
        "Legacy analytics endpoint removed. Use new admin metrics endpoints.",
    },
    { status: 410 },
  );
}
