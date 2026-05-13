import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  EDUAI_APP_POLICY_FEATURES_V1,
  EDUAI_APP_SIX_FACTOR_DECISION_V1,
  EXAMPLES_LEVEL_VALUES,
  PRESENTATION_FORMAT_VALUES,
  SIX_FACTOR_DECISION_SOURCE_VALUES,
  SUPPORT_LEVEL_VALUES,
  TERMINOLOGY_LEVEL_VALUES,
  type EduAIAppPolicyFeaturesV1,
  type EduAISixFactorMlConfigV1,
  type SixFactorDecisionSource,
} from "@/lib/ml-six-factor-policy-contract";
import { sanitizeAppPolicyFeatures } from "@/lib/ml-six-factor-feature-builder";
import { type SixFactorDecisionMetadataV1 } from "@/lib/ml-six-factor-shadow";

export const SIX_FACTOR_DELIVERED_CONFIG_METADATA_VERSION =
  "six_factor_delivered_config_v1_2026_05" as const;

export type SixFactorDeliveredConfigMetadataV1 = {
  metadataVersion: typeof SIX_FACTOR_DELIVERED_CONFIG_METADATA_VERSION;
  sixFactorDecisionVersion: typeof EDUAI_APP_SIX_FACTOR_DECISION_V1;
  featuresVersion: typeof EDUAI_APP_POLICY_FEATURES_V1;
  featuresSnapshot: EduAIAppPolicyFeaturesV1;
  candidateConfig: EduAISixFactorMlConfigV1;
  deliveredConfig: EduAISixFactorMlConfigV1;
  decisionSource: SixFactorDecisionSource;
  policyId: string | null;
  modelVersion: string | null;
  artifactPath: string | null;
  backendKind: string | null;
  fallbackUsed: boolean;
  candidateCount: number | null;
  confidence: number | null;
  warnings: string[];
  appliedToLearnerFacingOutput: boolean;
  appliedPath: string | null;
  appliedPromptInstructionCount: number | null;
  decisionCreatedAt: string;
  featuresCutoffAt: string;
  leakageGuard: {
    usesOnlyPreDecisionData: true;
    notes: string | null;
  };
};

type DateInput = Date | string | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toIso(value: DateInput, fallback: string) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => entry != null);
}

function isAllowed<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

export function isMlSixFactorConfig(
  value: unknown,
): value is EduAISixFactorMlConfigV1 {
  if (!isRecord(value)) return false;

  return (
    isAllowed(value.difficulty, DIFFICULTY_VALUES) &&
    isAllowed(value.depth, DEPTH_VALUES) &&
    isAllowed(value.support_level, SUPPORT_LEVEL_VALUES) &&
    isAllowed(value.presentation_format, PRESENTATION_FORMAT_VALUES) &&
    isAllowed(value.examples_level, EXAMPLES_LEVEL_VALUES) &&
    isAllowed(value.terminology_level, TERMINOLOGY_LEVEL_VALUES)
  );
}

export function buildSixFactorDeliveredConfigMetadata(params: {
  sixFactorShadow: SixFactorDecisionMetadataV1;
  decisionCreatedAt?: DateInput;
  featuresCutoffAt?: DateInput;
  appliedPath?: string | null;
  leakageNotes?: string | null;
  warnings?: string[];
}): SixFactorDeliveredConfigMetadataV1 {
  const nowIso = new Date().toISOString();
  const decisionCreatedAt = toIso(params.decisionCreatedAt, nowIso);

  return {
    metadataVersion: SIX_FACTOR_DELIVERED_CONFIG_METADATA_VERSION,
    sixFactorDecisionVersion: EDUAI_APP_SIX_FACTOR_DECISION_V1,
    featuresVersion: EDUAI_APP_POLICY_FEATURES_V1,
    featuresSnapshot: params.sixFactorShadow.featuresSnapshot,
    candidateConfig: params.sixFactorShadow.candidateConfig,
    deliveredConfig: params.sixFactorShadow.deliveredConfig,
    decisionSource: params.sixFactorShadow.decisionSource,
    policyId: params.sixFactorShadow.policyId,
    modelVersion: params.sixFactorShadow.modelVersion,
    artifactPath: params.sixFactorShadow.artifactPath,
    backendKind: params.sixFactorShadow.backendKind,
    fallbackUsed: params.sixFactorShadow.fallbackUsed,
    candidateCount: params.sixFactorShadow.candidateCount,
    confidence: params.sixFactorShadow.confidence,
    warnings: [
      ...params.sixFactorShadow.warnings,
      ...(params.warnings ?? []),
    ],
    appliedToLearnerFacingOutput:
      params.sixFactorShadow.appliedToLearnerFacingOutput,
    appliedPath: params.appliedPath ?? params.sixFactorShadow.appliedPath,
    appliedPromptInstructionCount:
      params.sixFactorShadow.appliedPromptInstructionCount,
    decisionCreatedAt,
    featuresCutoffAt: toIso(params.featuresCutoffAt, decisionCreatedAt),
    leakageGuard: {
      usesOnlyPreDecisionData: true,
      notes:
        params.leakageNotes ??
        "Canonical six-factor delivered_config metadata; feature snapshot is pre-decision only.",
    },
  };
}

