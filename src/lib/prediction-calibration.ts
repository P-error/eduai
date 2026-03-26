import { PrismaClient } from "@prisma/client";
import {
  type BacktestAttemptRow,
  type BacktestOptions,
  type PolicyV2TuningParams,
  POLICY_A_ID,
  POLICY_B_ID,
  buildBacktestSeedHistory,
  countBacktestIncludedRows,
  loadPredictionBacktestRows,
  runPredictionBacktestOnRows,
  splitBacktestRowsByTime,
} from "./prediction-backtest";
import {
  type PredictionModelParams,
  getActivePredictionModelParams,
  normalizePredictionModelParams,
  writeCalibratedPredictionParamsConfig,
} from "./prediction-params";

export const CALIBRATION_ENGINE_VERSION = "prediction_calibration_runner_v1_2026_02";

const DEFAULT_TIME_RANGE_DAYS = 30;
const DEFAULT_MAX_ATTEMPTS = 1000;
const DEFAULT_GRID_SIZE = "small" as const;
const DEFAULT_TOP_K_HOLDOUT = 5;
const DEFAULT_CALIBRATION_RATIO = 0.7;
const MIN_CALIBRATION_INCLUDED = 8;
const MIN_HOLDOUT_INCLUDED = 4;
const MAX_TOP_CANDIDATES = 10;

type GridSize = "small" | "medium" | "large";

export type PredictionCalibrationOptions = {
  timeRangeDays?: number;
  maxAttempts?: number;
  includeExcluded?: boolean;
  includeUnknownEligibility?: boolean;
  historyWindowAttempts?: number;
  grid?: GridSize;
  topKHoldout?: number;
  apply?: boolean;
  calibrationRatio?: number;
};

type CalibrationCandidateParams = PolicyV2TuningParams;

type CandidateMetrics = {
  attemptsEvaluated: number;
  accuracy: {
    n: number;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
  };
  durationMs: {
    n: number;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    p50AbsError: number | null;
    p90AbsError: number | null;
  };
  calibrationProxy: number | null;
  byDifficultyTarget: Array<{
    label: string;
    attempts: number;
    accuracy: { n: number; rmse: number | null; bias: number | null };
    durationMs: { n: number; rmse: number | null; bias: number | null };
  }>;
};

type CandidateScored = {
  params: CalibrationCandidateParams;
  calibration: CandidateMetrics;
  objective: {
    accuracyRmse: number;
    accuracyAbsBias: number;
    durationRmse: number;
    durationAbsBias: number;
    calibrationProxy: number;
    tuple: [number, number, number, number, number];
  };
};

type CandidateRanked = CandidateScored & {
  rank: number;
  holdout: CandidateMetrics | null;
};

type CalibrationNormalizedOptions = {
  timeRangeDays: number;
  maxAttempts: number;
  includeExcluded: boolean;
  includeUnknownEligibility: boolean;
  historyWindowAttempts: number | undefined;
  grid: GridSize;
  topKHoldout: number;
  apply: boolean;
  calibrationRatio: number;
};

const GRID_VALUES: Record<
  GridSize,
  {
    diffAdjustMag: number[];
    betaSymmetric: number[];
    durationPriorQuestions: number[];
    durationFullEvidenceQuestions: number[];
  }
> = {
  small: {
    diffAdjustMag: [0.05, 0.07, 0.09],
    betaSymmetric: [0.5, 1, 2, 5],
    durationPriorQuestions: [10, 20, 40],
    durationFullEvidenceQuestions: [80, 100, 160],
  },
  medium: {
    diffAdjustMag: [0.03, 0.05, 0.07, 0.09, 0.11],
    betaSymmetric: [0.5, 1, 2, 5],
    durationPriorQuestions: [8, 12, 20, 32, 48],
    durationFullEvidenceQuestions: [60, 80, 100, 140, 200],
  },
  large: {
    diffAdjustMag: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12],
    betaSymmetric: [0.5, 1, 2, 5],
    durationPriorQuestions: [5, 10, 15, 20, 30, 50],
    durationFullEvidenceQuestions: [40, 60, 80, 100, 160, 240],
  },
};

