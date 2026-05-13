import {
  createHeuristicSixFactorFallbackFromTwoFactor,
} from "@/lib/ml-six-factor-fallback";
import {
  resolveSixFactorPolicyDecisionForFeatures,
} from "@/lib/ml-six-factor-policy-adapter";
import {
  type EduAIAppPolicyFeaturesV1,
  type EduAIAppSixFactorDecisionV1,
  type EduAISixFactorMlConfigV1,
  type PresentationFormatFactor,
  type SixFactorCandidateConfigV1,
  toMlSixFactorConfig,
} from "@/lib/ml-six-factor-policy-contract";

export const SIX_FACTOR_EVALUATION_POLICY_MODES = [
  "static_default",
  "declared_preferences_only",
  "heuristic_baseline",
  "ml_policy",
] as const;

export type SixFactorEvaluationPolicyMode =
  (typeof SIX_FACTOR_EVALUATION_POLICY_MODES)[number];

export type SixFactorEvaluationPolicyDecision = {
  policyMode: SixFactorEvaluationPolicyMode;
  candidateConfig: EduAISixFactorMlConfigV1;
  deliveredConfig: EduAISixFactorMlConfigV1;
  decisionSource: EduAIAppSixFactorDecisionV1["decisionSource"];
  fallbackUsed: boolean;
  modelVersion: string | null;
  artifactPath: string | null;
  backendKind: string | null;
  policyId: string | null;
  confidence: number | null;
  candidateCount: number | null;
  warnings: string[];
  decision: EduAIAppSixFactorDecisionV1;
};

export type ResolveSixFactorEvaluationPolicyModeOptions = {
  env?: Record<string, string | undefined>;
  artifactPath?: string | null;
  maxCandidates?: number;
};

const STATIC_AB_EVALUATION_DEFAULT = {
  difficulty: "medium",
  depth: "standard",
  supportLevel: "guided",
  presentationFormat: "qa",
  examplesLevel: "single",
  terminologyLevel: "balanced",
} as const satisfies SixFactorCandidateConfigV1;

function toEvaluationDecision(
  policyMode: SixFactorEvaluationPolicyMode,
  decision: EduAIAppSixFactorDecisionV1,
): SixFactorEvaluationPolicyDecision {
  const config = toMlSixFactorConfig(decision);

  return {
    policyMode,
    candidateConfig: config,
    deliveredConfig: config,
    decisionSource: decision.decisionSource,
    fallbackUsed: decision.fallbackUsed,
    modelVersion: decision.modelVersion,
    artifactPath: decision.artifactPath,
    backendKind: decision.backendKind,
    policyId: decision.policyId,
    confidence: decision.confidence,
    candidateCount: decision.candidateCount,
    warnings: decision.warnings,
    decision,
  };
}

function staticDefaultDecision(): EduAIAppSixFactorDecisionV1 {
  return {
    ...STATIC_AB_EVALUATION_DEFAULT,
    decisionSource: "static_fallback",
    policyId: "six_factor_ab_static_default_v1",
    modelVersion: null,
    artifactPath: null,
    backendKind: "ab_static_default",
    fallbackUsed: false,
    candidateCount: 1,
    confidence: null,
    warnings: [
      "A/B evaluation static_default baseline; this is not ML and not a runtime fallback failure.",
    ],
  };
}

function declaredPreferencesOnlyDecision(
  features: EduAIAppPolicyFeaturesV1,
): EduAIAppSixFactorDecisionV1 {
  const presentationFormat: PresentationFormatFactor =
    features.declaredPreferenceFormat ?? STATIC_AB_EVALUATION_DEFAULT.presentationFormat;

  return {
    difficulty:
      features.declaredPreferenceDifficulty ??
      STATIC_AB_EVALUATION_DEFAULT.difficulty,
    depth: features.declaredPreferenceDepth ?? STATIC_AB_EVALUATION_DEFAULT.depth,
    supportLevel: "guided",
    presentationFormat,
    examplesLevel: "single",
    terminologyLevel: "balanced",
    decisionSource: "heuristic_baseline",
    policyId: "six_factor_ab_declared_preferences_only_v1",
    modelVersion: null,
    artifactPath: null,
    backendKind: "ab_declared_preferences_only",
    fallbackUsed: false,
    candidateCount: 1,
    confidence: null,
    warnings: [
      "A/B evaluation declared_preferences_only baseline uses declared settings only and ignores post-test aggregate adaptation.",
    ],
  };
}

function heuristicBaselineDecision(
  features: EduAIAppPolicyFeaturesV1,
): EduAIAppSixFactorDecisionV1 {
  const decision = createHeuristicSixFactorFallbackFromTwoFactor({
    currentDifficulty: features.previousDifficulty,
    currentDepth: features.previousDepth,
    recentCorrectRate: features.recentCorrectRate,
    declaredPreferenceDifficulty: features.declaredPreferenceDifficulty,
    declaredPreferenceDepth: features.declaredPreferenceDepth,
    policyId: "six_factor_ab_heuristic_baseline_v1",
    backendKind: "ab_heuristic_baseline",
    modelVersion: null,
  });

  return {
    ...decision,
    fallbackUsed: false,
    warnings: [
      ...decision.warnings,
      "A/B evaluation heuristic_baseline is an explicit comparator policy, not an ML policy.",
    ],
  };
}

function mlPolicyDecision(
  features: EduAIAppPolicyFeaturesV1,
  options: ResolveSixFactorEvaluationPolicyModeOptions,
): EduAIAppSixFactorDecisionV1 {
  const env = {
    ...(options.env ?? process.env),
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    ...(options.artifactPath
      ? { EDUAI_SIX_FACTOR_ARTIFACT_PATH: options.artifactPath }
      : {}),
  };

  return resolveSixFactorPolicyDecisionForFeatures(features, {
    env,
    maxCandidates: options.maxCandidates,
  });
}

export function isSixFactorEvaluationPolicyMode(
  value: unknown,
): value is SixFactorEvaluationPolicyMode {
  return (
    typeof value === "string" &&
    SIX_FACTOR_EVALUATION_POLICY_MODES.includes(
      value as SixFactorEvaluationPolicyMode,
    )
  );
}

export function resolveSixFactorEvaluationPolicyMode(
  policyMode: SixFactorEvaluationPolicyMode,
  features: EduAIAppPolicyFeaturesV1,
  options: ResolveSixFactorEvaluationPolicyModeOptions = {},
): SixFactorEvaluationPolicyDecision {
  if (policyMode === "static_default") {
    return toEvaluationDecision(policyMode, staticDefaultDecision());
  }
  if (policyMode === "declared_preferences_only") {
    return toEvaluationDecision(
      policyMode,
      declaredPreferencesOnlyDecision(features),
    );
  }
  if (policyMode === "heuristic_baseline") {
    return toEvaluationDecision(policyMode, heuristicBaselineDecision(features));
  }

  return toEvaluationDecision(policyMode, mlPolicyDecision(features, options));
}
