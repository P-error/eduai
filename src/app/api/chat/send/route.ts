import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated",
      replacement: "/api/chat",
      details: "Use new redacted chat pipeline",
    },
    { status: 410 },
  );
}
