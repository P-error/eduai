import { PrismaClient } from "@prisma/client";
import {
  clampQuestionCount,
  difficultyAccuracyAdjust,
  expectedTotalDurationBaselineMs,
} from "./prediction-baselines";
import {
  DURATION_HISTORY_WINDOW_ATTEMPTS,
  DURATION_PREDICTOR_VERSION,
  type DurationPredictorModelParams,
  predictExpectedTotalDurationMsUnified,
} from "./prediction-duration";
import {
  DEFAULT_PREDICTION_MODEL_PARAMS,
  type PredictionModelParams,
  getActivePredictionModelParams,
} from "./prediction-params";

export const BACKTEST_ENGINE_VERSION = "backtest_engine_v1_2026_02";

const ACCURACY_HISTORY_WINDOW_ATTEMPTS = 10;
const SUBJECT_CLEAN_MIN_ATTEMPTS = 3;
const DEFAULT_TIME_RANGE_DAYS = 30;
const DEFAULT_MAX_ATTEMPTS = 1000;
const MAX_MAX_ATTEMPTS = 5000;
const DEFAULT_HISTORY_WINDOW_ATTEMPTS = 200;
const MAX_HISTORY_WINDOW_ATTEMPTS = 500;
const STRAT_TOP_N = 10;

export const POLICY_A_ID = "v1_accuracy_raw_duration_baseline" as const;
export const POLICY_B_ID = "v2_accuracy_beta_duration_unified" as const;

export type BacktestPolicyId = typeof POLICY_A_ID | typeof POLICY_B_ID;

export type BacktestOptions = {
  policyIds?: BacktestPolicyId[];
  timeRangeDays?: number;
  maxAttempts?: number;
  includeExcluded?: boolean;
  includeUnknownEligibility?: boolean;
  historyWindowAttempts?: number;
  policyV2Params?: Partial<PolicyV2TuningParams>;
  seedHistoryByUser?: Map<string, BacktestHistoryAttempt[]> | Record<string, BacktestHistoryAttempt[]>;
};

type PolicyPrediction = {
  expectedAccuracy: number | null;
  expectedTotalDurationMs: number | null;
  durationConfidence?: number;
  durationBasis?: string;
  durationComponents?: {
    baseline: number;
    telemetryAdjustment?: number;
  };
};

export type BacktestHistoryAttempt = {
  createdAt: Date;
  subjectId: string;
  questionCount: number;
  score: number;
  byTagJson: unknown;
  perQuestionFirstAnswerMsJson: unknown;
  learningEligible: boolean | null;
};

type BacktestPolicyContext = {
  userId: string;
  subjectId: string;
  difficultyTarget: string | null;
  responseFormat: string | null;
  questionCount: number;
  historyAttempts: BacktestHistoryAttempt[];
};

type PredictionPolicy = {
  id: BacktestPolicyId;
  label: string;
  description: string;
  predict: (context: BacktestPolicyContext) => PolicyPrediction;
};

export type BacktestAttemptRow = {
  attemptId: string;
  userId: string;
  createdAt: Date;
  subjectId: string;
  questionCount: number;
  difficultyTarget: string | null;
  responseFormat: string | null;
  score: number;
  byTagJson: unknown;
  learningEligible: boolean | null;
  perQuestionFirstAnswerMsJson: unknown;
  actualAccuracy: number | null;
  actualTotalDurationMs: number | null;
  loggedPrediction: {
    expectedAccuracy: number | null;
    expectedTotalDurationMs: number | null;
    durationConfidence: number;
    durationBasis: string;
    predictorVersion: string | null;
  };
};

export type PolicyV2TuningParams = Pick<
  PredictionModelParams,
  | "diffAdjustMag"
  | "betaA"
  | "betaB"
  | "durationPriorQuestions"
  | "durationFullEvidenceQuestions"
>;

type ErrorAccumulator = {
  n: number;
  absSum: number;
  sqSum: number;
  diffSum: number;
  absErrors: number[];
};

type CalibrationBucketAccumulator = {
  bucket: string;
  n: number;
  predSum: number;
  actualSum: number;
};

type StratAccumulator = {
  attempts: number;
  accuracy: ErrorAccumulator;
  durationMs: ErrorAccumulator;
};

type PolicyAccumulator = {
  policyId: BacktestPolicyId;
  label: string;
  description: string;
  attemptsEvaluated: number;
  accuracy: ErrorAccumulator;
  durationMs: ErrorAccumulator;
  calibrationBuckets: CalibrationBucketAccumulator[];
  bySubject: Map<string, StratAccumulator>;
  byDifficulty: Map<string, StratAccumulator>;
};

type LoggedAccumulator = {
  attemptsEvaluated: number;
  accuracy: ErrorAccumulator;
  durationMs: ErrorAccumulator;
  byPredictorVersion: Map<string, ErrorAccumulator>;
};

