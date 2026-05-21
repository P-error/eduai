import { type PrismaClient } from "@prisma/client";
import {
  type BuildEduAIAppPolicyFeaturesInput,
} from "@/lib/ml-six-factor-feature-builder";
import { buildLearnerStateAggregatesForSixFactorPolicy } from "@/lib/ml-six-factor-learner-state-features";
import {
  isSixFactorMlPolicyEnabled,
} from "@/lib/ml-six-factor-policy-adapter";
import {
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  buildShadowSixFactorDecision,
  type SixFactorShadowResultV1,
} from "@/lib/ml-six-factor-shadow";

export type SixFactorPrimarySelectionMode =
  | "baseline_default"
  | "self_report_declared"
  | "predicted_runtime"
  | "heuristic_default"
  | "manual_override"
  | "observational_only";

export type ResolvedPrimarySixFactorDecision = {
  decisionCreatedAt: Date;
  decisionCreatedAtIso: string;
  context: BuildEduAIAppPolicyFeaturesInput;
  shadow: SixFactorShadowResultV1;
};

export function shouldUseSixFactorAsPrimaryDecision(params: {
  personalizationMode: "on" | "off" | null | undefined;
  selectionMode: SixFactorPrimarySelectionMode;
  env?: Record<string, string | undefined>;
}) {
  if (params.personalizationMode !== "on") return false;
  if (!isSixFactorMlPolicyEnabled(params.env)) return false;
  return (
    params.selectionMode === "predicted_runtime" ||
    params.selectionMode === "observational_only"
  );
}

export function buildSixFactorDerivedPedagogicalDecision(
  decision: Pick<EduAIAppSixFactorDecisionV1, "difficulty" | "depth">,
) {
  return {
    difficulty: decision.difficulty,
    depth: decision.depth,
  };
}

export function buildSixFactorCompatibilityPedagogicalDecision(params: {
  decision: Pick<EduAIAppSixFactorDecisionV1, "difficulty" | "depth">;
  source: "six_factor_primary" | "legacy_derived";
}) {
  return {
    ...buildSixFactorDerivedPedagogicalDecision(params.decision),
    compatibilityRole: "derived_two_factor_projection",
    derivedFrom: params.source,
  };
}

export async function resolvePrimarySixFactorDecision(params: {
  prisma: PrismaClient;
  userId: string;
  subjectId?: string | null;
  topicRef?: string | null;
  conceptKey?: string | null;
  skillKey?: string | null;
  familyKey?: string | null;
  topic?: string | null;
  sessionRef?: string | null;
  contentEventRef?: string | null;
  previousDifficulty?: string | null;
  previousDepth?: string | null;
  declaredPreferences?: Record<string, unknown> | null;
  policyId?: string | null;
  backendKind?: string | null;
  modelVersion?: string | null;
  decisionCreatedAt?: Date;
  env?: Record<string, string | undefined>;
}): Promise<ResolvedPrimarySixFactorDecision> {
  const decisionCreatedAt = params.decisionCreatedAt ?? new Date();
  const learnerStateAggregates =
    await buildLearnerStateAggregatesForSixFactorPolicy({
      prisma: params.prisma,
      userId: params.userId,
      subjectId: params.subjectId ?? null,
      topicRef: params.topicRef ?? params.conceptKey ?? params.skillKey ?? null,
      conceptKey: params.conceptKey ?? null,
      skillKey: params.skillKey ?? null,
      familyKey: params.familyKey ?? null,
      topic: params.topic ?? null,
      evaluationEpisodeId: params.sessionRef ?? null,
      decisionCreatedAt,
    });
  const context = {
    userRef: params.userId,
    subjectRef: params.subjectId ?? null,
    topicRef: params.topicRef ?? params.conceptKey ?? params.skillKey ?? null,
    conceptKey: params.conceptKey ?? null,
    skillKey: params.skillKey ?? null,
    familyKey: params.familyKey ?? null,
    topic: params.topic ?? null,
    sessionRef: params.sessionRef ?? null,
    contentEventRef: params.contentEventRef ?? null,
    ...learnerStateAggregates,
    previousDifficulty: params.previousDifficulty ?? null,
    previousDepth: params.previousDepth ?? null,
    declaredPreferences: params.declaredPreferences ?? {},
    policyId: params.policyId ?? null,
    backendKind: params.backendKind ?? null,
    modelVersion: params.modelVersion ?? null,
  } satisfies BuildEduAIAppPolicyFeaturesInput;

  return {
    decisionCreatedAt,
    decisionCreatedAtIso: decisionCreatedAt.toISOString(),
    context,
    shadow: buildShadowSixFactorDecision(context, params.env),
  };
}
