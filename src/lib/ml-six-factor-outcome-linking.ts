export type SixFactorOutcomeV1 = {
  pre_score: number | null;
  post_score: number | null;
  max_score: number | null;
  next_step_success: boolean | null;
  normalized_learning_gain: number | null;
  outcome_available: boolean;
};

export type SixFactorOutcomeLinkV1 = {
  contentEventRef: string | null;
  testEventRef: string | null;
  userRef: string;
  subjectRef: string | null;
  topicRef: string | null;
  sessionRef: string | null;
  decisionCreatedAt: string;
  outcomeObservedAt: string | null;
  outcome: SixFactorOutcomeV1;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeScore(value: unknown) {
  const numeric = readFiniteNumber(value);
  return numeric == null ? null : Math.max(0, numeric);
}

export function computeNormalizedLearningGain(params: {
  preScore: number | null | undefined;
  postScore: number | null | undefined;
  maxScore: number | null | undefined;
}) {
  const preScore = normalizeScore(params.preScore);
  const postScore = normalizeScore(params.postScore);
  const maxScore = normalizeScore(params.maxScore);

  if (preScore == null || postScore == null || maxScore == null) {
    return null;
  }
  if (maxScore <= preScore) {
    return null;
  }

  return clamp01((postScore - preScore) / (maxScore - preScore));
}

export function buildSixFactorOutcome(params: {
  preScore?: number | null;
  postScore?: number | null;
  maxScore?: number | null;
  nextStepSuccess?: boolean | null;
  outcomeAvailable?: boolean;
}): SixFactorOutcomeV1 {
  const maxScore = normalizeScore(params.maxScore);
  const preScore =
    maxScore == null
      ? normalizeScore(params.preScore)
      : params.preScore == null
        ? null
        : Math.min(maxScore, normalizeScore(params.preScore) ?? 0);
  const postScore =
    maxScore == null
      ? normalizeScore(params.postScore)
      : params.postScore == null
        ? null
        : Math.min(maxScore, normalizeScore(params.postScore) ?? 0);
  const outcomeAvailable =
    params.outcomeAvailable ??
    (postScore != null || params.nextStepSuccess != null);

  return {
    pre_score: preScore,
    post_score: postScore,
    max_score: maxScore,
    next_step_success:
      typeof params.nextStepSuccess === "boolean"
        ? params.nextStepSuccess
        : postScore == null
          ? null
          : postScore >= 0.7,
    normalized_learning_gain: computeNormalizedLearningGain({
      preScore,
      postScore,
      maxScore,
    }),
    outcome_available: outcomeAvailable,
  };
}

export function buildMissingSixFactorOutcome(): SixFactorOutcomeV1 {
  return {
    pre_score: null,
    post_score: null,
    max_score: null,
    next_step_success: null,
    normalized_learning_gain: null,
    outcome_available: false,
  };
}

export function buildSixFactorOutcomeLink(params: {
  contentEventRef?: string | null;
  testEventRef?: string | null;
  userRef: string;
  subjectRef?: string | null;
  topicRef?: string | null;
  sessionRef?: string | null;
  decisionCreatedAt: string;
  outcomeObservedAt?: string | null;
  outcome?: SixFactorOutcomeV1 | null;
}) {
  return {
    contentEventRef: params.contentEventRef ?? null,
    testEventRef: params.testEventRef ?? null,
    userRef: params.userRef,
    subjectRef: params.subjectRef ?? null,
    topicRef: params.topicRef ?? null,
    sessionRef: params.sessionRef ?? null,
    decisionCreatedAt: params.decisionCreatedAt,
    outcomeObservedAt: params.outcomeObservedAt ?? null,
    outcome: params.outcome ?? buildMissingSixFactorOutcome(),
  } satisfies SixFactorOutcomeLinkV1;
}
