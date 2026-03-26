import {
  ALL_AXES,
  DIFF_COOLDOWN_ATTEMPTS,
  DIFFICULTY_ORDER,
  MIN_ATTEMPTS_PER_DIFF,
  MIN_AXES_READY,
  MIN_TESTS_FOR_READY,
  MIN_TOTAL_PER_TAG,
  PED_AXES,
  TAGS_BY_AXIS,
  TARGET_SCORE_BAND,
  UX_AXES,
} from "./tags";
import {
  clampDifficulty,
  clampQuestionCount,
  expectedTotalDurationBaselineMs,
} from "@/lib/prediction-baselines";

type TagStat = {
  axisKey: string;
  tagKey: string;
  correctCount: number;
  totalCount: number;
};

export type AttemptTelemetry = {
  totalDurationMs?: number | null;
  answerChangeCount?: number | null;
  questionCount: number;
  difficultyTarget?: string | null;
  responseFormat?: string | null;
};

export type UxRewardResult = {
  eligible: boolean;
  reward: number | null;
  timeScore: number | null;
  changePenalty: number | null;
  reason: "OK" | "MISSING_DURATION";
  expectedTimeMs: number | null;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function computeUxReward(telemetry: AttemptTelemetry): UxRewardResult {
  const totalDurationMs = telemetry.totalDurationMs ?? null;
  if (totalDurationMs == null) {
    return {
      eligible: false,
      reward: null,
      timeScore: null,
      changePenalty: null,
      reason: "MISSING_DURATION",
      expectedTimeMs: null,
    };
  }

  const questionCount = clampQuestionCount(telemetry.questionCount);
  const answerChangeCount = Math.max(telemetry.answerChangeCount ?? 0, 0);
  const baseline = expectedTotalDurationBaselineMs({
    difficultyTarget: telemetry.difficultyTarget,
    responseFormat: telemetry.responseFormat,
    questionCount,
  });

  const timeScore = clamp01(baseline / Math.max(totalDurationMs, 1));
  const changePenalty = clamp01(answerChangeCount / (questionCount * 2));
  const reward = clamp01(0.85 * timeScore + 0.15 * (1 - changePenalty));

  return {
    eligible: true,
    reward,
    timeScore,
    changePenalty,
    reason: "OK",
    expectedTimeMs: baseline,
  };
}

type DifficultyBandInput = {
  currentDifficulty: string;
  scoresForCurrentDifficulty: number[];
  attemptsSinceLastDifficultyChange: number;
};

export type DifficultyDecision = {
  difficulty: string;
  changed: boolean;
  reason:
    | "NO_DATA"
    | "LOW_N"
    | "COOLDOWN"
    | "WITHIN_BAND"
    | "INCREASE"
    | "DECREASE";
  sampleSize: number;
  smoothedAccuracy: number | null;
};

export function smoothedAccuracy(scores: number[]) {
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, value) => acc + value, 0);
  // Beta(1,1) prior keeps early estimates conservative.
  return (sum + 1) / (scores.length + 2);
}