function normalizeOptions(options: PredictionCalibrationOptions): CalibrationNormalizedOptions {
  const grid =
    options.grid === "small" || options.grid === "medium" || options.grid === "large"
      ? options.grid
      : DEFAULT_GRID_SIZE;
  const timeRangeDays = Math.max(
    1,
    Math.min(365, Math.floor(options.timeRangeDays ?? DEFAULT_TIME_RANGE_DAYS)),
  );
  const maxAttempts = Math.max(
    10,
    Math.min(5000, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
  );
  const topKHoldout = Math.max(
    1,
    Math.min(MAX_TOP_CANDIDATES, Math.floor(options.topKHoldout ?? DEFAULT_TOP_K_HOLDOUT)),
  );
  const calibrationRatio = Math.max(
    0.1,
    Math.min(0.9, options.calibrationRatio ?? DEFAULT_CALIBRATION_RATIO),
  );

  return {
    timeRangeDays,
    maxAttempts,
    includeExcluded: Boolean(options.includeExcluded),
    includeUnknownEligibility: Boolean(options.includeUnknownEligibility),
    historyWindowAttempts: options.historyWindowAttempts,
    grid,
    topKHoldout,
    apply: Boolean(options.apply),
    calibrationRatio,
  };
}

function buildCandidateGrid(grid: GridSize): CalibrationCandidateParams[] {
  const values = GRID_VALUES[grid];
  const candidates: CalibrationCandidateParams[] = [];
  for (const diffAdjustMag of values.diffAdjustMag) {
    for (const beta of values.betaSymmetric) {
      for (const durationPriorQuestions of values.durationPriorQuestions) {
        for (const durationFullEvidenceQuestions of values.durationFullEvidenceQuestions) {
          candidates.push({
            diffAdjustMag,
            betaA: beta,
            betaB: beta,
            durationPriorQuestions,
            durationFullEvidenceQuestions,
          });
        }
      }
    }
  }
  return candidates;
}

function safeScore(value: number | null) {
  if (value == null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return value;
}

function computeCalibrationProxy(
  buckets: Array<{ n: number; avgPredicted: number | null; avgActual: number | null }>,
) {
  let weightedAbsSum = 0;
  let count = 0;
  for (const bucket of buckets) {
    if (bucket.n <= 0) continue;
    if (bucket.avgPredicted == null || bucket.avgActual == null) continue;
    weightedAbsSum += Math.abs(bucket.avgPredicted - bucket.avgActual) * bucket.n;
    count += bucket.n;
  }
  return count > 0 ? weightedAbsSum / count : null;
}

function extractPolicyMetrics(
  result: ReturnType<typeof runPredictionBacktestOnRows>,
  policyId: typeof POLICY_A_ID | typeof POLICY_B_ID,
): CandidateMetrics | null {
  const policy = result.policies.find((entry) => entry.policyId === policyId);
  if (!policy) return null;
  return {
    attemptsEvaluated: policy.attemptsEvaluated,
    accuracy: {
      n: policy.accuracy.n,
      mae: policy.accuracy.mae,
      rmse: policy.accuracy.rmse,
      bias: policy.accuracy.bias,
    },
    durationMs: {
      n: policy.durationMs.n,
      mae: policy.durationMs.mae,
      rmse: policy.durationMs.rmse,
      bias: policy.durationMs.bias,
      p50AbsError: policy.durationMs.p50AbsError ?? null,
      p90AbsError: policy.durationMs.p90AbsError ?? null,
    },
    calibrationProxy: computeCalibrationProxy(policy.accuracy.calibrationBuckets),
    byDifficultyTarget: policy.stratified.byDifficultyTarget.map((row) => ({
      label: row.label,
      attempts: row.attempts,
      accuracy: {
        n: row.accuracy.n,
        rmse: row.accuracy.rmse,
        bias: row.accuracy.bias,
      },
      durationMs: {
        n: row.durationMs.n,
        rmse: row.durationMs.rmse,
        bias: row.durationMs.bias,
      },
    })),
  };
}

function scoreCandidate(metrics: CandidateMetrics): CandidateScored["objective"] {
  const tuple: [number, number, number, number, number] = [
    safeScore(metrics.accuracy.rmse),
    safeScore(metrics.accuracy.bias == null ? null : Math.abs(metrics.accuracy.bias)),
    safeScore(metrics.durationMs.rmse),
    safeScore(metrics.durationMs.bias == null ? null : Math.abs(metrics.durationMs.bias)),
    safeScore(metrics.calibrationProxy),
  ];
  return {
    accuracyRmse: tuple[0],
    accuracyAbsBias: tuple[1],
    durationRmse: tuple[2],
    durationAbsBias: tuple[3],
    calibrationProxy: tuple[4],
    tuple,
  };
}

function compareObjective(
  left: CandidateScored["objective"]["tuple"],
  right: CandidateScored["objective"]["tuple"],
) {
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

function evaluatePolicy(
  rows: BacktestAttemptRow[],
  options: Pick<
    BacktestOptions,
    "includeExcluded" | "includeUnknownEligibility" | "historyWindowAttempts"
  >,
  policyId: typeof POLICY_A_ID | typeof POLICY_B_ID,
  policyV2Params?: CalibrationCandidateParams,
  seedHistoryByUser?: BacktestOptions["seedHistoryByUser"],
) {
  const result = runPredictionBacktestOnRows(rows, {
    policyIds: [policyId],
    includeExcluded: options.includeExcluded,
    includeUnknownEligibility: options.includeUnknownEligibility,
    historyWindowAttempts: options.historyWindowAttempts,
    policyV2Params,
    seedHistoryByUser,
  });
  return extractPolicyMetrics(result, policyId);
}

function evaluatePolicyBWithParams(
  rows: BacktestAttemptRow[],
  options: Pick<
    BacktestOptions,
    "includeExcluded" | "includeUnknownEligibility" | "historyWindowAttempts"
  >,
  params: CalibrationCandidateParams,
  seedHistoryByUser?: BacktestOptions["seedHistoryByUser"],
) {
  const result = runPredictionBacktestOnRows(rows, {
    policyIds: [POLICY_B_ID],
    includeExcluded: options.includeExcluded,
    includeUnknownEligibility: options.includeUnknownEligibility,
    historyWindowAttempts: options.historyWindowAttempts,
    policyV2Params: params,
    seedHistoryByUser,
  });
  const metrics = extractPolicyMetrics(result, POLICY_B_ID);
  if (!metrics) return null;
  const objective = scoreCandidate(metrics);
  return {
    params,
    calibration: metrics,
    objective,
  } satisfies CandidateScored;
}

function pickBestCandidate(candidates: CandidateScored[]) {
  return [...candidates]
    .sort((a, b) => compareObjective(a.objective.tuple, b.objective.tuple))
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      holdout: null,
    }));
}

