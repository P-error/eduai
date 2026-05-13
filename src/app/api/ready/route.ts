import { NextResponse } from "next/server";
import { getOperationalReadinessReport } from "@/lib/operational-readiness";

export const runtime = "nodejs";

export async function GET() {
  const report = await getOperationalReadinessReport();
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
  });
}
