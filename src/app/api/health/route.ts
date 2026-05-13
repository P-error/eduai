import { NextResponse } from "next/server";
import { getProcessHealthReport } from "@/lib/operational-readiness";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getProcessHealthReport());
}
