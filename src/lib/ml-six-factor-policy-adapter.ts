import {
  buildEduAIAppPolicyFeaturesV1,
  type BuildEduAIAppPolicyFeaturesInput,
} from "@/lib/ml-six-factor-feature-builder";
import {
  type EduAIAppPolicyFeaturesV1,
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  createHeuristicSixFactorFallbackFromTwoFactor,
  createStaticSixFactorFallback,
} from "@/lib/ml-six-factor-fallback";
import {
  getSixFactorArtifactModelFamily,
  getSixFactorArtifactModelVersion,
  loadSixFactorPolicyArtifact,
} from "@/lib/ml-six-factor-artifact-loader";
import { generateSixFactorCandidateSet } from "@/lib/ml-six-factor-candidate-generator";
import { filterUnsafeSixFactorCandidates } from "@/lib/ml-six-factor-guardrails";
import {
  scoreSixFactorCandidates,
  scoreSixFactorCandidatesAsync,
  selectBestSixFactorCandidate,
} from "@/lib/ml-six-factor-runtime-scorer";

export const SIX_FACTOR_ML_POLICY_ENV = "EDUAI_SIX_FACTOR_ML_POLICY" as const;

export type ResolveSixFactorPolicyDecisionOptions = {
  env?: Record<string, string | undefined>;
  maxCandidates?: number;
};

export type ResolveSixFactorPolicyDecisionResult = {
  features: EduAIAppPolicyFeaturesV1;
  decision: EduAIAppSixFactorDecisionV1;
};

function disabledValue(value: unknown) {
  return (
    typeof value === "string" &&
    ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
  );
}

function hasUsableTwoFactorInput(features: EduAIAppPolicyFeaturesV1) {
  return features.previousDifficulty != null || features.previousDepth != null;
}

function fallbackDecisionFromFeatures(
  features: EduAIAppPolicyFeaturesV1,
  warnings: string[] = [],
) {
  const fallback = hasUsableTwoFactorInput(features)
    ? createHeuristicSixFactorFallbackFromTwoFactor({
        currentDifficulty: features.previousDifficulty,
        currentDepth: features.previousDepth,
        recentCorrectRate: features.recentCorrectRate,
        declaredPreferenceDifficulty: features.declaredPreferenceDifficulty,
        declaredPreferenceDepth: features.declaredPreferenceDepth,
        policyId: features.policyId,
        backendKind: features.backendKind,
        modelVersion: features.modelVersion,
      })
    : createStaticSixFactorFallback();

  return {
    ...fallback,
    warnings: [...fallback.warnings, ...warnings],
  };
}

export function isSixFactorMlPolicyEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return !disabledValue(env[SIX_FACTOR_ML_POLICY_ENV]);
}

export function resolveSixFactorPolicyDecisionForFeatures(
  features: EduAIAppPolicyFeaturesV1,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): EduAIAppSixFactorDecisionV1 {
  const env = options.env ?? process.env;

  if (!isSixFactorMlPolicyEnabled(env)) {
    return fallbackDecisionFromFeatures(features, [
      "ML policy explicitly disabled by EDUAI_SIX_FACTOR_ML_POLICY; using six-factor legacy fallback bridge.",
    ]);
  }

  const artifactResult = loadSixFactorPolicyArtifact(env);
  if (!artifactResult.ok) {
    return fallbackDecisionFromFeatures(features, [
      `artifact_error:${artifactResult.errorKind}: ${artifactResult.error}`,
    ]);
  }

  try {
    const fallbackBase = fallbackDecisionFromFeatures(features);
    const candidates = generateSixFactorCandidateSet({
      features,
      baseDecision: fallbackBase,
      maxCandidates: options.maxCandidates,
    });
    const guardrailResult = filterUnsafeSixFactorCandidates(features, candidates);
    const scores = scoreSixFactorCandidates(
      artifactResult.artifact,
      features,
      guardrailResult.candidates,
      artifactResult.artifactPath,
      env,
    );
    const best = selectBestSixFactorCandidate(scores);
    const sortedScores = [...scores].sort(
      (left, right) => right.predictedCombinedScore - left.predictedCombinedScore,
    );
    const secondBest = sortedScores[1]?.predictedCombinedScore;
    const confidence =
      secondBest == null
        ? null
        : Math.max(0, Math.min(1, best.predictedCombinedScore - secondBest));

    return {
      ...best.candidate,
      decisionSource: "ml_policy",
      policyId: features.policyId ?? "six_factor_runtime_ml_policy_v1",
      modelVersion: getSixFactorArtifactModelVersion(artifactResult.artifact),
      artifactPath: artifactResult.artifactPath,
      backendKind: getSixFactorArtifactModelFamily(artifactResult.artifact),
      fallbackUsed: guardrailResult.fallbackUsed,
      candidateCount: guardrailResult.candidates.length,
      confidence,
      warnings: [
        ...artifactResult.warnings,
        ...(guardrailResult.filteredCount > 0
          ? [`guardrails_filtered:${guardrailResult.filteredCount}`]
          : []),
        ...(guardrailResult.fallbackUsed
          ? ["guardrails_safe_fallback_candidate_used"]
          : []),
      ],
    };
  } catch (error) {
    return fallbackDecisionFromFeatures(features, [
      `scoring_error: ${error instanceof Error ? error.message : "Unknown scorer failure."}`,
    ]);
  }
}