type NormalizedBacktestOptions = {
  policyIds: BacktestPolicyId[];
  timeRangeDays: number;
  maxAttempts: number;
  includeExcluded: boolean;
  includeUnknownEligibility: boolean;
  historyWindowAttempts: number;
  policyV2Params: PolicyV2TuningParams;
  seedHistoryByUser: Map<string, BacktestHistoryAttempt[]>;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function cloneHistoryAttempt(attempt: BacktestHistoryAttempt): BacktestHistoryAttempt {
  return {
    createdAt: new Date(attempt.createdAt),
    subjectId: attempt.subjectId,
    questionCount: attempt.questionCount,
    score: attempt.score,
    byTagJson: attempt.byTagJson,
    perQuestionFirstAnswerMsJson: attempt.perQuestionFirstAnswerMsJson,
    learningEligible: attempt.learningEligible,
  };
}

function normalizePolicyV2Params(
  input?: Partial<PolicyV2TuningParams>,
): PolicyV2TuningParams {
  const active = getActivePredictionModelParams();
  const fallback = {
    diffAdjustMag: active.diffAdjustMag ?? DEFAULT_PREDICTION_MODEL_PARAMS.diffAdjustMag,
    betaA: active.betaA ?? DEFAULT_PREDICTION_MODEL_PARAMS.betaA,
    betaB: active.betaB ?? DEFAULT_PREDICTION_MODEL_PARAMS.betaB,
    durationPriorQuestions:
      active.durationPriorQuestions ??
      DEFAULT_PREDICTION_MODEL_PARAMS.durationPriorQuestions,
    durationFullEvidenceQuestions:
      active.durationFullEvidenceQuestions ??
      DEFAULT_PREDICTION_MODEL_PARAMS.durationFullEvidenceQuestions,
  };
  return {
    diffAdjustMag: Math.max(
      0,
      Math.min(0.3, parseNumber(input?.diffAdjustMag) ?? fallback.diffAdjustMag),
    ),
    betaA: Math.max(0.01, parseNumber(input?.betaA) ?? fallback.betaA),
    betaB: Math.max(0.01, parseNumber(input?.betaB) ?? fallback.betaB),
    durationPriorQuestions: Math.max(
      1,
      Math.floor(
        parseNumber(input?.durationPriorQuestions) ??
          fallback.durationPriorQuestions,
      ),
    ),
    durationFullEvidenceQuestions: Math.max(
      1,
      Math.floor(
        parseNumber(input?.durationFullEvidenceQuestions) ??
          fallback.durationFullEvidenceQuestions,
      ),
    ),
  };
}

function normalizeSeedHistory(
  seed: BacktestOptions["seedHistoryByUser"],
  historyWindowAttempts: number,
) {
  if (!seed) return new Map<string, BacktestHistoryAttempt[]>();
  const entries = seed instanceof Map ? [...seed.entries()] : Object.entries(seed);
  const normalized = new Map<string, BacktestHistoryAttempt[]>();
  for (const [userId, history] of entries) {
    if (!Array.isArray(history) || history.length === 0) continue;
    const trimmed = history
      .slice(-historyWindowAttempts)
      .map((attempt) => cloneHistoryAttempt(attempt));
    normalized.set(userId, trimmed);
  }
  return normalized;
}

function createErrorAccumulator(): ErrorAccumulator {
  return {
    n: 0,
    absSum: 0,
    sqSum: 0,
    diffSum: 0,
    absErrors: [],
  };
}

function addErrorSample(accumulator: ErrorAccumulator, predicted: number, actual: number) {
  const diff = predicted - actual;
  const abs = Math.abs(diff);
  accumulator.n += 1;
  accumulator.absSum += abs;
  accumulator.sqSum += diff * diff;
  accumulator.diffSum += diff;
  accumulator.absErrors.push(abs);
}

function percentile(sortedValues: number[], q: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(q * sortedValues.length) - 1),
  );
  return sortedValues[index] ?? null;
}

function finalizeErrorStats(
  accumulator: ErrorAccumulator,
  includePercentiles: boolean,
) {
  if (accumulator.n === 0) {
    return {
      n: 0,
      mae: null,
      rmse: null,
      bias: null,
      ...(includePercentiles
        ? { p50AbsError: null, p90AbsError: null }
        : {}),
    };
  }

  const mae = accumulator.absSum / accumulator.n;
  const rmse = Math.sqrt(accumulator.sqSum / accumulator.n);
  const bias = accumulator.diffSum / accumulator.n;

  if (!includePercentiles) {
    return {
      n: accumulator.n,
      mae,
      rmse,
      bias,
    };
  }

  const sortedAbsErrors = [...accumulator.absErrors].sort((a, b) => a - b);
  return {
    n: accumulator.n,
    mae,
    rmse,
    bias,
    p50AbsError: percentile(sortedAbsErrors, 0.5),
    p90AbsError: percentile(sortedAbsErrors, 0.9),
  };
}

function createCalibrationBuckets(): CalibrationBucketAccumulator[] {
  return Array.from({ length: 10 }, (_, index) => {
    const start = (index / 10).toFixed(1);
    const end = ((index + 1) / 10).toFixed(1);
    return {
      bucket: `${start}-${end}`,
      n: 0,
      predSum: 0,
      actualSum: 0,
    };
  });
}

