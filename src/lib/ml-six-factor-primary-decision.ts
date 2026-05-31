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
  type EduAISixFactorMlConfigV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  buildShadowSixFactorDecisionAsync,
  type SixFactorShadowResultV1,
  type SixFactorDecisionMetadataV1,
} from "@/lib/ml-six-factor-shadow";
import {
  buildSixFactorDecisionFromDeliveredConfigMetadata,
  buildSixFactorDeliveredConfigMetadata,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  buildMlPersonalizationView,
  type MlPersonalizationView,
} from "@/lib/ml-personalization-view";

export type SixFactorPrimarySelectionMode =
  | "baseline_default"
  | "self_report_declared"
  | "predicted_runtime"
  | "heuristic_default"
  | "manual_override"
  | "observational_only";

export type SixFactorCompatibilityPedagogicalDecision = ReturnType<
  typeof buildSixFactorCompatibilityPedagogicalDecision
>;

export type ResolvedPrimarySixFactorDecision = {
  decisionCreatedAt: Date;
  decisionCreatedAtIso: string;
  context: BuildEduAIAppPolicyFeaturesInput;
  shadow: SixFactorShadowResultV1;
  decision: EduAIAppSixFactorDecisionV1;
  features: SixFactorShadowResultV1["features"];
  deliveredConfig: EduAISixFactorMlConfigV1;
  deliveredConfigMetadata: SixFactorDeliveredConfigMetadataV1;
  compatibilityPedagogicalDecision: SixFactorCompatibilityPedagogicalDecision;
  appliedAsPrimary: true;
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

export function buildSixFactorCompatibilityPedagogicalDecisionFromMetadata(
  metadata: SixFactorDeliveredConfigMetadataV1,
) {
  const derivedFrom: "legacy_derived" | "six_factor_primary" =
    metadata.decisionSource === "legacy_derived"
      ? "legacy_derived"
      : "six_factor_primary";

  return {
    ...buildSixFactorDerivedPedagogicalDecision(
      buildSixFactorDecisionFromDeliveredConfigMetadata(metadata),
    ),
    compatibilityRole: "derived_two_factor_projection",
    derivedFrom,
    sixFactorConfig: metadata.deliveredConfig,
    sixFactorDecisionSource: metadata.decisionSource,
    sixFactorFallbackUsed: metadata.fallbackUsed,
  };
}

export function isPrimarySixFactorDecisionMetadata(
  metadata: SixFactorDeliveredConfigMetadataV1 | null | undefined,
): metadata is SixFactorDeliveredConfigMetadataV1 {
  return (
    metadata != null &&
    metadata.appliedAsPrimary === true &&
    metadata.decisionSource !== "legacy_derived" &&
    metadata.decisionSource !== "shadow_only"
  );
}

export function buildPrimarySixFactorPromptContext(
  metadata: SixFactorDeliveredConfigMetadataV1 | null | undefined,
): BuildEduAIAppPolicyFeaturesInput | null {
  return isPrimarySixFactorDecisionMetadata(metadata)
    ? metadata.featuresSnapshot
    : null;
}

export function buildPrimarySixFactorDecisionOverride(
  metadata: SixFactorDeliveredConfigMetadataV1 | null | undefined,
): EduAIAppSixFactorDecisionV1 | null {
  return isPrimarySixFactorDecisionMetadata(metadata)
    ? buildSixFactorDecisionFromDeliveredConfigMetadata(metadata)
    : null;
}

function mergeWarnings(...groups: Array<string[] | null | undefined>) {
  return [
    ...new Set(
      groups
        .flatMap((group) => group ?? [])
        .filter((warning) => warning.trim().length > 0),
    ),
  ];
}

export function buildPrimarySixFactorDeliveredConfigMetadata(params: {
  primaryDecision: SixFactorDeliveredConfigMetadataV1 | null | undefined;
  appliedMetadata?: SixFactorDecisionMetadataV1 | null;
  appliedPath?: string | null;
  warnings?: string[];
}): SixFactorDeliveredConfigMetadataV1 | null {
  const primary = params.primaryDecision;
  if (!primary) return null;
  if (!isPrimarySixFactorDecisionMetadata(primary)) return null;

  if (!params.appliedMetadata) {
    return {
      ...primary,
      appliedAsPrimary: true,
      appliedPath: params.appliedPath ?? primary.appliedPath,
      warnings: mergeWarnings(primary.warnings, params.warnings),
    };
  }

  return buildSixFactorDeliveredConfigMetadata({
    sixFactorShadow: params.appliedMetadata,
    decisionCreatedAt: primary.decisionCreatedAt,
    featuresCutoffAt: primary.featuresCutoffAt,
    appliedPath: params.appliedPath ?? params.appliedMetadata.appliedPath,
    appliedAsPrimary: true,
    fallbackReason: primary.fallbackReason,
    warnings: mergeWarnings(primary.warnings, params.warnings),
  });
}

export function buildPrimarySixFactorMlPersonalizationView(
  metadata: SixFactorDeliveredConfigMetadataV1 | null | undefined,
): MlPersonalizationView | null {
  return buildMlPersonalizationView(metadata);
}

export function withPrimarySixFactorDecisionRefs(
  metadata: SixFactorDeliveredConfigMetadataV1 | null | undefined,
  refs: Partial<SixFactorDeliveredConfigMetadataV1["featureRefs"]>,
): SixFactorDeliveredConfigMetadataV1 | null {
  if (!metadata) return null;

  const featureRefs = {
    ...metadata.featureRefs,
    ...Object.fromEntries(
      Object.entries(refs).filter(([, value]) => value !== undefined),
    ),
  } as SixFactorDeliveredConfigMetadataV1["featureRefs"];

  return {
    ...metadata,
    featureRefs,
    featuresSnapshot: {
      ...metadata.featuresSnapshot,
      userRef: featureRefs.userRef,
      subjectRef: featureRefs.subjectRef,
      topicRef: featureRefs.topicRef,
      sessionRef: featureRefs.sessionRef,
      contentEventRef: featureRefs.contentEventRef,
    },
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

  const shadow = await buildShadowSixFactorDecisionAsync(context, params.env);
  const deliveredConfigMetadata = buildSixFactorDeliveredConfigMetadata({
    sixFactorShadow: shadow.metadata,
    decisionCreatedAt,
    featuresCutoffAt: decisionCreatedAt,
    appliedAsPrimary: true,
  });

  return {
    decisionCreatedAt,
    decisionCreatedAtIso: decisionCreatedAt.toISOString(),
    context,
    shadow,
    decision: shadow.decision,
    features: shadow.features,
    deliveredConfig: deliveredConfigMetadata.deliveredConfig,
    deliveredConfigMetadata,
    compatibilityPedagogicalDecision:
      buildSixFactorCompatibilityPedagogicalDecisionFromMetadata(
        deliveredConfigMetadata,
      ),
    appliedAsPrimary: true,
  };
}
