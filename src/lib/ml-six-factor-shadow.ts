import {
  EDUAI_APP_POLICY_FEATURES_V1,
  EDUAI_APP_SIX_FACTOR_DECISION_V1,
  toMlSixFactorConfig,
  type EduAIAppPolicyFeaturesV1,
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  buildEduAIAppPolicyFeaturesV1,
  type BuildEduAIAppPolicyFeaturesInput,
} from "@/lib/ml-six-factor-feature-builder";
import {
  buildSixFactorPromptInstructions,
  mapSixFactorDecisionToRenderPolicy,
  type SixFactorRenderPolicyV1,
} from "@/lib/ml-six-factor-render-mapping";
import { resolveSixFactorPolicyDecisionForFeatures } from "@/lib/ml-six-factor-policy-adapter";

export const SIX_FACTOR_SHADOW_ENV = "EDUAI_SIX_FACTOR_SHADOW" as const;

export type SixFactorDecisionMetadataV1 = {
  sixFactorDecisionVersion: typeof EDUAI_APP_SIX_FACTOR_DECISION_V1;
  featuresVersion: typeof EDUAI_APP_POLICY_FEATURES_V1;
  candidateConfig: ReturnType<typeof toMlSixFactorConfig>;
  deliveredConfig: ReturnType<typeof toMlSixFactorConfig>;
  decisionSource: EduAIAppSixFactorDecisionV1["decisionSource"];
  policyId: string | null;
  modelVersion: string | null;
  backendKind: string | null;
  artifactPath: string | null;
  fallbackUsed: boolean;
  candidateCount: number | null;
  confidence: number | null;
  warnings: string[];
  featuresSnapshot: EduAIAppPolicyFeaturesV1;
  featureRefs: {
    userRef: string;
    subjectRef: string | null;
    topicRef: string | null;
    sessionRef: string | null;
    contentEventRef: string | null;
  };
  leakageGuard: {
    usesOnlyPreDecisionData: true;
    outcomeFieldsIncluded: false;
  };
  appliedToLearnerFacingOutput: boolean;
  appliedPromptInstructionCount: number | null;
  appliedPath: string | null;
};

export type SixFactorShadowResultV1 = {
  features: EduAIAppPolicyFeaturesV1;
  decision: EduAIAppSixFactorDecisionV1;
  renderPolicy: SixFactorRenderPolicyV1;
  promptInstructions: SixFactorRenderPolicyV1["sixFactorPromptInstructions"];
  metadata: SixFactorDecisionMetadataV1;
  shadowMode: true;
  appliedToLearnerFacingOutput: boolean;
};

function disabledValue(value: unknown) {
  return (
    typeof value === "string" &&
    ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
  );
}

export function isSixFactorShadowEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return !disabledValue(env[SIX_FACTOR_SHADOW_ENV]);
}

export function buildSixFactorDecisionMetadata(
  decision: EduAIAppSixFactorDecisionV1,
  features: EduAIAppPolicyFeaturesV1,
): SixFactorDecisionMetadataV1 {
  const sixFactorConfig = toMlSixFactorConfig(decision);

  return {
    sixFactorDecisionVersion: EDUAI_APP_SIX_FACTOR_DECISION_V1,
    featuresVersion: EDUAI_APP_POLICY_FEATURES_V1,
    candidateConfig: sixFactorConfig,
    deliveredConfig: sixFactorConfig,
    decisionSource: decision.decisionSource,
    policyId: decision.policyId,
    modelVersion: decision.modelVersion,
    backendKind: decision.backendKind,
    artifactPath: decision.artifactPath,
    fallbackUsed: decision.fallbackUsed,
    candidateCount: decision.candidateCount,
    confidence: decision.confidence,
    warnings: decision.warnings,
    featuresSnapshot: features,
    featureRefs: {
      userRef: features.userRef,
      subjectRef: features.subjectRef,
      topicRef: features.topicRef,
      sessionRef: features.sessionRef,
      contentEventRef: features.contentEventRef,
    },
    leakageGuard: {
      usesOnlyPreDecisionData: true,
      outcomeFieldsIncluded: false,
    },
    appliedToLearnerFacingOutput: false,
    appliedPromptInstructionCount: null,
    appliedPath: null,
  };
}

export function buildShadowSixFactorDecision(
  context: BuildEduAIAppPolicyFeaturesInput,
  env: Record<string, string | undefined> = process.env,
): SixFactorShadowResultV1 {
  const features = buildEduAIAppPolicyFeaturesV1(context);
  const shadowDecision = resolveSixFactorPolicyDecisionForFeatures(features, {
    env,
  });
  const renderPolicy = mapSixFactorDecisionToRenderPolicy(shadowDecision);

  return {
    features,
    decision: shadowDecision,
    renderPolicy,
    promptInstructions: buildSixFactorPromptInstructions(shadowDecision),
    metadata: buildSixFactorDecisionMetadata(shadowDecision, features),
    shadowMode: true,
    appliedToLearnerFacingOutput: false,
  };
}

export function buildOptionalSixFactorShadowMetadata(
  context: BuildEduAIAppPolicyFeaturesInput,
  env: Record<string, string | undefined> = process.env,
) {
  if (!isSixFactorShadowEnabled(env)) {
    return null;
  }

  return buildShadowSixFactorDecision(context, env).metadata;
}