export function buildOptionalSixFactorDeliveredConfigMetadata(params: {
  sixFactorShadow: SixFactorDecisionMetadataV1 | null | undefined;
  decisionCreatedAt?: DateInput;
  featuresCutoffAt?: DateInput;
  appliedPath?: string | null;
  leakageNotes?: string | null;
  warnings?: string[];
}) {
  if (!params.sixFactorShadow) return null;
  return buildSixFactorDeliveredConfigMetadata({
    sixFactorShadow: params.sixFactorShadow,
    decisionCreatedAt: params.decisionCreatedAt,
    featuresCutoffAt: params.featuresCutoffAt,
    appliedPath: params.appliedPath,
    leakageNotes: params.leakageNotes,
    warnings: params.warnings,
  });
}

function normalizeCandidateCount(value: unknown) {
  const numeric = readNumber(value);
  if (numeric == null) return null;
  const integer = Math.floor(numeric);
  return integer > 0 ? integer : null;
}

function normalizeConfidence(value: unknown) {
  const numeric = readNumber(value);
  if (numeric == null) return null;
  return Math.max(0, Math.min(1, numeric));
}

function readCanonicalMetadata(
  value: Record<string, unknown>,
): SixFactorDeliveredConfigMetadataV1 | null {
  if (
    !isMlSixFactorConfig(value.candidateConfig) ||
    !isMlSixFactorConfig(value.deliveredConfig) ||
    !isAllowed(value.decisionSource, SIX_FACTOR_DECISION_SOURCE_VALUES)
  ) {
    return null;
  }

  const fallbackIso = new Date().toISOString();
  const decisionCreatedAt = toIso(value.decisionCreatedAt as DateInput, fallbackIso);
  const leakageGuard = isRecord(value.leakageGuard) ? value.leakageGuard : {};

  return {
    metadataVersion: SIX_FACTOR_DELIVERED_CONFIG_METADATA_VERSION,
    sixFactorDecisionVersion: EDUAI_APP_SIX_FACTOR_DECISION_V1,
    featuresVersion: EDUAI_APP_POLICY_FEATURES_V1,
    featuresSnapshot: sanitizeAppPolicyFeatures(
      isRecord(value.featuresSnapshot) ? value.featuresSnapshot : {},
    ),
    candidateConfig: value.candidateConfig,
    deliveredConfig: value.deliveredConfig,
    decisionSource: value.decisionSource,
    policyId: readString(value.policyId),
    modelVersion: readString(value.modelVersion),
    artifactPath: readString(value.artifactPath),
    backendKind: readString(value.backendKind),
    fallbackUsed:
      typeof value.fallbackUsed === "boolean" ? value.fallbackUsed : true,
    candidateCount: normalizeCandidateCount(value.candidateCount),
    confidence: normalizeConfidence(value.confidence),
    warnings: readWarnings(value.warnings),
    appliedToLearnerFacingOutput:
      value.appliedToLearnerFacingOutput === true,
    appliedPath: readString(value.appliedPath),
    appliedPromptInstructionCount: normalizeCandidateCount(
      value.appliedPromptInstructionCount,
    ),
    decisionCreatedAt,
    featuresCutoffAt: toIso(value.featuresCutoffAt as DateInput, decisionCreatedAt),
    leakageGuard: {
      usesOnlyPreDecisionData: true,
      notes: readString(leakageGuard.notes),
    },
  };
}

export function readSixFactorDeliveredConfigMetadata(
  value: unknown,
): SixFactorDeliveredConfigMetadataV1 | null {
  if (!isRecord(value)) return null;

  if (isRecord(value.sixFactorDeliveredConfig)) {
    return readSixFactorDeliveredConfigMetadata(value.sixFactorDeliveredConfig);
  }

  const canonical = readCanonicalMetadata(value);
  if (canonical) return canonical;

  if (isRecord(value.sixFactorShadow)) {
    return readSixFactorDeliveredConfigMetadata(value.sixFactorShadow);
  }

  if (
    isMlSixFactorConfig(value.candidateConfig) &&
    isMlSixFactorConfig(value.deliveredConfig) &&
    isRecord(value.featuresSnapshot) &&
    isAllowed(value.decisionSource, SIX_FACTOR_DECISION_SOURCE_VALUES)
  ) {
    return buildSixFactorDeliveredConfigMetadata({
      sixFactorShadow: value as SixFactorDecisionMetadataV1,
      decisionCreatedAt: readString(value.decisionCreatedAt),
      featuresCutoffAt: readString(value.featuresCutoffAt),
      appliedPath: readString(value.appliedPath),
    });
  }

  return null;
}
