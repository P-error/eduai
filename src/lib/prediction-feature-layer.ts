import {
  clampDifficulty,
  clampQuestionCount,
  clampResponseFormat,
} from "@/lib/prediction-baselines";
import {
  buildDurationTelemetryEvidence,
  type DurationHistoricalAttempt,
} from "@/lib/prediction-duration";
import {
  ACCURACY_ML_FEATURE_SCHEMA,
  ACCURACY_ML_FEATURE_SCHEMA_VERSION,
  PREDICTION_FEATURE_PAYLOAD_VERSION,
  type AccuracyMlFeatureInput,
  type AccuracyMlFeatureName,
  type AccuracyMlFeatureVector,
  type PredictionAccuracyWindowEvidence,
  type PredictionFeaturePayload,
} from "@/lib/prediction-contract";

export type PredictionHistoryAttempt = {
  score: number;
  byTagJson: unknown;
  createdAt: Date;
  test: {
    subjectId: string;
    questionCount: number;
  };
};

export type PredictionAccuracyHistoryAttempt = {
  createdAt: Date;
  questionCount: number;
  score: number;
  learningEligible: boolean | null;
};

const ACCURACY_HISTORY_WINDOW_ATTEMPTS = 10;
const SUBJECT_CLEAN_MIN_ATTEMPTS = 3;
const RECENT_HISTORY_WINDOW = 10;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseLearningEligibility(byTagJson: unknown): boolean | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const meta = (byTagJson as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== "object") return null;
  const learning = (meta as Record<string, unknown>).learning;
  if (!learning || typeof learning !== "object") return null;
  const eligible = (learning as Record<string, unknown>).eligible;
  return typeof eligible === "boolean" ? eligible : null;
}

function isCleanAttempt(attempt: PredictionHistoryAttempt) {
  return parseLearningEligibility(attempt.byTagJson) === true;
}

function isFallbackAttempt(attempt: PredictionHistoryAttempt) {
  return parseLearningEligibility(attempt.byTagJson) !== false;
}

function summarizeQuestionEvidence(
  scope: PredictionAccuracyWindowEvidence["scope"],
  attempts: PredictionHistoryAttempt[],
): PredictionAccuracyWindowEvidence {
  let correctQuestions = 0;
  let totalQuestions = 0;

  for (const attempt of attempts) {
    const questionCount = clampQuestionCount(attempt.test.questionCount);
    const rawCorrect = Math.round(attempt.score * questionCount);
    const boundedCorrect = Math.max(0, Math.min(questionCount, rawCorrect));
    correctQuestions += boundedCorrect;
    totalQuestions += questionCount;
  }

  return {
    scope,
    attemptCount: attempts.length,
    totalQuestions,
    correctQuestions,
    meanAccuracy:
      totalQuestions > 0 ? clamp01(correctQuestions / totalQuestions) : null,
  };
}

export function toPredictionAccuracyHistoryAttempts(
  attempts: PredictionHistoryAttempt[],
): PredictionAccuracyHistoryAttempt[] {
  return attempts.map((attempt) => ({
    createdAt: attempt.createdAt,
    questionCount: attempt.test.questionCount,
    score: attempt.score,
    learningEligible: parseLearningEligibility(attempt.byTagJson),
  }));
}

export function buildPredictionFeaturePayload(params: {
  historyAttempts: PredictionHistoryAttempt[];
  durationAttempts: DurationHistoricalAttempt[];
  subjectId?: string | null;
  difficultyTarget: string | null | undefined;
  responseFormat: string | null | undefined;
  questionCount: number | null | undefined;
  currentAt?: Date;
}): PredictionFeaturePayload {
  const currentAt = params.currentAt ?? new Date();
  const difficultyTarget = clampDifficulty(params.difficultyTarget);
  const responseFormat = clampResponseFormat(params.responseFormat);
  const questionCount = clampQuestionCount(params.questionCount);
  const orderedAttempts = [...params.historyAttempts].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const subjectAttempts = params.subjectId
    ? orderedAttempts.filter((attempt) => attempt.test.subjectId === params.subjectId)
    : [];
  const subjectLastNClean = summarizeQuestionEvidence(
    "subject_lastN_clean",
    subjectAttempts.filter(isCleanAttempt).slice(0, ACCURACY_HISTORY_WINDOW_ATTEMPTS),
  );
  const subjectLastNFallback = summarizeQuestionEvidence(
    "subject_lastN_fallback",
    subjectAttempts.filter(isFallbackAttempt).slice(0, ACCURACY_HISTORY_WINDOW_ATTEMPTS),
  );
  const globalLastNClean = summarizeQuestionEvidence(
    "global_lastN_clean",
    orderedAttempts.filter(isCleanAttempt).slice(0, ACCURACY_HISTORY_WINDOW_ATTEMPTS),
  );

  const eligibleAttempts = toPredictionAccuracyHistoryAttempts(orderedAttempts)
    .filter((attempt) => attempt.learningEligible === true)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const totalQuestionsBefore = eligibleAttempts.reduce(
    (sum, attempt) => sum + clampQuestionCount(attempt.questionCount),
    0,
  );
  const recentAccuracy = average(
    eligibleAttempts
      .slice(-RECENT_HISTORY_WINDOW)
      .map((attempt) => clamp01(attempt.score)),
  );
  const lastAttemptAt = eligibleAttempts.at(-1)?.createdAt ?? null;
  const timeSinceLastAttemptSec =
    lastAttemptAt == null
      ? null
      : Math.max(0, Math.floor((currentAt.getTime() - lastAttemptAt.getTime()) / 1000));

  return {
    version: PREDICTION_FEATURE_PAYLOAD_VERSION,
    context: {
      subjectId: params.subjectId ?? null,
      difficultyTarget,
      responseFormat,
      questionCount,
      currentAtIso: currentAt.toISOString(),
    },
    accuracyEvidence: {
      windowAttempts: ACCURACY_HISTORY_WINDOW_ATTEMPTS,
      subjectCleanMinAttempts: SUBJECT_CLEAN_MIN_ATTEMPTS,
      totalHistoryAttemptsScanned: orderedAttempts.length,
      totalLearningEligibleAttempts: eligibleAttempts.length,
      totalQuestionsBefore,
      recentAccuracy,
      timeSinceLastAttemptSec,
      subjectLastNClean,
      subjectLastNFallback,
      globalLastNClean,
    },
    durationEvidence: buildDurationTelemetryEvidence(params.durationAttempts),
  };
}