function relativeWorsePct(best: number | null, baseline: number | null) {
  if (best == null || baseline == null || baseline === 0) return null;
  return ((best - baseline) / baseline) * 100;
}

function serializeParams(params: CalibrationCandidateParams) {
  const normalized = normalizePredictionModelParams(params);
  return {
    diffAdjustMag: normalized.diffAdjustMag,
    betaA: normalized.betaA,
    betaB: normalized.betaB,
    durationPriorQuestions: normalized.durationPriorQuestions,
    durationFullEvidenceQuestions: normalized.durationFullEvidenceQuestions,
  };
}

export async function runPredictionCalibration(
  prisma: PrismaClient,
  options: PredictionCalibrationOptions = {},
) {
  const startedAt = Date.now();
  const normalized = normalizeOptions(options);
  const loaded = await loadPredictionBacktestRows(prisma, {
    timeRangeDays: normalized.timeRangeDays,
    maxAttempts: normalized.maxAttempts,
    includeExcluded: normalized.includeExcluded,
    includeUnknownEligibility: normalized.includeUnknownEligibility,
    historyWindowAttempts: normalized.historyWindowAttempts,
  });

  return runPredictionCalibrationOnRows(loaded.rows, {
    ...normalized,
    loadedTimeRange: loaded.timeRange,
    startedAt,
  });
}