export async function resolveSixFactorPolicyDecisionForFeaturesAsync(
  features: EduAIAppPolicyFeaturesV1,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): Promise<EduAIAppSixFactorDecisionV1> {
  const env = options.env ?? process.env;

  if (!isSixFactorMlPolicyEnabled(env)) {
    return fallbackDecisionFromFeatures(features, [
      "ML policy explicitly disabled by EDUAI_SIX_FACTOR_ML_POLICY; using six-factor legacy fallback bridge.",
    ]);
  }

  const artifactResult = loadSixFactorPolicyArtifact(env);
  if (!artifactResult.ok) {
    return fallbackDecisionFromFeatures(features, [
      `artifact_error:${artifactResult.errorKind}: ${artifactResult.error}`,
    ]);
  }

  try {
    const fallbackBase = fallbackDecisionFromFeatures(features);
    const candidates = generateSixFactorCandidateSet({
      features,
      baseDecision: fallbackBase,
      maxCandidates: options.maxCandidates,
    });
    const guardrailResult = filterUnsafeSixFactorCandidates(features, candidates);
    const scores = await scoreSixFactorCandidatesAsync(
      artifactResult.artifact,
      features,
      guardrailResult.candidates,
      artifactResult.artifactPath,
      env,
    );
    const best = selectBestSixFactorCandidate(scores);
    const sortedScores = [...scores].sort(
      (left, right) => right.predictedCombinedScore - left.predictedCombinedScore,
    );
    const secondBest = sortedScores[1]?.predictedCombinedScore;
    const confidence =
      secondBest == null
        ? null
        : Math.max(0, Math.min(1, best.predictedCombinedScore - secondBest));

    return {
      ...best.candidate,
      decisionSource: "ml_policy",
      policyId: features.policyId ?? "six_factor_runtime_ml_policy_v1",
      modelVersion: getSixFactorArtifactModelVersion(artifactResult.artifact),
      artifactPath: artifactResult.artifactPath,
      backendKind: getSixFactorArtifactModelFamily(artifactResult.artifact),
      fallbackUsed: guardrailResult.fallbackUsed,
      candidateCount: guardrailResult.candidates.length,
      confidence,
      warnings: [
        ...artifactResult.warnings,
        ...(guardrailResult.filteredCount > 0
          ? [`guardrails_filtered:${guardrailResult.filteredCount}`]
          : []),
        ...(guardrailResult.fallbackUsed
          ? ["guardrails_safe_fallback_candidate_used"]
          : []),
      ],
    };
  } catch (error) {
    return fallbackDecisionFromFeatures(features, [
      `scoring_error: ${error instanceof Error ? error.message : "Unknown scorer failure."}`,
    ]);
  }
}

export function resolveSixFactorPolicyDecisionWithFeatures(
  context: BuildEduAIAppPolicyFeaturesInput,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): ResolveSixFactorPolicyDecisionResult {
  const features = buildEduAIAppPolicyFeaturesV1(context);
  return {
    features,
    decision: resolveSixFactorPolicyDecisionForFeatures(features, options),
  };
}

export async function resolveSixFactorPolicyDecisionWithFeaturesAsync(
  context: BuildEduAIAppPolicyFeaturesInput,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): Promise<ResolveSixFactorPolicyDecisionResult> {
  const features = buildEduAIAppPolicyFeaturesV1(context);
  return {
    features,
    decision: await resolveSixFactorPolicyDecisionForFeaturesAsync(
      features,
      options,
    ),
  };
}

export function resolveSixFactorPolicyDecision(
  context: BuildEduAIAppPolicyFeaturesInput,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): EduAIAppSixFactorDecisionV1 {
  return resolveSixFactorPolicyDecisionWithFeatures(context, options).decision;
}

export async function resolveSixFactorPolicyDecisionAsync(
  context: BuildEduAIAppPolicyFeaturesInput,
  options: ResolveSixFactorPolicyDecisionOptions = {},
): Promise<EduAIAppSixFactorDecisionV1> {
  return (await resolveSixFactorPolicyDecisionWithFeaturesAsync(context, options))
    .decision;
}