export function buildAccuracyMlFeatureInputFromPayload(
  payload: PredictionFeaturePayload,
): AccuracyMlFeatureInput {
  return {
    difficultyTarget: payload.context.difficultyTarget,
    questionCount: payload.context.questionCount,
    totalQuestionsBefore: payload.accuracyEvidence.totalQuestionsBefore,
    recentAccuracy: payload.accuracyEvidence.recentAccuracy,
    timeSinceLastAttemptSec: payload.accuracyEvidence.timeSinceLastAttemptSec,
  };
}

export function buildAccuracyMlFeatureInputFromHistory(params: {
  historyAttempts: PredictionAccuracyHistoryAttempt[];
  difficultyTarget: string | null | undefined;
  questionCount: number | null | undefined;
  currentAt?: Date;
}): AccuracyMlFeatureInput {
  const currentAt = params.currentAt ?? new Date();
  const eligibleAttempts = [...params.historyAttempts]
    .filter((attempt) => attempt.learningEligible === true)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  const totalQuestionsBefore = eligibleAttempts.reduce(
    (sum, attempt) => sum + clampQuestionCount(attempt.questionCount),
    0,
  );
  const recentAccuracy = average(
    eligibleAttempts
      .slice(-RECENT_HISTORY_WINDOW)
      .map((attempt) => clamp01(attempt.score)),
  );
  const lastAttemptAt = eligibleAttempts.at(-1)?.createdAt ?? null;
  const timeSinceLastAttemptSec =
    lastAttemptAt == null
      ? null
      : Math.max(0, Math.floor((currentAt.getTime() - lastAttemptAt.getTime()) / 1000));

  return {
    difficultyTarget: params.difficultyTarget,
    questionCount: params.questionCount,
    totalQuestionsBefore,
    recentAccuracy,
    timeSinceLastAttemptSec,
  };
}

export function buildAccuracyMlFeatureVectorFromInput(
  input: AccuracyMlFeatureInput,
): AccuracyMlFeatureVector {
  const difficulty = clampDifficulty(input.difficultyTarget);
  const questionCount = clampQuestionCount(input.questionCount);
  const totalQuestionsBefore = Math.max(0, Math.floor(input.totalQuestionsBefore));
  const recentAccuracy =
    typeof input.recentAccuracy === "number" && Number.isFinite(input.recentAccuracy)
      ? input.recentAccuracy
      : null;
  const timeSinceLastAttemptSec =
    typeof input.timeSinceLastAttemptSec === "number" &&
    Number.isFinite(input.timeSinceLastAttemptSec)
      ? input.timeSinceLastAttemptSec
      : null;

  const values = {
    difficulty_easy: difficulty === "easy" ? 1 : 0,
    difficulty_hard: difficulty === "hard" ? 1 : 0,
    question_count_centered: (questionCount - 5) / 5,
    log_total_questions_before: Math.log1p(totalQuestionsBefore) / 5,
    recent_accuracy_centered: (clamp01(recentAccuracy ?? 0.5) - 0.5) * 2,
    recent_accuracy_missing: recentAccuracy == null ? 1 : 0,
    log_time_since_last_attempt_days:
      timeSinceLastAttemptSec == null
        ? 0
        : Math.log1p(Math.max(0, timeSinceLastAttemptSec) / 86_400),
    time_since_last_attempt_missing: timeSinceLastAttemptSec == null ? 1 : 0,
  } satisfies Record<AccuracyMlFeatureName, number>;

  return {
    schemaVersion: ACCURACY_ML_FEATURE_SCHEMA_VERSION,
    values,
  };
}

export function buildAccuracyMlFeatureVectorFromPayload(
  payload: PredictionFeaturePayload,
): AccuracyMlFeatureVector {
  return buildAccuracyMlFeatureVectorFromInput(
    buildAccuracyMlFeatureInputFromPayload(payload),
  );
}

export function accuracyMlFeatureVectorToArray(
  featureVector: AccuracyMlFeatureVector,
) {
  return ACCURACY_ML_FEATURE_SCHEMA.map(
    (feature) => featureVector.values[feature.name],
  );
}
