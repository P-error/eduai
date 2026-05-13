import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";

export type AnalyticsNextStepKind =
  | "thin_data"
  | "weak_topic"
  | "practice_instability"
  | "continue_learning";

export type AnalyticsNextStepDecision = {
  kind: AnalyticsNextStepKind;
  learnHref: string;
  practiceHref: string;
  topicLabel: string | null;
};

type PartialDashboardSummary = {
  attemptsRecorded?: unknown;
  attemptsLearningEligible?: unknown;
  recentAccuracy?: {
    value?: unknown;
  } | null;
};

type PartialDashboardAttempt = {
  actualAccuracy?: unknown;
  score?: unknown;
  learningEligible?: unknown;
};

type AnalyticsNextStepInput = {
  subjectId?: string | null;
  topicLabel?: string | null;
  summary?: PartialDashboardSummary | null;
  attempts?: PartialDashboardAttempt[] | null;
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function averageAbsoluteDelta(values: number[]) {
  if (values.length < 2) return null;
  const deltas = values.slice(1).map((value, index) => {
    return Math.abs(values[index] - value);
  });
  return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
}

function buildLearnHref(subjectId: string | null) {
  return subjectId
    ? `/learn?subjectId=${encodeURIComponent(subjectId)}`
    : DEFAULT_LEARNER_ENTRY_HREF;
}

function buildPracticeHref(subjectId: string | null, topicLabel: string | null) {
  if (!subjectId || !topicLabel) {
    return "/practice";
  }

  const searchParams = new URLSearchParams({
    subjectId,
    topic: topicLabel,
  });
  return `/practice?${searchParams.toString()}`;
}

export function buildAnalyticsNextStepDecision(
  input: AnalyticsNextStepInput,
): AnalyticsNextStepDecision {
  const subjectId = normalizeText(input.subjectId);
  const topicLabel = normalizeText(input.topicLabel);
  const attempts = Array.isArray(input.attempts) ? input.attempts : [];
  const recordedAttempts =
    finiteNumber(input.summary?.attemptsRecorded) ?? attempts.length;
  const learningEligibleAttempts =
    finiteNumber(input.summary?.attemptsLearningEligible) ??
    attempts.filter((attempt) => attempt?.learningEligible === true).length;
  const recentAccuracyValue = finiteNumber(input.summary?.recentAccuracy?.value);
  const recentScoreValues = attempts
    .slice(0, 5)
    .map((attempt) => {
      return finiteNumber(attempt?.actualAccuracy) ?? finiteNumber(attempt?.score);
    })
    .filter((value): value is number => value != null);
  const stabilityDelta = averageAbsoluteDelta(recentScoreValues);
  const hasThinData = recordedAttempts <= 0 || learningEligibleAttempts < 3;
  const hasSelectedTopic = subjectId != null && topicLabel != null;
  const kind: AnalyticsNextStepKind = hasThinData
    ? "thin_data"
    : hasSelectedTopic && recentAccuracyValue != null && recentAccuracyValue < 0.65
      ? "weak_topic"
      : hasSelectedTopic && stabilityDelta != null && stabilityDelta >= 0.25
        ? "practice_instability"
        : "continue_learning";

  return {
    kind,
    learnHref: buildLearnHref(subjectId),
    practiceHref: buildPracticeHref(subjectId, topicLabel),
    topicLabel,
  };
}
