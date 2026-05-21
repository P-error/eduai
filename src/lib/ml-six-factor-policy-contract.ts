export const EDUAI_APP_POLICY_FEATURES_V1 =
  "eduai_app_policy_features_v1_2026_05" as const;
export const EDUAI_APP_SIX_FACTOR_DECISION_V1 =
  "eduai_app_six_factor_decision_v1_2026_05" as const;

export const DIFFICULTY_VALUES = ["easy", "medium", "hard"] as const;
export const DEPTH_VALUES = ["brief", "standard", "detailed"] as const;
export const SUPPORT_LEVEL_VALUES = [
  "minimal",
  "guided",
  "scaffolded",
] as const;
export const PRESENTATION_FORMAT_VALUES = [
  "paragraph",
  "structured_list",
  "step_by_step",
  "qa",
] as const;
export const EXAMPLES_LEVEL_VALUES = ["none", "single", "multiple"] as const;
export const TERMINOLOGY_LEVEL_VALUES = [
  "simple",
  "balanced",
  "technical",
] as const;

export const SIX_FACTOR_DECISION_SOURCE_VALUES = [
  "ml_policy",
  "heuristic_baseline",
  "static_fallback",
  "shadow_only",
  "legacy_derived",
] as const;

export type DifficultyFactor = (typeof DIFFICULTY_VALUES)[number];
export type DepthFactor = (typeof DEPTH_VALUES)[number];
export type SupportLevelFactor = (typeof SUPPORT_LEVEL_VALUES)[number];
export type PresentationFormatFactor =
  (typeof PRESENTATION_FORMAT_VALUES)[number];
export type ExamplesLevelFactor = (typeof EXAMPLES_LEVEL_VALUES)[number];
export type TerminologyLevelFactor =
  (typeof TERMINOLOGY_LEVEL_VALUES)[number];
export type SixFactorDecisionSource =
  (typeof SIX_FACTOR_DECISION_SOURCE_VALUES)[number];

export type EduAIAppPolicyFeaturesV1 = {
  userRef: string;
  subjectRef: string | null;
  topicRef: string | null;
  sessionRef: string | null;
  contentEventRef: string | null;
  priorAttemptsCount: number;
  priorCorrectRate: number | null;
  recentCorrectRate: number | null;
  recentAttemptsCount: number;
  topicSeenCount: number | null;
  minutesSinceLastActivity: number | null;
  sessionPosition: number | null;
  declaredPreferenceDifficulty: DifficultyFactor | null;
  declaredPreferenceDepth: DepthFactor | null;
  declaredPreferenceFormat: PresentationFormatFactor | null;
  previousDifficulty: DifficultyFactor | null;
  previousDepth: DepthFactor | null;
  policyId: string | null;
  backendKind: string | null;
  modelVersion: string | null;
};

export type EduAIAppSixFactorDecisionV1 = {
  difficulty: DifficultyFactor;
  depth: DepthFactor;
  supportLevel: SupportLevelFactor;
  presentationFormat: PresentationFormatFactor;
  examplesLevel: ExamplesLevelFactor;
  terminologyLevel: TerminologyLevelFactor;
  decisionSource: SixFactorDecisionSource;
  policyId: string | null;
  modelVersion: string | null;
  artifactPath: string | null;
  backendKind: string | null;
  fallbackUsed: boolean;
  candidateCount: number | null;
  confidence: number | null;
  warnings: string[];
};

export type EduAISixFactorMlConfigV1 = {
  difficulty: DifficultyFactor;
  depth: DepthFactor;
  support_level: SupportLevelFactor;
  presentation_format: PresentationFormatFactor;
  examples_level: ExamplesLevelFactor;
  terminology_level: TerminologyLevelFactor;
};

export type SixFactorCandidateConfigV1 = Pick<
  EduAIAppSixFactorDecisionV1,
  | "difficulty"
  | "depth"
  | "supportLevel"
  | "presentationFormat"
  | "examplesLevel"
  | "terminologyLevel"
>;

export const STATIC_SIX_FACTOR_BASELINE = {
  difficulty: "medium",
  depth: "standard",
  supportLevel: "guided",
  presentationFormat: "step_by_step",
  examplesLevel: "single",
  terminologyLevel: "balanced",
} as const satisfies Pick<
  EduAIAppSixFactorDecisionV1,
  | "difficulty"
  | "depth"
  | "supportLevel"
  | "presentationFormat"
  | "examplesLevel"
  | "terminologyLevel"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : fallback;
}

function normalizeNullableEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeConfidence(value: unknown): number | null {
  const numeric = normalizeNullableNumber(value);
  if (numeric == null) return null;
  return Math.max(0, Math.min(1, numeric));
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  return integer > 0 ? integer : null;
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => entry != null);
}

export function toMlSixFactorConfig(
  decision: SixFactorCandidateConfigV1,
): EduAISixFactorMlConfigV1 {
  return {
    difficulty: decision.difficulty,
    depth: decision.depth,
    support_level: decision.supportLevel,
    presentation_format: decision.presentationFormat,
    examples_level: decision.examplesLevel,
    terminology_level: decision.terminologyLevel,
  };
}