type CalibrationOnRowsOptions = CalibrationNormalizedOptions & {
  loadedTimeRange?: { days: number; since: string; until: string };
  startedAt?: number;
};

export function runPredictionCalibrationOnRows(
  rows: BacktestAttemptRow[],
  options: CalibrationOnRowsOptions,
) {
  const startedAt = options.startedAt ?? Date.now();
  const calibrationSplit = splitBacktestRowsByTime(rows, options.calibrationRatio);
  const baseBacktestOptions = {
    includeExcluded: options.includeExcluded,
    includeUnknownEligibility: options.includeUnknownEligibility,
    historyWindowAttempts: options.historyWindowAttempts,
  } satisfies Pick<
    BacktestOptions,
    "includeExcluded" | "includeUnknownEligibility" | "historyWindowAttempts"
  >;
  const calibrationIncluded = countBacktestIncludedRows(
    calibrationSplit.calibrationRows,
    baseBacktestOptions,
  );
  const holdoutIncluded = countBacktestIncludedRows(
    calibrationSplit.holdoutRows,
    baseBacktestOptions,
  );

  const insufficientData =
    calibrationIncluded < MIN_CALIBRATION_INCLUDED ||
    holdoutIncluded < MIN_HOLDOUT_INCLUDED;

  if (insufficientData) {
    return {
      engineVersion: CALIBRATION_ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      status: "insufficient_data" as const,
      message:
        "Not enough eligible attempts for stable calibration/holdout split. Increase time range or include more data.",
      options: {
        timeRangeDays: options.timeRangeDays,
        maxAttempts: options.maxAttempts,
        includeExcluded: options.includeExcluded,
        includeUnknownEligibility: options.includeUnknownEligibility,
        historyWindowAttempts: options.historyWindowAttempts ?? null,
        grid: options.grid,
        topKHoldout: options.topKHoldout,
        calibrationRatio: options.calibrationRatio,
        apply: options.apply,
      },
      counts: {
        scannedAttempts: rows.length,
        calibrationAttempts: calibrationSplit.calibrationRows.length,
        holdoutAttempts: calibrationSplit.holdoutRows.length,
        calibrationIncluded,
        holdoutIncluded,
      },
      executionStats: {
        runtimeMs: Date.now() - startedAt,
        candidatesEvaluated: 0,
        attemptsUsed: calibrationIncluded + holdoutIncluded,
      },
      apply: {
        requested: options.apply,
        applied: false,
        reason: "insufficient_data",
      },
    };
  }

  const seedHistory = buildBacktestSeedHistory(
    calibrationSplit.calibrationRows,
    baseBacktestOptions,
  );
  const activeParams = normalizePredictionModelParams(getActivePredictionModelParams());
  const defaultParams = serializeParams(activeParams);
  const defaultCalibration = evaluatePolicyBWithParams(
    calibrationSplit.calibrationRows,
    baseBacktestOptions,
    defaultParams,
  );
  const defaultHoldout = evaluatePolicyBWithParams(
    calibrationSplit.holdoutRows,
    baseBacktestOptions,
    defaultParams,
    seedHistory,
  );
  const policyABaselineCalibration = evaluatePolicy(
    calibrationSplit.calibrationRows,
    baseBacktestOptions,
    POLICY_A_ID,
  );
  const policyABaselineHoldout = evaluatePolicy(
    calibrationSplit.holdoutRows,
    baseBacktestOptions,
    POLICY_A_ID,
    undefined,
    seedHistory,
  );

  const candidates = buildCandidateGrid(options.grid)
    .map((candidate) =>
      evaluatePolicyBWithParams(
        calibrationSplit.calibrationRows,
        baseBacktestOptions,
        serializeParams(candidate),
      ),
    )
    .filter((candidate): candidate is CandidateScored => candidate != null)
    .filter((candidate) => Number.isFinite(candidate.objective.accuracyRmse));

  const rankedCalibration = pickBestCandidate(candidates);
  const topRanked = rankedCalibration.slice(0, options.topKHoldout);
  const rankedWithHoldout: CandidateRanked[] = rankedCalibration.map((candidate) => {
    const topItem = topRanked.find((ranked) => ranked.rank === candidate.rank);
    if (!topItem) return candidate;
    const holdout = evaluatePolicyBWithParams(
      calibrationSplit.holdoutRows,
      baseBacktestOptions,
      candidate.params,
      seedHistory,
    );
    return {
      ...candidate,
      holdout: holdout?.calibration ?? null,
    };
  });

  const bestCalibration = rankedWithHoldout[0] ?? null;
  const bestHoldout = bestCalibration?.holdout ?? null;
  const defaultHoldoutRmse = defaultHoldout?.calibration.accuracy.rmse ?? null;
  const bestHoldoutRmse = bestHoldout?.accuracy.rmse ?? null;
  const holdoutDeltaPct = relativeWorsePct(bestHoldoutRmse, defaultHoldoutRmse);
  const unstable =
    holdoutDeltaPct != null &&
    Number.isFinite(holdoutDeltaPct) &&
    holdoutDeltaPct > 5;
  const recommendedParams = unstable || !bestCalibration
    ? defaultParams
    : bestCalibration.params;

  let applyResult: {
    requested: boolean;
    applied: boolean;
    reason: string;
    path?: string;
  } = {
    requested: options.apply,
    applied: false,
    reason: options.apply
      ? "apply_requested_but_not_applied"
      : "apply_not_requested",
  };

  if (options.apply) {
    const written = writeCalibratedPredictionParamsConfig(recommendedParams as PredictionModelParams);
    applyResult = {
      requested: true,
      applied: true,
      reason: unstable
        ? "applied_recommended_default_due_to_holdout_instability"
        : "applied_best_calibrated_params",
      path: written.path,
    };
  }

  return {
    engineVersion: CALIBRATION_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    status: "ok" as const,
    options: {
      timeRangeDays: options.timeRangeDays,
      maxAttempts: options.maxAttempts,
      includeExcluded: options.includeExcluded,
      includeUnknownEligibility: options.includeUnknownEligibility,
      historyWindowAttempts: options.historyWindowAttempts ?? null,
      grid: options.grid,
      topKHoldout: options.topKHoldout,
      calibrationRatio: options.calibrationRatio,
      apply: options.apply,
    },
    timeRange:
      options.loadedTimeRange ??
      ({
        days: options.timeRangeDays,
      } as { days: number }),
    defaultParams: {
      params: defaultParams,
      calibration: defaultCalibration?.calibration ?? null,
      holdout: defaultHoldout?.calibration ?? null,
    },
    bestParams: bestCalibration
      ? {
          params: bestCalibration.params,
          calibration: bestCalibration.calibration,
        }
      : null,
    bestParamsHoldout: bestCalibration
      ? {
          params: bestCalibration.params,
          holdout: bestCalibration.holdout,
        }
      : null,
    recommendedParams: {
      params: recommendedParams,
      reason: unstable
        ? "holdout_regression_gt_5pct_rmse_recommend_default"
        : "best_calibration_candidate",
    },
    stability: {
      unstable,
      holdoutAccuracyRmseDeltaPct: holdoutDeltaPct,
      reason: unstable
        ? "best candidate degraded holdout accuracy RMSE by more than 5%"
        : "holdout within tolerance",
    },
    baselinePolicyA: {
      calibration: policyABaselineCalibration,
      holdout: policyABaselineHoldout,
    },
    rankedTopCandidates: rankedWithHoldout.slice(0, MAX_TOP_CANDIDATES),
    executionStats: {
      runtimeMs: Date.now() - startedAt,
      candidatesEvaluated: candidates.length,
      attemptsScanned: rows.length,
      calibrationAttempts: calibrationSplit.calibrationRows.length,
      holdoutAttempts: calibrationSplit.holdoutRows.length,
      calibrationIncluded,
      holdoutIncluded,
    },
    apply: applyResult,
  };
}

