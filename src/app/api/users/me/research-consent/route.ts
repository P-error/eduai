import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  buildGrantResearchConsentUpdate,
  buildWithdrawResearchConsentUpdate,
  getTrainingEligibilitySnapshot,
} from "@/lib/training-eligibility";

export const runtime = "nodejs";

const ConsentSchema = z.object({
  consented: z.boolean(),
});

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    consent: getTrainingEligibilitySnapshot(user),
  });
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  let payload: z.infer<typeof ConsentSchema>;
  try {
    payload = ConsentSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: payload.consented
      ? buildGrantResearchConsentUpdate({
          currentExclusionReason: user.trainingDataExclusionReason ?? null,
        })
      : buildWithdrawResearchConsentUpdate(),
    select: {
      researchConsentAt: true,
      researchConsentVersion: true,
      researchConsentWithdrawnAt: true,
      trainingDataExclusionAt: true,
      trainingDataExclusionReason: true,
    },
  });

  return NextResponse.json({
    ok: true,
    consent: getTrainingEligibilitySnapshot(updated),
  });
}
