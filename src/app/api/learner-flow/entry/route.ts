import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { resolveLearnerFlowEntryTarget } from "@/lib/learner-flow-contract";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const [subject, activeEpisode] = await Promise.all([
    prisma.subject.findFirst({
      where: {
        userId: user.id,
        archivedAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true },
    }),
    prisma.evaluationEpisode.findFirst({
      where: {
        userId: user.id,
        status: "active",
      },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true },
    }),
  ]);

  const state = {
    hasSubjects: Boolean(subject?.id),
    activeEpisodeId: activeEpisode?.id ?? null,
  };

  return NextResponse.json({
    ok: true,
    state,
    target: resolveLearnerFlowEntryTarget(state),
  });
}
