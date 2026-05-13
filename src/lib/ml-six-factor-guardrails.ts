import {
  STATIC_SIX_FACTOR_BASELINE,
  type EduAIAppPolicyFeaturesV1,
  type SixFactorCandidateConfigV1,
} from "@/lib/ml-six-factor-policy-contract";

export type SixFactorLearnerStateSafetyProfile = {
  unknownState: boolean;
  lowCorrectRate: boolean;
  highCorrectRate: boolean;
  strongHistory: boolean;
  confidentTopicMastery: boolean;
  weakState: boolean;
};

export type SixFactorCandidateFilterResult = {
  candidates: SixFactorCandidateConfigV1[];
  filteredCount: number;
  unsafeReasons: Record<string, string[]>;
  fallbackUsed: boolean;
};

const LOW_CORRECT_RATE_THRESHOLD = 0.45;
const HIGH_CORRECT_RATE_THRESHOLD = 0.75;
const CONFIDENT_MASTERY_RATE_THRESHOLD = 0.8;
const STRONG_HISTORY_MIN_PRIOR_ATTEMPTS = 8;
const STRONG_HISTORY_MIN_RECENT_ATTEMPTS = 3;
const STRONG_HISTORY_MIN_TOPIC_SEEN = 2;
const CONFIDENT_MASTERY_MIN_TOPIC_SEEN = 3;

function clamp01(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function nonNegative(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function candidateKey(candidate: SixFactorCandidateConfigV1) {
  return [
    candidate.difficulty,
    candidate.depth,
    candidate.supportLevel,
    candidate.presentationFormat,
    candidate.examplesLevel,
    candidate.terminologyLevel,
  ].join("|");
}

export function buildSixFactorLearnerStateSafetyProfile(
  features: EduAIAppPolicyFeaturesV1,
): SixFactorLearnerStateSafetyProfile {
  const priorAttempts = nonNegative(features.priorAttemptsCount);
  const recentAttempts = nonNegative(features.recentAttemptsCount);
  const topicSeen = nonNegative(features.topicSeenCount);
  const priorRate = clamp01(features.priorCorrectRate);
  const recentRate = clamp01(features.recentCorrectRate);
  const unknownState =
    priorAttempts === 0 && recentAttempts === 0 && topicSeen === 0;
  const lowCorrectRate =
    !unknownState &&
    ((priorAttempts > 0 && priorRate < LOW_CORRECT_RATE_THRESHOLD) ||
      (recentAttempts > 0 && recentRate < LOW_CORRECT_RATE_THRESHOLD));
  const strongHistory =
    priorAttempts >= STRONG_HISTORY_MIN_PRIOR_ATTEMPTS &&
    recentAttempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS &&
    topicSeen >= STRONG_HISTORY_MIN_TOPIC_SEEN &&
    priorRate >= HIGH_CORRECT_RATE_THRESHOLD &&
    recentRate >= HIGH_CORRECT_RATE_THRESHOLD;
  const confidentTopicMastery =
    topicSeen >= CONFIDENT_MASTERY_MIN_TOPIC_SEEN &&
    recentAttempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS &&
    priorRate >= CONFIDENT_MASTERY_RATE_THRESHOLD &&
    recentRate >= CONFIDENT_MASTERY_RATE_THRESHOLD;
  const highCorrectRate =
    !unknownState &&
    priorAttempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS &&
    recentAttempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS &&
    priorRate >= HIGH_CORRECT_RATE_THRESHOLD &&
    recentRate >= HIGH_CORRECT_RATE_THRESHOLD;

  return {
    unknownState,
    lowCorrectRate,
    highCorrectRate,
    strongHistory,
    confidentTopicMastery,
    weakState: unknownState || lowCorrectRate,
  };
}

export function unsafeSixFactorCandidateReasons(
  features: EduAIAppPolicyFeaturesV1,
  candidate: SixFactorCandidateConfigV1,
) {
  const profile = buildSixFactorLearnerStateSafetyProfile(features);
  const reasons: string[] = [];

  if (
    profile.weakState &&
    candidate.difficulty === "hard" &&
    candidate.depth === "brief" &&
    candidate.supportLevel === "minimal"
  ) {
    reasons.push("weak_state_blocks_hard_brief_minimal");
  }
  if (profile.weakState && candidate.supportLevel === "minimal") {
    reasons.push("weak_state_requires_guided_support");
  }
  if (profile.weakState && candidate.examplesLevel === "none") {
    reasons.push("weak_state_requires_at_least_single_example");
  }
  if (candidate.examplesLevel === "none" && !profile.strongHistory) {
    reasons.push("examples_none_requires_strong_history");
  }
  if (
    candidate.terminologyLevel === "technical" &&
    !profile.confidentTopicMastery
  ) {
    reasons.push("technical_terminology_requires_confident_topic_mastery");
  }

  return reasons;
}

export function isSafeSixFactorCandidateForLearnerState(
  features: EduAIAppPolicyFeaturesV1,
  candidate: SixFactorCandidateConfigV1,
) {
  return unsafeSixFactorCandidateReasons(features, candidate).length === 0;
}

export function createSafeSixFactorFallbackCandidate(): SixFactorCandidateConfigV1 {
  return { ...STATIC_SIX_FACTOR_BASELINE };
}

export function filterUnsafeSixFactorCandidates(
  features: EduAIAppPolicyFeaturesV1,
  candidates: SixFactorCandidateConfigV1[],
): SixFactorCandidateFilterResult {
  const safeCandidates: SixFactorCandidateConfigV1[] = [];
  const unsafeReasons: Record<string, string[]> = {};

  for (const candidate of candidates) {
    const reasons = unsafeSixFactorCandidateReasons(features, candidate);
    if (reasons.length > 0) {
      unsafeReasons[candidateKey(candidate)] = reasons;
      continue;
    }
    safeCandidates.push(candidate);
  }

  if (safeCandidates.length === 0) {
    return {
      candidates: [createSafeSixFactorFallbackCandidate()],
      filteredCount: Object.keys(unsafeReasons).length,
      unsafeReasons,
      fallbackUsed: true,
    };
  }

  return {
    candidates: safeCandidates,
    filteredCount: Object.keys(unsafeReasons).length,
    unsafeReasons,
    fallbackUsed: false,
  };
}