function addCalibrationSample(
  buckets: CalibrationBucketAccumulator[],
  predicted: number,
  actual: number,
) {
  const index = Math.min(9, Math.max(0, Math.floor(clamp01(predicted) * 10)));
  const bucket = buckets[index];
  bucket.n += 1;
  bucket.predSum += predicted;
  bucket.actualSum += actual;
}

function finalizeCalibrationBuckets(buckets: CalibrationBucketAccumulator[]) {
  return buckets.map((bucket) => ({
    bucket: bucket.bucket,
    n: bucket.n,
    avgPredicted: bucket.n > 0 ? bucket.predSum / bucket.n : null,
    avgActual: bucket.n > 0 ? bucket.actualSum / bucket.n : null,
    bias: bucket.n > 0 ? (bucket.predSum - bucket.actualSum) / bucket.n : null,
  }));
}

function createStratAccumulator(): StratAccumulator {
  return {
    attempts: 0,
    accuracy: createErrorAccumulator(),
    durationMs: createErrorAccumulator(),
  };
}

function getOrCreateStrat(
  map: Map<string, StratAccumulator>,
  key: string,
): StratAccumulator {
  const existing = map.get(key);
  if (existing) return existing;
  const created = createStratAccumulator();
  map.set(key, created);
  return created;
}

function finalizeStratification(map: Map<string, StratAccumulator>) {
  return [...map.entries()]
    .map(([label, accumulator]) => ({
      label,
      attempts: accumulator.attempts,
      accuracy: finalizeErrorStats(accumulator.accuracy, false),
      durationMs: finalizeErrorStats(accumulator.durationMs, true),
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, STRAT_TOP_N);
}

function parseLearningEligibility(byTagJson: unknown): boolean | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const root = byTagJson as Record<string, unknown>;
  if (!root._meta || typeof root._meta !== "object") return null;
  const meta = root._meta as Record<string, unknown>;
  if (!meta.learning || typeof meta.learning !== "object") return null;
  const learning = meta.learning as Record<string, unknown>;
  return typeof learning.eligible === "boolean" ? learning.eligible : null;
}

function parseLoggedPrediction(byTagJson: unknown) {
  const root =
    byTagJson && typeof byTagJson === "object"
      ? (byTagJson as Record<string, unknown>)
      : {};
  const meta =
    root._meta && typeof root._meta === "object"
      ? (root._meta as Record<string, unknown>)
      : {};
  const prediction =
    meta.prediction && typeof meta.prediction === "object"
      ? (meta.prediction as Record<string, unknown>)
      : {};

  return {
    expectedAccuracy: parseNumber(prediction.expectedAccuracy),
    expectedTotalDurationMs: parseNumber(prediction.expectedTotalDurationMs),
    durationConfidence: clamp01(parseNumber(prediction.durationConfidence) ?? 0),
    durationBasis:
      typeof prediction.durationBasis === "string"
        ? prediction.durationBasis
        : "baseline_only",
    predictorVersion:
      typeof prediction.predictorVersion === "string"
        ? prediction.predictorVersion
        : null,
    actualTotalDurationMs: parseNumber(prediction.actualTotalDurationMs),
  };
}

function extractDominantTag(byTagJson: unknown, axisKey: string): string | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const root = byTagJson as Record<string, unknown>;
  const axisPayload = root[axisKey];
  if (!axisPayload || typeof axisPayload !== "object") return null;

  const entries = Object.entries(axisPayload as Record<string, unknown>)
    .map(([tagKey, value]) => {
      const total =
        value && typeof value === "object"
          ? Number((value as Record<string, unknown>).total ?? 0)
          : 0;
      return { tagKey, total: Number.isFinite(total) ? total : 0 };
    })
    .sort((a, b) => b.total - a.total);

  return entries[0]?.tagKey ?? null;
}

function deriveActualAccuracy(score: number, questionCount: number) {
  if (!Number.isFinite(score)) return null;
  const totalQuestions = clampQuestionCount(questionCount);
  if (totalQuestions <= 0) return null;
  const rawCorrect = Math.round(score * totalQuestions);
  const correct = Math.max(0, Math.min(totalQuestions, rawCorrect));
  return clamp01(correct / totalQuestions);
}

function shouldIncludeByEligibility(
  learningEligible: boolean | null,
  options: { includeExcluded: boolean; includeUnknownEligibility: boolean },
) {
  if (learningEligible === true) return true;
  if (learningEligible === false) return options.includeExcluded;
  return options.includeUnknownEligibility;
}

function takeRecentAttempts(
  attempts: BacktestHistoryAttempt[],
  predicate: (attempt: BacktestHistoryAttempt) => boolean,
  limit: number,
) {
  const selected: BacktestHistoryAttempt[] = [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (!predicate(attempt)) continue;
    selected.push(attempt);
    if (selected.length >= limit) break;
  }
  return selected;
}