export function fromMlSixFactorConfig(
  config: EduAISixFactorMlConfigV1,
): SixFactorCandidateConfigV1 {
  return {
    difficulty: normalizeEnum(
      config.difficulty,
      DIFFICULTY_VALUES,
      STATIC_SIX_FACTOR_BASELINE.difficulty,
    ),
    depth: normalizeEnum(config.depth, DEPTH_VALUES, STATIC_SIX_FACTOR_BASELINE.depth),
    supportLevel: normalizeEnum(
      config.support_level,
      SUPPORT_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.supportLevel,
    ),
    presentationFormat: normalizeEnum(
      config.presentation_format,
      PRESENTATION_FORMAT_VALUES,
      STATIC_SIX_FACTOR_BASELINE.presentationFormat,
    ),
    examplesLevel: normalizeEnum(
      config.examples_level,
      EXAMPLES_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.examplesLevel,
    ),
    terminologyLevel: normalizeEnum(
      config.terminology_level,
      TERMINOLOGY_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.terminologyLevel,
    ),
  };
}

export function validateSixFactorCandidateConfig(
  value: unknown,
): value is SixFactorCandidateConfigV1 {
  if (!isRecord(value)) return false;

  return (
    normalizeNullableEnum(value.difficulty, DIFFICULTY_VALUES) != null &&
    normalizeNullableEnum(value.depth, DEPTH_VALUES) != null &&
    normalizeNullableEnum(value.supportLevel, SUPPORT_LEVEL_VALUES) != null &&
    normalizeNullableEnum(value.presentationFormat, PRESENTATION_FORMAT_VALUES) !=
      null &&
    normalizeNullableEnum(value.examplesLevel, EXAMPLES_LEVEL_VALUES) != null &&
    normalizeNullableEnum(value.terminologyLevel, TERMINOLOGY_LEVEL_VALUES) != null
  );
}

export function normalizeSixFactorDecision(
  value: unknown,
): EduAIAppSixFactorDecisionV1 {
  const root = isRecord(value) ? value : {};

  return {
    difficulty: normalizeEnum(
      root.difficulty,
      DIFFICULTY_VALUES,
      STATIC_SIX_FACTOR_BASELINE.difficulty,
    ),
    depth: normalizeEnum(root.depth, DEPTH_VALUES, STATIC_SIX_FACTOR_BASELINE.depth),
    supportLevel: normalizeEnum(
      root.supportLevel,
      SUPPORT_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.supportLevel,
    ),
    presentationFormat: normalizeEnum(
      root.presentationFormat,
      PRESENTATION_FORMAT_VALUES,
      STATIC_SIX_FACTOR_BASELINE.presentationFormat,
    ),
    examplesLevel: normalizeEnum(
      root.examplesLevel,
      EXAMPLES_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.examplesLevel,
    ),
    terminologyLevel: normalizeEnum(
      root.terminologyLevel,
      TERMINOLOGY_LEVEL_VALUES,
      STATIC_SIX_FACTOR_BASELINE.terminologyLevel,
    ),
    decisionSource: normalizeEnum(
      root.decisionSource,
      SIX_FACTOR_DECISION_SOURCE_VALUES,
      "static_fallback",
    ),
    policyId: normalizeString(root.policyId),
    modelVersion: normalizeString(root.modelVersion),
    artifactPath: normalizeString(root.artifactPath),
    backendKind: normalizeString(root.backendKind),
    fallbackUsed:
      typeof root.fallbackUsed === "boolean" ? root.fallbackUsed : true,
    candidateCount: normalizePositiveInteger(root.candidateCount),
    confidence: normalizeConfidence(root.confidence),
    warnings: normalizeWarnings(root.warnings),
  };
}

export function validateSixFactorDecision(
  value: unknown,
): value is EduAIAppSixFactorDecisionV1 {
  if (!isRecord(value)) return false;

  return (
    normalizeNullableEnum(value.difficulty, DIFFICULTY_VALUES) != null &&
    normalizeNullableEnum(value.depth, DEPTH_VALUES) != null &&
    normalizeNullableEnum(value.supportLevel, SUPPORT_LEVEL_VALUES) != null &&
    normalizeNullableEnum(value.presentationFormat, PRESENTATION_FORMAT_VALUES) !=
      null &&
    normalizeNullableEnum(value.examplesLevel, EXAMPLES_LEVEL_VALUES) != null &&
    normalizeNullableEnum(value.terminologyLevel, TERMINOLOGY_LEVEL_VALUES) !=
      null &&
    normalizeNullableEnum(
      value.decisionSource,
      SIX_FACTOR_DECISION_SOURCE_VALUES,
    ) != null &&
    typeof value.fallbackUsed === "boolean" &&
    (value.candidateCount == null ||
      (typeof value.candidateCount === "number" &&
        Number.isInteger(value.candidateCount) &&
        value.candidateCount > 0)) &&
    (value.confidence == null ||
      (typeof value.confidence === "number" &&
        value.confidence >= 0 &&
        value.confidence <= 1)) &&
    Array.isArray(value.warnings)
  );
}

export function isSixFactorDecision(
  value: unknown,
): value is EduAIAppSixFactorDecisionV1 {
  return validateSixFactorDecision(value);
}
