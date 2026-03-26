import { expectedTotalDurationBaselineMs } from "./prediction-baselines";
import { getActivePredictionModelParams } from "./prediction-params";

export const DURATION_HISTORY_WINDOW_ATTEMPTS = 50;
const DEFAULT_DURATION_FULL_EVIDENCE_QUESTIONS = 100;
const DEFAULT_DURATION_PRIOR_QUESTIONS = 20;

export const DURATION_PREDICTOR_VERSION = "v3_duration_unified_2026_02";

export type DurationPredictorModelParams = {
  durationPriorQuestions: number;
  durationFullEvidenceQuestions: number;
};

export type DurationHistoricalAttempt = {
  createdAt?: Date;
  perQuestionFirstAnswerMsJson?: unknown;
};

export type UnifiedDurationPrediction = {
  value: number;
  confidence: number;
  basis: string;
  components?: {
    baseline: number;
    telemetryAdjustment?: number;
  };
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeDurationModelParams(
  modelParams?: Partial<DurationPredictorModelParams> | null,
): DurationPredictorModelParams {
  const active = getActivePredictionModelParams();
  const durationPriorQuestions = Math.max(
    1,
    Math.floor(
      modelParams?.durationPriorQuestions ??
        active.durationPriorQuestions ??
        DEFAULT_DURATION_PRIOR_QUESTIONS,
    ),
  );
  const durationFullEvidenceQuestions = Math.max(
    1,
    Math.floor(
      modelParams?.durationFullEvidenceQuestions ??
        active.durationFullEvidenceQuestions ??
        DEFAULT_DURATION_FULL_EVIDENCE_QUESTIONS,
    ),
  );

  return {
    durationPriorQuestions,
    durationFullEvidenceQuestions,
  };
}

function selectRecentAttempts(
  attempts: DurationHistoricalAttempt[],
): DurationHistoricalAttempt[] {
  if (attempts.length <= DURATION_HISTORY_WINDOW_ATTEMPTS) return attempts;

  const sortable = attempts.every((attempt) => attempt.createdAt instanceof Date);
  if (!sortable) {
    return attempts.slice(0, DURATION_HISTORY_WINDOW_ATTEMPTS);
  }

  return [...attempts]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, DURATION_HISTORY_WINDOW_ATTEMPTS);
}

function collectPerQuestionDurations(
  attempts: DurationHistoricalAttempt[],
): number[] {
  return attempts.flatMap((attempt) =>
    Array.isArray(attempt.perQuestionFirstAnswerMsJson)
      ? attempt.perQuestionFirstAnswerMsJson.filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0,
        )
      : [],
  );
}

export function predictExpectedTotalDurationMsUnified(params: {
  difficultyTarget: string | null | undefined;
  responseFormat: string | null | undefined;
  questionCount: number | null | undefined;
  historicalAttempts?: DurationHistoricalAttempt[] | null;
  modelParams?: Partial<DurationPredictorModelParams> | null;
}): UnifiedDurationPrediction {
  const modelParams = normalizeDurationModelParams(params.modelParams);
  const baseline = expectedTotalDurationBaselineMs({
    difficultyTarget: params.difficultyTarget,
    responseFormat: params.responseFormat,
    questionCount: params.questionCount,
  });
  const questionCount = Math.max(1, Math.floor(params.questionCount ?? 1));
  const baselinePerQuestion = baseline / questionCount;

  const recentAttempts = selectRecentAttempts(params.historicalAttempts ?? []);
  const perQuestionDurations = collectPerQuestionDurations(recentAttempts);
  const totalQuestions = perQuestionDurations.length;

  if (totalQuestions === 0) {
    return {
      value: baseline,
      confidence: 0,
      basis: `${DURATION_PREDICTOR_VERSION}|baseline_only`,
      components: { baseline },
    };
  }

  const sampleMeanPerQuestion =
    perQuestionDurations.reduce((sum, value) => sum + value, 0) / totalQuestions;
  const posteriorPerQuestion =
    (sampleMeanPerQuestion * totalQuestions +
      baselinePerQuestion * modelParams.durationPriorQuestions) /
    (totalQuestions + modelParams.durationPriorQuestions);
  const telemetryEstimate = posteriorPerQuestion * questionCount;
  const evidenceWeight = clamp01(
    totalQuestions / modelParams.durationFullEvidenceQuestions,
  );
  const blended =
    baseline * (1 - evidenceWeight) + telemetryEstimate * evidenceWeight;
  const value = Math.round(blended);

  return {
    value,
    confidence: evidenceWeight,
    basis: `${DURATION_PREDICTOR_VERSION}|baseline_telemetry_blend(totalQuestions=${totalQuestions})`,
    components: {
      baseline,
      telemetryAdjustment: value - baseline,
    },
  };
}

export function assertUnifiedDurationPrediction(
  prediction: UnifiedDurationPrediction,
  context: string,
) {
  if (!prediction.basis.startsWith(DURATION_PREDICTOR_VERSION)) {
    throw new Error(
      `duration predictor mismatch in ${context}: expected ${DURATION_PREDICTOR_VERSION} basis prefix`,
    );
  }
}