function summarizeQuestionEvidence(attempts: BacktestHistoryAttempt[]) {
  let correctSum = 0;
  let totalSum = 0;

  for (const attempt of attempts) {
    const totalQuestions = clampQuestionCount(attempt.questionCount);
    const rawCorrect = Math.round(attempt.score * totalQuestions);
    const correct = Math.max(0, Math.min(totalQuestions, rawCorrect));
    correctSum += correct;
    totalSum += totalQuestions;
  }

  return { correctSum, totalSum };
}

function pickAccuracyAttemptSet(
  attempts: BacktestHistoryAttempt[],
  subjectId: string,
) {
  const subjectClean = takeRecentAttempts(
    attempts,
    (attempt) =>
      attempt.subjectId === subjectId &&
      attempt.learningEligible === true,
    ACCURACY_HISTORY_WINDOW_ATTEMPTS,
  );
  if (subjectClean.length >= SUBJECT_CLEAN_MIN_ATTEMPTS) {
    return subjectClean;
  }

  const subjectFallback = takeRecentAttempts(
    attempts,
    (attempt) =>
      attempt.subjectId === subjectId &&
      attempt.learningEligible !== false,
    ACCURACY_HISTORY_WINDOW_ATTEMPTS,
  );
  if (subjectFallback.length > 0) {
    return subjectFallback;
  }

  const globalClean = takeRecentAttempts(
    attempts,
    (attempt) => attempt.learningEligible === true,
    ACCURACY_HISTORY_WINDOW_ATTEMPTS,
  );
  if (globalClean.length > 0) {
    return globalClean;
  }

  return [];
}

function createPolicies(
  policyV2Params: PolicyV2TuningParams,
): Record<BacktestPolicyId, PredictionPolicy> {
  const policyA: PredictionPolicy = {
    id: POLICY_A_ID,
    label: "Policy A (Baseline)",
    description: "Raw recent mean accuracy + baseline-only duration.",
    predict: (context) => {
      const selected = pickAccuracyAttemptSet(
        context.historyAttempts,
        context.subjectId,
      );
      const evidence = summarizeQuestionEvidence(selected);
      const expectedAccuracy =
        evidence.totalSum > 0 ? clamp01(evidence.correctSum / evidence.totalSum) : null;

      const baselineDuration = expectedTotalDurationBaselineMs({
        difficultyTarget: context.difficultyTarget,
        responseFormat: context.responseFormat,
        questionCount: context.questionCount,
      });

      return {
        expectedAccuracy,
        expectedTotalDurationMs: baselineDuration,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        durationComponents: {
          baseline: baselineDuration,
        },
      };
    },
  };

  const policyB: PredictionPolicy = {
    id: POLICY_B_ID,
    label: "Policy B (Current)",
    description:
      "Beta-Binomial accuracy + unified duration predictor (telemetry-blended).",
    predict: (context) => {
      const selected = pickAccuracyAttemptSet(
        context.historyAttempts,
        context.subjectId,
      );
      const evidence = summarizeQuestionEvidence(selected);

      let expectedAccuracy: number | null = null;
      if (evidence.totalSum > 0) {
        const posterior =
          (policyV2Params.betaA + evidence.correctSum) /
          (policyV2Params.betaA + policyV2Params.betaB + evidence.totalSum);
        expectedAccuracy = clamp01(
          posterior +
            difficultyAccuracyAdjust(
              context.difficultyTarget,
              policyV2Params.diffAdjustMag,
            ),
        );
      }

      const durationHistory = takeRecentAttempts(
        context.historyAttempts,
        (attempt) => Array.isArray(attempt.perQuestionFirstAnswerMsJson),
        DURATION_HISTORY_WINDOW_ATTEMPTS,
      ).map((attempt) => ({
        createdAt: attempt.createdAt,
        perQuestionFirstAnswerMsJson: attempt.perQuestionFirstAnswerMsJson,
      }));

      const duration = predictExpectedTotalDurationMsUnified({
        difficultyTarget: context.difficultyTarget,
        responseFormat: context.responseFormat,
        questionCount: context.questionCount,
        historicalAttempts: durationHistory,
        modelParams: {
          durationPriorQuestions: policyV2Params.durationPriorQuestions,
          durationFullEvidenceQuestions:
            policyV2Params.durationFullEvidenceQuestions,
        } satisfies DurationPredictorModelParams,
      });

      return {
        expectedAccuracy,
        expectedTotalDurationMs: duration.value,
        durationConfidence: duration.confidence,
        durationBasis: duration.basis,
        durationComponents: duration.components,
      };
    },
  };

  const policies: Record<BacktestPolicyId, PredictionPolicy> = {
    [POLICY_A_ID]: policyA,
    [POLICY_B_ID]: policyB,
  };
  return policies;
}

const POLICY_METADATA = [
  {
    id: POLICY_A_ID,
    label: "Policy A (Baseline)",
    description: "Raw recent mean accuracy + baseline-only duration.",
  },
  {
    id: POLICY_B_ID,
    label: "Policy B (Current)",
    description:
      "Beta-Binomial accuracy + unified duration predictor (telemetry-blended).",
  },
] as const;