export function decideDifficultyTarget({
  currentDifficulty,
  scoresForCurrentDifficulty,
  attemptsSinceLastDifficultyChange,
}: DifficultyBandInput): DifficultyDecision {
  const difficulty = clampDifficulty(currentDifficulty);
  const sampleSize = scoresForCurrentDifficulty.length;

  if (sampleSize === 0) {
    return {
      difficulty,
      changed: false,
      reason: "NO_DATA",
      sampleSize,
      smoothedAccuracy: null,
    };
  }

  if (sampleSize < MIN_ATTEMPTS_PER_DIFF) {
    return {
      difficulty,
      changed: false,
      reason: "LOW_N",
      sampleSize,
      smoothedAccuracy: smoothedAccuracy(scoresForCurrentDifficulty),
    };
  }

  if (attemptsSinceLastDifficultyChange < DIFF_COOLDOWN_ATTEMPTS) {
    return {
      difficulty,
      changed: false,
      reason: "COOLDOWN",
      sampleSize,
      smoothedAccuracy: smoothedAccuracy(scoresForCurrentDifficulty),
    };
  }

  const smoothed = smoothedAccuracy(scoresForCurrentDifficulty);
  if (smoothed == null) {
    return {
      difficulty,
      changed: false,
      reason: "NO_DATA",
      sampleSize,
      smoothedAccuracy: null,
    };
  }

  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  if (smoothed > TARGET_SCORE_BAND.high) {
    return {
      difficulty: DIFFICULTY_ORDER[Math.min(index + 1, DIFFICULTY_ORDER.length - 1)],
      changed: DIFFICULTY_ORDER[Math.min(index + 1, DIFFICULTY_ORDER.length - 1)] !== difficulty,
      reason: "INCREASE",
      sampleSize,
      smoothedAccuracy: smoothed,
    };
  }

  if (smoothed < TARGET_SCORE_BAND.low) {
    return {
      difficulty: DIFFICULTY_ORDER[Math.max(index - 1, 0)],
      changed: DIFFICULTY_ORDER[Math.max(index - 1, 0)] !== difficulty,
      reason: "DECREASE",
      sampleSize,
      smoothedAccuracy: smoothed,
    };
  }

  return {
    difficulty,
    changed: false,
    reason: "WITHIN_BAND",
    sampleSize,
    smoothedAccuracy: smoothed,
  };
}

function buildAccuracyByAxis(stats: TagStat[]) {
  const byAxis = new Map<
    string,
    { tagKey: string; accuracy: number; total: number }[]
  >();

  stats.forEach((stat) => {
    const accuracy =
      stat.totalCount > 0 ? stat.correctCount / stat.totalCount : 0;
    const entries = byAxis.get(stat.axisKey) ?? [];
    entries.push({
      tagKey: stat.tagKey,
      accuracy,
      total: stat.totalCount,
    });
    byAxis.set(stat.axisKey, entries);
  });

  return byAxis;
}

function pickBestTag(
  axisKey: string,
  byAxis: Map<string, { tagKey: string; accuracy: number; total: number }[]>,
) {
  const entries = byAxis.get(axisKey) ?? [];
  const eligible = entries.filter((entry) => entry.total >= MIN_TOTAL_PER_TAG);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => b.accuracy - a.accuracy);
  return sorted[0].tagKey;
}

export function computeLayeredPreferences(
  stats: TagStat[],
  currentEffective: Record<string, string>,
  latestScore: number,
) {
  const byAxis = buildAccuracyByAxis(stats);
  const effective: Record<string, string> = { ...currentEffective };
  let axesReady = 0;

  for (const axis of ALL_AXES) {
    const best = pickBestTag(axis, byAxis);
    if (!best) continue;
    effective[axis] = best;
    axesReady += 1;
  }

  if (!effective.difficulty_target) {
    effective.difficulty_target = TAGS_BY_AXIS.difficulty_target[1].key;
  }

  // Keep difficulty deterministic even when submit logic decides cadence.
  // This function is also used by read APIs that don't have attempt history context.
  if (Number.isFinite(latestScore)) {
    const keep = clampDifficulty(effective.difficulty_target);
    effective.difficulty_target = keep;
  }

  return {
    effective,
    axesReady,
    uxAxesReady: UX_AXES.filter((axis) => Boolean(effective[axis])).length,
    pedAxesReady: PED_AXES.filter((axis) => Boolean(effective[axis])).length,
  };
}

export function isPersonalizationReady(axesReady: number, testsTaken: number) {
  return axesReady >= MIN_AXES_READY && testsTaken >= MIN_TESTS_FOR_READY;
}

// Backward-compatible wrapper for old call sites.
export function uxEngagementReward(telemetry: AttemptTelemetry) {
  const result = computeUxReward(telemetry);
  return result.reward ?? 0;
}