export function runPredictionCalibrationSyntheticSelfCheck() {
  const rows: BacktestAttemptRow[] = [
    {
      attemptId: "c1",
      userId: "u1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 0.8,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [9000, 11000, 10000, 10500, 9800],
      actualAccuracy: 0.8,
      actualTotalDurationMs: 50300,
      loggedPrediction: {
        expectedAccuracy: 0.7,
        expectedTotalDurationMs: 52000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c2",
      userId: "u1",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.4,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [13000, 16000, 14000, 15000, 14500],
      actualAccuracy: 0.4,
      actualTotalDurationMs: 72500,
      loggedPrediction: {
        expectedAccuracy: 0.55,
        expectedTotalDurationMs: 76000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c3",
      userId: "u1",
      createdAt: new Date("2026-01-03T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 1,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [8000, 8200, 7900, 8400, 8100],
      actualAccuracy: 1,
      actualTotalDurationMs: 40600,
      loggedPrediction: {
        expectedAccuracy: 0.8,
        expectedTotalDurationMs: 43000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c4",
      userId: "u1",
      createdAt: new Date("2026-01-04T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.2,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [18000, 19000, 17500, 20000, 18500],
      actualAccuracy: 0.2,
      actualTotalDurationMs: 93000,
      loggedPrediction: {
        expectedAccuracy: 0.35,
        expectedTotalDurationMs: 90000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c5",
      userId: "u1",
      createdAt: new Date("2026-01-05T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 0.8,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [9200, 9400, 9800, 9100, 9600],
      actualAccuracy: 0.8,
      actualTotalDurationMs: 47100,
      loggedPrediction: {
        expectedAccuracy: 0.7,
        expectedTotalDurationMs: 50000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c6",
      userId: "u1",
      createdAt: new Date("2026-01-06T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.6,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [15500, 16500, 15000, 17000, 16000],
      actualAccuracy: 0.6,
      actualTotalDurationMs: 80000,
      loggedPrediction: {
        expectedAccuracy: 0.5,
        expectedTotalDurationMs: 78000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c7",
      userId: "u1",
      createdAt: new Date("2026-01-07T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 0.8,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [9100, 8900, 9200, 9300, 9050],
      actualAccuracy: 0.8,
      actualTotalDurationMs: 45550,
      loggedPrediction: {
        expectedAccuracy: 0.7,
        expectedTotalDurationMs: 48000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c8",
      userId: "u1",
      createdAt: new Date("2026-01-08T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.4,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [17000, 17500, 18000, 16800, 17200],
      actualAccuracy: 0.4,
      actualTotalDurationMs: 86500,
      loggedPrediction: {
        expectedAccuracy: 0.45,
        expectedTotalDurationMs: 85000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c9",
      userId: "u1",
      createdAt: new Date("2026-01-09T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 1,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [7900, 8000, 7850, 8100, 7950],
      actualAccuracy: 1,
      actualTotalDurationMs: 39800,
      loggedPrediction: {
        expectedAccuracy: 0.85,
        expectedTotalDurationMs: 43000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c10",
      userId: "u1",
      createdAt: new Date("2026-01-10T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.2,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [20000, 19500, 21000, 20500, 19800],
      actualAccuracy: 0.2,
      actualTotalDurationMs: 100800,
      loggedPrediction: {
        expectedAccuracy: 0.35,
        expectedTotalDurationMs: 92000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c11",
      userId: "u1",
      createdAt: new Date("2026-01-11T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 0.8,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [9300, 9400, 9100, 9200, 9000],
      actualAccuracy: 0.8,
      actualTotalDurationMs: 46000,
      loggedPrediction: {
        expectedAccuracy: 0.75,
        expectedTotalDurationMs: 47000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
    {
      attemptId: "c12",
      userId: "u1",
      createdAt: new Date("2026-01-12T00:00:00Z"),
      subjectId: "math",
      questionCount: 5,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0.4,
      byTagJson: {
        _meta: { learning: { eligible: true }, prediction: {} },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [17500, 17800, 17000, 18200, 17600],
      actualAccuracy: 0.4,
      actualTotalDurationMs: 88100,
      loggedPrediction: {
        expectedAccuracy: 0.45,
        expectedTotalDurationMs: 86000,
        durationConfidence: 0,
        durationBasis: "baseline_only",
        predictorVersion: null,
      },
    },
  ];

  const first = runPredictionCalibrationOnRows(rows, {
    timeRangeDays: 30,
    maxAttempts: 1000,
    includeExcluded: false,
    includeUnknownEligibility: false,
    historyWindowAttempts: 200,
    grid: "small",
    topKHoldout: 3,
    apply: false,
    calibrationRatio: 0.7,
  });
  const second = runPredictionCalibrationOnRows(rows, {
    timeRangeDays: 30,
    maxAttempts: 1000,
    includeExcluded: false,
    includeUnknownEligibility: false,
    historyWindowAttempts: 200,
    grid: "small",
    topKHoldout: 3,
    apply: false,
    calibrationRatio: 0.7,
  });

  if (first.status !== "ok" || second.status !== "ok") {
    throw new Error("calibration self-check failed: expected status ok");
  }
  if (first.rankedTopCandidates.length === 0) {
    throw new Error("calibration self-check failed: no ranked candidates");
  }
  const firstBest = JSON.stringify(first.rankedTopCandidates[0].params);
  const secondBest = JSON.stringify(second.rankedTopCandidates[0].params);
  if (firstBest !== secondBest) {
    throw new Error(
      `calibration self-check failed: non-deterministic best candidate (${firstBest} != ${secondBest})`,
    );
  }
  const insufficient = runPredictionCalibrationOnRows(rows.slice(0, 5), {
    timeRangeDays: 30,
    maxAttempts: 1000,
    includeExcluded: false,
    includeUnknownEligibility: false,
    historyWindowAttempts: 200,
    grid: "small",
    topKHoldout: 3,
    apply: false,
    calibrationRatio: 0.7,
  });
  if (insufficient.status !== "insufficient_data") {
    throw new Error(
      "calibration self-check failed: expected insufficient_data for tiny dataset",
    );
  }

  return {
    ok: true,
    status: first.status,
    bestCandidate: first.rankedTopCandidates[0].params,
    candidatesEvaluated: first.executionStats.candidatesEvaluated,
    holdoutIncluded: first.executionStats.holdoutIncluded,
    metrics: {
      defaultCalibrationAccuracyRmse: first.defaultParams.calibration?.accuracy.rmse ?? null,
      bestCalibrationAccuracyRmse: first.bestParams?.calibration.accuracy.rmse ?? null,
      defaultHoldoutAccuracyRmse: first.defaultParams.holdout?.accuracy.rmse ?? null,
      bestHoldoutAccuracyRmse: first.bestParamsHoldout?.holdout?.accuracy.rmse ?? null,
      defaultCalibrationDurationRmse: first.defaultParams.calibration?.durationMs.rmse ?? null,
      bestCalibrationDurationRmse: first.bestParams?.calibration.durationMs.rmse ?? null,
      defaultHoldoutDurationRmse: first.defaultParams.holdout?.durationMs.rmse ?? null,
      bestHoldoutDurationRmse: first.bestParamsHoldout?.holdout?.durationMs.rmse ?? null,
      defaultCalibrationAccuracyBias: first.defaultParams.calibration?.accuracy.bias ?? null,
      bestCalibrationAccuracyBias: first.bestParams?.calibration.accuracy.bias ?? null,
      defaultHoldoutAccuracyBias: first.defaultParams.holdout?.accuracy.bias ?? null,
      bestHoldoutAccuracyBias: first.bestParamsHoldout?.holdout?.accuracy.bias ?? null,
      defaultCalibrationDurationBias: first.defaultParams.calibration?.durationMs.bias ?? null,
      bestCalibrationDurationBias: first.bestParams?.calibration.durationMs.bias ?? null,
      defaultHoldoutDurationBias: first.defaultParams.holdout?.durationMs.bias ?? null,
      bestHoldoutDurationBias: first.bestParamsHoldout?.holdout?.durationMs.bias ?? null,
    },
    note: "Calibration run is deterministic on synthetic dataset.",
  };
}