export const BACKTEST_POLICIES = POLICY_METADATA.map((policy) => ({
  id: policy.id,
  label: policy.label,
  description: policy.description,
}));

function parseRequestedPolicyIds(policyIds?: BacktestPolicyId[]): BacktestPolicyId[] {
  const defaultIds: BacktestPolicyId[] = [POLICY_A_ID, POLICY_B_ID];
  if (!policyIds || policyIds.length === 0) return defaultIds;
  const deduped = [...new Set(policyIds)].filter(
    (policyId): policyId is BacktestPolicyId =>
      POLICY_METADATA.some((policy) => policy.id === policyId),
  );
  return deduped.length > 0 ? deduped : defaultIds;
}

function normalizeOptions(options: BacktestOptions): NormalizedBacktestOptions {
  const timeRangeDays = Math.max(
    1,
    Math.min(365, Math.floor(options.timeRangeDays ?? DEFAULT_TIME_RANGE_DAYS)),
  );
  const maxAttempts = Math.max(
    10,
    Math.min(MAX_MAX_ATTEMPTS, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
  );
  const historyWindowAttempts = Math.max(
    ACCURACY_HISTORY_WINDOW_ATTEMPTS,
    Math.min(
      MAX_HISTORY_WINDOW_ATTEMPTS,
      Math.floor(options.historyWindowAttempts ?? DEFAULT_HISTORY_WINDOW_ATTEMPTS),
    ),
  );
  const policyV2Params = normalizePolicyV2Params(options.policyV2Params);
  const seedHistoryByUser = normalizeSeedHistory(
    options.seedHistoryByUser,
    historyWindowAttempts,
  );

  return {
    policyIds: parseRequestedPolicyIds(options.policyIds),
    timeRangeDays,
    maxAttempts,
    includeExcluded: Boolean(options.includeExcluded),
    includeUnknownEligibility: Boolean(options.includeUnknownEligibility),
    historyWindowAttempts,
    policyV2Params,
    seedHistoryByUser,
  };
}

function createPolicyAccumulator(policy: PredictionPolicy): PolicyAccumulator {
  return {
    policyId: policy.id,
    label: policy.label,
    description: policy.description,
    attemptsEvaluated: 0,
    accuracy: createErrorAccumulator(),
    durationMs: createErrorAccumulator(),
    calibrationBuckets: createCalibrationBuckets(),
    bySubject: new Map(),
    byDifficulty: new Map(),
  };
}

function createLoggedAccumulator(): LoggedAccumulator {
  return {
    attemptsEvaluated: 0,
    accuracy: createErrorAccumulator(),
    durationMs: createErrorAccumulator(),
    byPredictorVersion: new Map(),
  };
}

function addPolicySample(
  accumulator: PolicyAccumulator,
  row: BacktestAttemptRow,
  prediction: PolicyPrediction,
) {
  accumulator.attemptsEvaluated += 1;

  const subjectBucket = getOrCreateStrat(accumulator.bySubject, row.subjectId);
  subjectBucket.attempts += 1;

  const difficultyBucket = getOrCreateStrat(
    accumulator.byDifficulty,
    row.difficultyTarget ?? "unknown",
  );
  difficultyBucket.attempts += 1;

  if (prediction.expectedAccuracy != null && row.actualAccuracy != null) {
    addErrorSample(
      accumulator.accuracy,
      prediction.expectedAccuracy,
      row.actualAccuracy,
    );
    addCalibrationSample(
      accumulator.calibrationBuckets,
      prediction.expectedAccuracy,
      row.actualAccuracy,
    );
    addErrorSample(
      subjectBucket.accuracy,
      prediction.expectedAccuracy,
      row.actualAccuracy,
    );
    addErrorSample(
      difficultyBucket.accuracy,
      prediction.expectedAccuracy,
      row.actualAccuracy,
    );
  }

  if (
    prediction.expectedTotalDurationMs != null &&
    row.actualTotalDurationMs != null
  ) {
    addErrorSample(
      accumulator.durationMs,
      prediction.expectedTotalDurationMs,
      row.actualTotalDurationMs,
    );
    addErrorSample(
      subjectBucket.durationMs,
      prediction.expectedTotalDurationMs,
      row.actualTotalDurationMs,
    );
    addErrorSample(
      difficultyBucket.durationMs,
      prediction.expectedTotalDurationMs,
      row.actualTotalDurationMs,
    );
  }
}

function addLoggedSample(accumulator: LoggedAccumulator, row: BacktestAttemptRow) {
  accumulator.attemptsEvaluated += 1;

  if (
    row.loggedPrediction.expectedAccuracy != null &&
    row.actualAccuracy != null
  ) {
    addErrorSample(
      accumulator.accuracy,
      row.loggedPrediction.expectedAccuracy,
      row.actualAccuracy,
    );
  }

  if (
    row.loggedPrediction.expectedTotalDurationMs != null &&
    row.actualTotalDurationMs != null
  ) {
    addErrorSample(
      accumulator.durationMs,
      row.loggedPrediction.expectedTotalDurationMs,
      row.actualTotalDurationMs,
    );

    const versionKey =
      row.loggedPrediction.predictorVersion ?? "legacy_unversioned";
    const versionAccumulator =
      accumulator.byPredictorVersion.get(versionKey) ?? createErrorAccumulator();
    addErrorSample(
      versionAccumulator,
      row.loggedPrediction.expectedTotalDurationMs,
      row.actualTotalDurationMs,
    );
    accumulator.byPredictorVersion.set(versionKey, versionAccumulator);
  }
}

export function runPredictionBacktestOnRows(
  rows: BacktestAttemptRow[],
  options: BacktestOptions = {},
) {
  const startedAt = Date.now();
  const normalized = normalizeOptions(options);
  const policyRegistry = createPolicies(normalized.policyV2Params);
  const selectedPolicies = normalized.policyIds.map(
    (policyId) => policyRegistry[policyId],
  );
  const policyAccumulators = new Map<BacktestPolicyId, PolicyAccumulator>(
    selectedPolicies.map((policy) => [policy.id, createPolicyAccumulator(policy)]),
  );
  const loggedAccumulator = createLoggedAccumulator();

  const historyByUser = new Map<string, BacktestHistoryAttempt[]>(
    [...normalized.seedHistoryByUser.entries()].map(([userId, history]) => [
      userId,
      history.map((attempt) => cloneHistoryAttempt(attempt)),
    ]),
  );

  const scanned = {
    total: 0,
    learningEligible: 0,
    learningExcluded: 0,
    learningUnknown: 0,
  };
  const used = {
    total: 0,
    learningEligible: 0,
    learningExcluded: 0,
    learningUnknown: 0,
  };

  for (const row of rows) {
    scanned.total += 1;
    if (row.learningEligible === true) scanned.learningEligible += 1;
    else if (row.learningEligible === false) scanned.learningExcluded += 1;
    else scanned.learningUnknown += 1;

    const include = shouldIncludeByEligibility(row.learningEligible, normalized);
    const history = historyByUser.get(row.userId) ?? [];

    if (include) {
      used.total += 1;
      if (row.learningEligible === true) used.learningEligible += 1;
      else if (row.learningEligible === false) used.learningExcluded += 1;
      else used.learningUnknown += 1;

      const context: BacktestPolicyContext = {
        userId: row.userId,
        subjectId: row.subjectId,
        difficultyTarget: row.difficultyTarget,
        responseFormat: row.responseFormat,
        questionCount: row.questionCount,
        historyAttempts: history,
      };

      for (const policy of selectedPolicies) {
        const prediction = policy.predict(context);
        const accumulator = policyAccumulators.get(policy.id);
        if (!accumulator) continue;
        addPolicySample(accumulator, row, prediction);
      }

      addLoggedSample(loggedAccumulator, row);
    }

    if (include) {
      const nextHistory = [...history, {
        createdAt: row.createdAt,
        subjectId: row.subjectId,
        questionCount: row.questionCount,
        score: row.score,
        byTagJson: row.byTagJson,
        perQuestionFirstAnswerMsJson: row.perQuestionFirstAnswerMsJson,
        learningEligible: row.learningEligible,
      }];

      if (nextHistory.length > normalized.historyWindowAttempts) {
        nextHistory.shift();
      }
      historyByUser.set(row.userId, nextHistory);
    } else {
      historyByUser.set(row.userId, history);
    }
  }

  const policies = selectedPolicies.map((policy) => {
    const accumulator = policyAccumulators.get(policy.id)!;
    return {
      policyId: policy.id,
      label: accumulator.label,
      description: accumulator.description,
      attemptsEvaluated: accumulator.attemptsEvaluated,
      accuracy: {
        ...finalizeErrorStats(accumulator.accuracy, false),
        calibrationBuckets: finalizeCalibrationBuckets(accumulator.calibrationBuckets),
      },
      durationMs: finalizeErrorStats(accumulator.durationMs, true),
      stratified: {
        bySubject: finalizeStratification(accumulator.bySubject),
        byDifficultyTarget: finalizeStratification(accumulator.byDifficulty),
      },
    };
  });

  const loggedMode = {
    attemptsEvaluated: loggedAccumulator.attemptsEvaluated,
    accuracy: finalizeErrorStats(loggedAccumulator.accuracy, false),
    durationMs: finalizeErrorStats(loggedAccumulator.durationMs, true),
    byPredictorVersion: [...loggedAccumulator.byPredictorVersion.entries()]
      .map(([predictorVersion, accumulator]) => ({
        predictorVersion,
        durationMs: finalizeErrorStats(accumulator, true),
      }))
      .sort((a, b) => b.durationMs.n - a.durationMs.n),
  };

  return {
    engineVersion: BACKTEST_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    policyIds: selectedPolicies.map((policy) => policy.id),
    filters: {
      includeExcluded: normalized.includeExcluded,
      includeUnknownEligibility: normalized.includeUnknownEligibility,
      historyWindowAttempts: normalized.historyWindowAttempts,
      policyV2Params: normalized.policyV2Params,
    },
    timeRange: {
      days: normalized.timeRangeDays,
    },
    denominators: {
      scanned,
      used,
    },
    execution: {
      attemptsScanned: scanned.total,
      attemptsUsed: used.total,
      runtimeMs: Date.now() - startedAt,
      maxAttempts: normalized.maxAttempts,
    },
    policies,
    loggedMode,
  };
}

export async function loadPredictionBacktestRows(
  prisma: PrismaClient,
  options: BacktestOptions = {},
) {
  const normalized = normalizeOptions(options);
  const since = new Date(
    Date.now() - normalized.timeRangeDays * 24 * 60 * 60 * 1000,
  );

  const attempts = await prisma.testAttempt.findMany({
    where: {
      createdAt: { gte: since },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      score: true,
      totalDurationMs: true,
      perQuestionFirstAnswerMsJson: true,
      byTagJson: true,
      test: {
        select: {
          subjectId: true,
          questionCount: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: normalized.maxAttempts,
  });

  const rows: BacktestAttemptRow[] = [...attempts].reverse().map((attempt) => {
    const learningEligible = parseLearningEligibility(attempt.byTagJson);
    const loggedPrediction = parseLoggedPrediction(attempt.byTagJson);
    const questionCount = clampQuestionCount(attempt.test.questionCount);
    const actualAccuracy = deriveActualAccuracy(attempt.score, questionCount);
    const actualTotalDurationMs =
      parseNumber(attempt.totalDurationMs) ?? loggedPrediction.actualTotalDurationMs;

    return {
      attemptId: attempt.id,
      userId: attempt.userId,
      createdAt: attempt.createdAt,
      subjectId: attempt.test.subjectId,
      questionCount,
      difficultyTarget: extractDominantTag(attempt.byTagJson, "difficulty_target"),
      responseFormat: extractDominantTag(attempt.byTagJson, "response_format"),
      score: attempt.score,
      byTagJson: attempt.byTagJson,
      learningEligible,
      perQuestionFirstAnswerMsJson: attempt.perQuestionFirstAnswerMsJson,
      actualAccuracy,
      actualTotalDurationMs,
      loggedPrediction: {
        expectedAccuracy: loggedPrediction.expectedAccuracy,
        expectedTotalDurationMs: loggedPrediction.expectedTotalDurationMs,
        durationConfidence: loggedPrediction.durationConfidence,
        durationBasis: loggedPrediction.durationBasis,
        predictorVersion: loggedPrediction.predictorVersion,
      },
    };
  });

  return {
    rows,
    normalized,
    timeRange: {
      days: normalized.timeRangeDays,
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
  };
}

export async function getPredictionBacktest(
  prisma: PrismaClient,
  options: BacktestOptions = {},
) {
  const loaded = await loadPredictionBacktestRows(prisma, options);
  const result = runPredictionBacktestOnRows(loaded.rows, loaded.normalized);

  return {
    ...result,
    timeRange: loaded.timeRange,
  };
}

export function buildBacktestSeedHistory(
  rows: BacktestAttemptRow[],
  options: Pick<
    BacktestOptions,
    "includeExcluded" | "includeUnknownEligibility" | "historyWindowAttempts"
  >,
) {
  const normalized = normalizeOptions({
    includeExcluded: options.includeExcluded,
    includeUnknownEligibility: options.includeUnknownEligibility,
    historyWindowAttempts: options.historyWindowAttempts,
  });
  const historyByUser = new Map<string, BacktestHistoryAttempt[]>();

  for (const row of rows) {
    const include = shouldIncludeByEligibility(row.learningEligible, normalized);
    if (!include) continue;
    const history = historyByUser.get(row.userId) ?? [];
    const nextHistory = [
      ...history,
      {
        createdAt: row.createdAt,
        subjectId: row.subjectId,
        questionCount: row.questionCount,
        score: row.score,
        byTagJson: row.byTagJson,
        perQuestionFirstAnswerMsJson: row.perQuestionFirstAnswerMsJson,
        learningEligible: row.learningEligible,
      },
    ];
    if (nextHistory.length > normalized.historyWindowAttempts) {
      nextHistory.shift();
    }
    historyByUser.set(row.userId, nextHistory);
  }

  return historyByUser;
}

export function countBacktestIncludedRows(
  rows: BacktestAttemptRow[],
  options: Pick<BacktestOptions, "includeExcluded" | "includeUnknownEligibility">,
) {
  const normalized = normalizeOptions({
    includeExcluded: options.includeExcluded,
    includeUnknownEligibility: options.includeUnknownEligibility,
  });
  let included = 0;
  for (const row of rows) {
    if (shouldIncludeByEligibility(row.learningEligible, normalized)) {
      included += 1;
    }
  }
  return included;
}

export function splitBacktestRowsByTime(
  rows: BacktestAttemptRow[],
  calibrationRatio = 0.7,
) {
  if (rows.length <= 1) {
    return {
      calibrationRows: rows,
      holdoutRows: [] as BacktestAttemptRow[],
      splitIndex: rows.length,
    };
  }
  const boundedRatio = Math.max(0.1, Math.min(0.9, calibrationRatio));
  const splitIndex = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * boundedRatio)));
  return {
    calibrationRows: rows.slice(0, splitIndex),
    holdoutRows: rows.slice(splitIndex),
    splitIndex,
  };
}

export function runPredictionBacktestSyntheticSelfCheck() {
  const sampleRows: BacktestAttemptRow[] = [
    {
      attemptId: "a1",
      userId: "u1",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      subjectId: "s1",
      questionCount: 2,
      difficultyTarget: "medium",
      responseFormat: "mcq",
      score: 0.5,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          prediction: {
            expectedAccuracy: 0.5,
            expectedTotalDurationMs: 40000,
            predictorVersion: DURATION_PREDICTOR_VERSION,
          },
        },
        difficulty_target: {
          medium: { correct: 1, total: 2, accuracy: 0.5 },
        },
        response_format: {
          mcq: { correct: 1, total: 2, accuracy: 0.5 },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [10000, 20000],
      actualAccuracy: 0.5,
      actualTotalDurationMs: 30000,
      loggedPrediction: {
        expectedAccuracy: 0.5,
        expectedTotalDurationMs: 40000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: DURATION_PREDICTOR_VERSION,
      },
    },
    {
      attemptId: "a2",
      userId: "u1",
      createdAt: new Date("2026-01-02T10:00:00Z"),
      subjectId: "s1",
      questionCount: 2,
      difficultyTarget: "medium",
      responseFormat: "mcq",
      score: 1,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          prediction: {
            expectedAccuracy: 0.75,
            expectedTotalDurationMs: 35000,
            predictorVersion: DURATION_PREDICTOR_VERSION,
          },
        },
        difficulty_target: {
          medium: { correct: 2, total: 2, accuracy: 1 },
        },
        response_format: {
          mcq: { correct: 2, total: 2, accuracy: 1 },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [12000, 14000],
      actualAccuracy: 1,
      actualTotalDurationMs: 26000,
      loggedPrediction: {
        expectedAccuracy: 0.75,
        expectedTotalDurationMs: 35000,
        durationConfidence: 0.2,
        durationBasis: `${DURATION_PREDICTOR_VERSION}|baseline_telemetry_blend(totalQuestions=2)`,
        predictorVersion: DURATION_PREDICTOR_VERSION,
      },
    },
    {
      attemptId: "a3",
      userId: "u1",
      createdAt: new Date("2026-01-03T10:00:00Z"),
      subjectId: "s1",
      questionCount: 2,
      difficultyTarget: "medium",
      responseFormat: "mcq",
      score: 0,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          prediction: {
            expectedAccuracy: 0.5,
            expectedTotalDurationMs: 38000,
            predictorVersion: DURATION_PREDICTOR_VERSION,
          },
        },
        difficulty_target: {
          medium: { correct: 0, total: 2, accuracy: 0 },
        },
        response_format: {
          mcq: { correct: 0, total: 2, accuracy: 0 },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [18000, 22000],
      actualAccuracy: 0,
      actualTotalDurationMs: 40000,
      loggedPrediction: {
        expectedAccuracy: 0.5,
        expectedTotalDurationMs: 38000,
        durationConfidence: 0.4,
        durationBasis: `${DURATION_PREDICTOR_VERSION}|baseline_telemetry_blend(totalQuestions=4)`,
        predictorVersion: DURATION_PREDICTOR_VERSION,
      },
    },
  ];

  const result = runPredictionBacktestOnRows(sampleRows, {
    policyIds: [POLICY_A_ID],
    includeExcluded: false,
    includeUnknownEligibility: false,
    historyWindowAttempts: 50,
    maxAttempts: 100,
    timeRangeDays: 365,
  });

  const policyA = result.policies.find((policy) => policy.policyId === POLICY_A_ID);
  if (!policyA) {
    throw new Error("self-check failed: policy A result not found");
  }
  if (policyA.attemptsEvaluated !== 3) {
    throw new Error(
      `self-check failed: expected 3 evaluated attempts, got ${policyA.attemptsEvaluated}`,
    );
  }

  const rawMae = policyA.accuracy.mae;
  if (rawMae == null) {
    throw new Error("self-check failed: accuracy MAE missing");
  }
  // Hand-check for Policy A on the synthetic sequence:
  // t1: no history -> null (excluded from MAE)
  // t2: pred=0.5, actual=1.0 => abs err=0.5
  // t3: pred=0.75, actual=0.0 => abs err=0.75
  // MAE=(0.5+0.75)/2=0.625
  if (Math.abs(rawMae - 0.625) > 1e-9) {
    throw new Error(`self-check failed: expected MAE 0.625, got ${rawMae}`);
  }

  return {
    ok: true,
    checkedPolicyId: POLICY_A_ID,
    expectedMae: 0.625,
    actualMae: rawMae,
    attemptsEvaluated: policyA.attemptsEvaluated,
    note: "Policy replay uses strictly prior attempts; MAE matches hand calculation.",
  };
}
