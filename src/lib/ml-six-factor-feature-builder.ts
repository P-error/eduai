import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  PRESENTATION_FORMAT_VALUES,
  type DepthFactor,
  type DifficultyFactor,
  type EduAIAppPolicyFeaturesV1,
  type PresentationFormatFactor,
} from "@/lib/ml-six-factor-policy-contract";

export const FORBIDDEN_APP_POLICY_FEATURE_FIELDS = [
  "postScore",
  "post_score",
  "nextStepSuccess",
  "next_step_success",
  "normalizedLearningGain",
  "normalized_learning_gain",
  "outcome",
  "outcomeAvailable",
  "outcome_available",
] as const;

export type BuildEduAIAppPolicyFeaturesInput =
  Partial<Record<keyof EduAIAppPolicyFeaturesV1, unknown>> & {
    [key: string]: unknown;
    userId?: unknown;
    user_ref?: unknown;
    subjectId?: unknown;
    subject_ref?: unknown;
    topicId?: unknown;
    topic_ref?: unknown;
    conceptKey?: unknown;
    skillKey?: unknown;
    familyKey?: unknown;
    topic?: unknown;
    sessionId?: unknown;
    contentEventId?: unknown;
    policy_id?: unknown;
    backend_kind?: unknown;
    model_version?: unknown;
    difficulty?: unknown;
    depth?: unknown;
    currentDifficulty?: unknown;
    currentDepth?: unknown;
    difficultyTarget?: unknown;
    historicalSignals?: unknown;
    declaredPreferences?: unknown;
    declaredPreferencesJson?: unknown;
    totalAttemptsBefore?: unknown;
    totalQuestionsBefore?: unknown;
    recentAccuracy?: unknown;
    timeSinceLastAttemptSec?: unknown;
    timeSinceLastActivitySec?: unknown;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readNonNegativeInteger(value: unknown, fallback = 0) {
  const numeric = readNumber(value);
  if (numeric == null) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function readNullableNonNegativeInteger(value: unknown) {
  const numeric = readNumber(value);
  if (numeric == null) return null;
  return Math.max(0, Math.floor(numeric));
}

function readRate(value: unknown): number | null {
  const numeric = readNumber(value);
  if (numeric == null) return null;
  return Math.max(0, Math.min(1, numeric));
}

function readNonNegativeNumber(value: unknown): number | null {
  const numeric = readNumber(value);
  if (numeric == null) return null;
  return Math.max(0, numeric);
}

function readNestedRecord(root: Record<string, unknown>, key: string) {
  const value = root[key];
  return isRecord(value) ? value : {};
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value)
    ? (value as T[number])
    : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = readString(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value != null);
}

function resolveTopicRef(input: BuildEduAIAppPolicyFeaturesInput) {
  return firstString(
    input.topicRef,
    input.topicId,
    input.topic_ref,
    input.conceptKey,
    input.skillKey,
    input.familyKey,
    input.topic,
  );
}

function resolveMinutesSinceLastActivity(
  input: BuildEduAIAppPolicyFeaturesInput,
  historicalSignals: Record<string, unknown>,
) {
  const explicit = readNonNegativeNumber(
    firstDefined(
      input.minutesSinceLastActivity,
      historicalSignals.minutesSinceLastActivity,
    ),
  );
  if (explicit != null) return explicit;

  const seconds = readNonNegativeNumber(
    firstDefined(
      input.timeSinceLastAttemptSec,
      input.timeSinceLastActivitySec,
      historicalSignals.timeSinceLastAttemptSec,
      historicalSignals.timeSinceLastActivitySec,
    ),
  );
  return seconds == null ? null : seconds / 60;
}

function readDeclaredPreferences(input: BuildEduAIAppPolicyFeaturesInput) {
  if (isRecord(input.declaredPreferences)) return input.declaredPreferences;
  if (isRecord(input.declaredPreferencesJson)) return input.declaredPreferencesJson;
  return {};
}

function resolveDeclaredFormat(
  input: BuildEduAIAppPolicyFeaturesInput,
  declared: Record<string, unknown>,
): PresentationFormatFactor | null {
  const raw = firstString(
    input.declaredPreferenceFormat,
    declared.presentationFormat,
    declared.presentation_format,
  );
  if (raw === "mcq") return null;
  return readEnum(raw, PRESENTATION_FORMAT_VALUES);
}

export function sanitizeAppPolicyFeatures(
  features: Partial<Record<keyof EduAIAppPolicyFeaturesV1, unknown>>,
): EduAIAppPolicyFeaturesV1 {
  return {
    userRef: readString(features.userRef) ?? "unknown_user",
    subjectRef: readString(features.subjectRef),
    topicRef: readString(features.topicRef),
    sessionRef: readString(features.sessionRef),
    contentEventRef: readString(features.contentEventRef),
    priorAttemptsCount: readNonNegativeInteger(features.priorAttemptsCount),
    priorCorrectRate: readRate(features.priorCorrectRate),
    recentCorrectRate: readRate(features.recentCorrectRate),
    recentAttemptsCount: readNonNegativeInteger(features.recentAttemptsCount),
    topicSeenCount: readNullableNonNegativeInteger(features.topicSeenCount),
    minutesSinceLastActivity: readNonNegativeNumber(
      features.minutesSinceLastActivity,
    ),
    sessionPosition: readNullableNonNegativeInteger(features.sessionPosition),
    declaredPreferenceDifficulty: readEnum(
      features.declaredPreferenceDifficulty,
      DIFFICULTY_VALUES,
    ),
    declaredPreferenceDepth: readEnum(
      features.declaredPreferenceDepth,
      DEPTH_VALUES,
    ),
    declaredPreferenceFormat: readEnum(
      features.declaredPreferenceFormat,
      PRESENTATION_FORMAT_VALUES,
    ),
    previousDifficulty: readEnum(features.previousDifficulty, DIFFICULTY_VALUES),
    previousDepth: readEnum(features.previousDepth, DEPTH_VALUES),
    policyId: readString(features.policyId),
    backendKind: readString(features.backendKind),
    modelVersion: readString(features.modelVersion),
  };
}

export function buildEduAIAppPolicyFeaturesV1(
  input: BuildEduAIAppPolicyFeaturesInput,
): EduAIAppPolicyFeaturesV1 {
  const historicalSignals = readNestedRecord(
    input as Record<string, unknown>,
    "historicalSignals",
  );
  const declared = readDeclaredPreferences(input);
  const priorAttemptsCount = firstDefined(
    input.priorAttemptsCount,
    input.totalAttemptsBefore,
    input.totalQuestionsBefore,
    historicalSignals.totalAttemptsBefore,
    historicalSignals.totalQuestionsBefore,
  );
  const recentCorrectRate = firstDefined(
    input.recentCorrectRate,
    input.recentAccuracy,
    historicalSignals.recentCorrectRate,
    historicalSignals.recentAccuracy,
  );
  const previousDifficulty = firstDefined(
    input.previousDifficulty,
    input.currentDifficulty,
    input.difficulty,
    input.difficultyTarget,
  );
  const previousDepth = firstDefined(
    input.previousDepth,
    input.currentDepth,
    input.depth,
  );

  return sanitizeAppPolicyFeatures({
    userRef: firstString(input.userRef, input.userId, input.user_ref),
    subjectRef: firstString(input.subjectRef, input.subjectId, input.subject_ref),
    topicRef: resolveTopicRef(input),
    sessionRef: firstString(input.sessionRef, input.sessionId),
    contentEventRef: firstString(input.contentEventRef, input.contentEventId),
    priorAttemptsCount,
    priorCorrectRate: firstDefined(
      input.priorCorrectRate,
      historicalSignals.priorCorrectRate,
    ),
    recentCorrectRate,
    recentAttemptsCount: firstDefined(
      input.recentAttemptsCount,
      historicalSignals.recentAttemptsCount,
    ),
    topicSeenCount: firstDefined(input.topicSeenCount, historicalSignals.topicSeenCount),
    minutesSinceLastActivity: resolveMinutesSinceLastActivity(
      input,
      historicalSignals,
    ),
    sessionPosition: input.sessionPosition,
    declaredPreferenceDifficulty: firstDefined(
      input.declaredPreferenceDifficulty,
      declared.difficulty,
      declared.difficulty_target,
    ) as DifficultyFactor | null,
    declaredPreferenceDepth: firstDefined(
      input.declaredPreferenceDepth,
      declared.depth,
    ) as DepthFactor | null,
    declaredPreferenceFormat: resolveDeclaredFormat(input, declared),
    previousDifficulty,
    previousDepth,
    policyId: firstString(input.policyId, input.policy_id),
    backendKind: firstString(input.backendKind, input.backend_kind),
    modelVersion: firstString(input.modelVersion, input.model_version),
  });
}
