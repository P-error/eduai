import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  STATIC_SIX_FACTOR_BASELINE,
  type DepthFactor,
  type DifficultyFactor,
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";

type TwoFactorFallbackInput = {
  difficulty?: unknown;
  depth?: unknown;
  currentDifficulty?: unknown;
  currentDepth?: unknown;
  recentCorrectRate?: unknown;
  declaredPreferenceDifficulty?: unknown;
  declaredPreferenceDepth?: unknown;
  policyId?: unknown;
  backendKind?: unknown;
  modelVersion?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : null;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value != null);
}

export function createStaticSixFactorFallback(): EduAIAppSixFactorDecisionV1 {
  return {
    ...STATIC_SIX_FACTOR_BASELINE,
    decisionSource: "static_fallback",
    policyId: "six_factor_static_fallback_v1",
    modelVersion: null,
    artifactPath: null,
    backendKind: "static_fallback",
    fallbackUsed: true,
    candidateCount: null,
    confidence: 0,
    warnings: [
      "Static six-factor fallback keeps the app contract complete without enabling ML serving.",
    ],
  };
}

export function createHeuristicSixFactorFallbackFromTwoFactor(
  input: TwoFactorFallbackInput,
): EduAIAppSixFactorDecisionV1 {
  const difficulty =
    readEnum(
      firstDefined(
        input.currentDifficulty,
        input.difficulty,
        input.declaredPreferenceDifficulty,
      ),
      DIFFICULTY_VALUES,
    ) ?? STATIC_SIX_FACTOR_BASELINE.difficulty;
  const depth =
    readEnum(
      firstDefined(input.currentDepth, input.depth, input.declaredPreferenceDepth),
      DEPTH_VALUES,
    ) ?? STATIC_SIX_FACTOR_BASELINE.depth;
  const recentCorrectRate = readRate(input.recentCorrectRate);

  const band =
    recentCorrectRate == null
      ? "unknown"
      : recentCorrectRate < 0.45
        ? "low"
        : recentCorrectRate >= 0.8
          ? "high"
          : "medium";

  const supportLevel =
    band === "low" || depth === "detailed"
      ? "scaffolded"
      : band === "high" && depth === "brief"
        ? "minimal"
        : "guided";
  const presentationFormat =
    band === "high" && depth === "brief"
      ? difficulty === "hard"
        ? "paragraph"
        : "structured_list"
      : "step_by_step";
  const examplesLevel =
    band === "low" || depth === "detailed"
      ? "multiple"
      : band === "high" && depth === "brief"
        ? "none"
        : "single";
  const terminologyLevel =
    band === "low" || difficulty === "easy"
      ? "simple"
      : band === "high" && difficulty === "hard"
        ? "technical"
        : "balanced";

  return {
    difficulty: difficulty as DifficultyFactor,
    depth: depth as DepthFactor,
    supportLevel,
    presentationFormat,
    examplesLevel,
    terminologyLevel,
    decisionSource: "heuristic_baseline",
    policyId: readString(input.policyId) ?? "six_factor_two_factor_bridge_v1",
    modelVersion: readString(input.modelVersion),
    artifactPath: null,
    backendKind: readString(input.backendKind) ?? "heuristic_baseline",
    fallbackUsed: true,
    candidateCount: null,
    confidence: 0,
    warnings: [
      "Difficulty and depth are preserved from the current two-factor runtime when valid.",
      "Support, presentation, examples, and terminology are derived bridge values, not ML predictions.",
    ],
  };
}
