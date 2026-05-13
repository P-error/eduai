import { createHash } from "node:crypto";

import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  EXAMPLES_LEVEL_VALUES,
  PRESENTATION_FORMAT_VALUES,
  SUPPORT_LEVEL_VALUES,
  TERMINOLOGY_LEVEL_VALUES,
  toMlSixFactorConfig,
  type EduAIAppPolicyFeaturesV1,
  type SixFactorCandidateConfigV1,
} from "@/lib/ml-six-factor-policy-contract";
import type { SixFactorCandidateScorerArtifactV1 } from "@/lib/ml-six-factor-artifact-loader";
import { buildSixFactorLearnerStateSafetyProfile } from "@/lib/ml-six-factor-guardrails";

export type SixFactorCandidateScoreV1 = {
  candidate: SixFactorCandidateConfigV1;
  predictedLearningGain: number | null;
  predictedNextStepSuccess: number | null;
  predictedCombinedScore: number;
  warnings: string[];
};

const SOURCE_KIND = "real_user";

function clamp(value: number, lower = 0, upper = 1) {
  return Math.max(lower, Math.min(upper, value));
}

function safeRate(value: number | null) {
  return value == null ? 0 : clamp(value);
}

function scaledCount(value: number | null, scale: number) {
  if (value == null) return 0;
  return clamp(value / scale);
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function dot(weights: number[], vector: number[]) {
  return weights.reduce((total, weight, index) => total + weight * vector[index], 0);
}

function stableHashBucket(value: string | null, buckets = 16) {
  if (value == null || value.length === 0) return 0;
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) % buckets;
}

function emptyFeatures(featureNames: string[]) {
  return Object.fromEntries(featureNames.map((name) => [name, 0])) as Record<
    string,
    number
  >;
}

function setOneHot(
  output: Record<string, number>,
  prefix: string,
  value: string | null,
  values: readonly string[],
) {
  if (value != null && values.includes(value)) {
    output[`${prefix}__${value}`] = 1;
  }
}

function setCandidateFactor<const T extends readonly string[]>(
  output: Record<string, number>,
  factorName: string,
  value: T[number],
  values: T,
) {
  if (values.length > 1) {
    output[`candidate_${factorName}_ordinal`] =
      values.indexOf(value) / (values.length - 1);
  }
  output[`candidate_${factorName}__${value}`] = 1;
}

export function extractRuntimeScorerFeatures(
  features: EduAIAppPolicyFeaturesV1,
  candidate: SixFactorCandidateConfigV1,
  featureNames: string[],
) {
  const output = emptyFeatures(featureNames);
  const mlCandidate = toMlSixFactorConfig(candidate);
  const minutesSinceLastActivity = features.minutesSinceLastActivity;

  output.prior_attempts_count_scaled = scaledCount(features.priorAttemptsCount, 80);
  output.prior_correct_rate = safeRate(features.priorCorrectRate);
  output.recent_correct_rate = safeRate(features.recentCorrectRate);
  output.recent_attempts_count_scaled = scaledCount(features.recentAttemptsCount, 20);
  output.topic_seen_count_scaled = scaledCount(features.topicSeenCount, 30);
  output.minutes_since_last_activity_missing =
    minutesSinceLastActivity == null ? 1 : 0;
  output.minutes_since_last_activity_scaled =
    minutesSinceLastActivity == null
      ? 0
      : scaledCount(minutesSinceLastActivity, 480);
  output.session_position_scaled = scaledCount(features.sessionPosition, 30);

  output.declared_difficulty_missing =
    features.declaredPreferenceDifficulty == null ? 1 : 0;
  output.declared_depth_missing = features.declaredPreferenceDepth == null ? 1 : 0;
  output.declared_format_missing =
    features.declaredPreferenceFormat == null ? 1 : 0;
  output.declared_candidate_difficulty_match =
    features.declaredPreferenceDifficulty === candidate.difficulty ? 1 : 0;
  output.declared_candidate_depth_match =
    features.declaredPreferenceDepth === candidate.depth ? 1 : 0;
  output.declared_candidate_format_match =
    features.declaredPreferenceFormat === candidate.presentationFormat ? 1 : 0;

  const safetyProfile = buildSixFactorLearnerStateSafetyProfile(features);
  output.unknown_state = safetyProfile.unknownState ? 1 : 0;
  output.low_correct_rate = safetyProfile.lowCorrectRate ? 1 : 0;
  output.high_correct_rate = safetyProfile.highCorrectRate ? 1 : 0;
  output.strong_history = safetyProfile.strongHistory ? 1 : 0;
  output.confident_topic_mastery = safetyProfile.confidentTopicMastery ? 1 : 0;

  output.subject_hash_scaled = stableHashBucket(features.subjectRef) / 15;
  output.topic_hash_scaled = stableHashBucket(features.topicRef) / 15;

  setCandidateFactor(output, "difficulty", mlCandidate.difficulty, DIFFICULTY_VALUES);
  setCandidateFactor(output, "depth", mlCandidate.depth, DEPTH_VALUES);
  setCandidateFactor(
    output,
    "support_level",
    mlCandidate.support_level,
    SUPPORT_LEVEL_VALUES,
  );
  setCandidateFactor(
    output,
    "presentation_format",
    mlCandidate.presentation_format,
    PRESENTATION_FORMAT_VALUES,
  );
  setCandidateFactor(
    output,
    "examples_level",
    mlCandidate.examples_level,
    EXAMPLES_LEVEL_VALUES,
  );
  setCandidateFactor(
    output,
    "terminology_level",
    mlCandidate.terminology_level,
    TERMINOLOGY_LEVEL_VALUES,
  );

  setOneHot(
    output,
    "declared_difficulty",
    features.declaredPreferenceDifficulty,
    DIFFICULTY_VALUES,
  );
  setOneHot(output, "declared_depth", features.declaredPreferenceDepth, DEPTH_VALUES);
  setOneHot(
    output,
    "declared_format",
    features.declaredPreferenceFormat,
    PRESENTATION_FORMAT_VALUES,
  );

  output[`source_kind__${SOURCE_KIND}`] = 1;

  output.prior_correct_rate_x_candidate_difficulty_ordinal =
    output.prior_correct_rate * output.candidate_difficulty_ordinal;
  output.recent_correct_rate_x_candidate_difficulty_ordinal =
    output.recent_correct_rate * output.candidate_difficulty_ordinal;
  output.prior_correct_rate_x_candidate_support_level_ordinal =
    output.prior_correct_rate * output.candidate_support_level_ordinal;
  output.recent_correct_rate_x_candidate_support_level_ordinal =
    output.recent_correct_rate * output.candidate_support_level_ordinal;
  output.topic_seen_count_scaled_x_candidate_examples_level_ordinal =
    output.topic_seen_count_scaled * output.candidate_examples_level_ordinal;
  output.recent_attempts_count_scaled_x_candidate_terminology_level_ordinal =
    output.recent_attempts_count_scaled *
    output.candidate_terminology_level_ordinal;
  output.prior_attempts_count_scaled_x_candidate_depth_ordinal =
    output.prior_attempts_count_scaled * output.candidate_depth_ordinal;
  output.unknown_state_x_candidate_difficulty__hard =
    output.unknown_state * output.candidate_difficulty__hard;
  output.unknown_state_x_candidate_examples_level__none =
    output.unknown_state * output.candidate_examples_level__none;
  output.unknown_state_x_candidate_terminology_level__technical =
    output.unknown_state * output.candidate_terminology_level__technical;
  output.low_correct_rate_x_candidate_difficulty__hard =
    output.low_correct_rate * output.candidate_difficulty__hard;
  output.low_correct_rate_x_candidate_support_level__minimal =
    output.low_correct_rate * output.candidate_support_level__minimal;
  output.low_correct_rate_x_candidate_examples_level__none =
    output.low_correct_rate * output.candidate_examples_level__none;
  output.high_correct_rate_x_candidate_difficulty__hard =
    output.high_correct_rate * output.candidate_difficulty__hard;
  output.high_correct_rate_x_candidate_terminology_level__technical =
    output.high_correct_rate * output.candidate_terminology_level__technical;

  return output;
}

function vectorFromFeatures(featureValues: Record<string, number>, featureNames: string[]) {
  return [1, ...featureNames.map((name) => Number(featureValues[name] ?? 0))];
}

function validateWeights(name: string, weights: number[], width: number) {
  if (weights.length !== width) {
    throw new Error(
      `Artifact scorer weights for ${name} have width ${weights.length}, expected ${width}.`,
    );
  }
}

export function scoreSixFactorCandidate(
  artifact: SixFactorCandidateScorerArtifactV1,
  features: EduAIAppPolicyFeaturesV1,
  candidate: SixFactorCandidateConfigV1,
): SixFactorCandidateScoreV1 {
  const payload = artifact.model.weights_or_serialized_payload;
  const featureNames = payload.feature_names;
  const vector = vectorFromFeatures(
    extractRuntimeScorerFeatures(features, candidate, featureNames),
    featureNames,
  );
  const width = vector.length;
  const weights = payload.weights;

  validateWeights(
    "expected_learning_gain_proxy",
    weights.expected_learning_gain_proxy,
    width,
  );
  validateWeights(
    "expected_next_step_success_logit",
    weights.expected_next_step_success_logit,
    width,
  );
  validateWeights("combined_outcome_score", weights.combined_outcome_score, width);

  return {
    candidate,
    predictedLearningGain: clamp(
      dot(weights.expected_learning_gain_proxy, vector),
    ),
    predictedNextStepSuccess: clamp(
      sigmoid(dot(weights.expected_next_step_success_logit, vector)),
    ),
    predictedCombinedScore: clamp(dot(weights.combined_outcome_score, vector)),
    warnings: [],
  };
}

export function scoreSixFactorCandidates(
  artifact: SixFactorCandidateScorerArtifactV1,
  features: EduAIAppPolicyFeaturesV1,
  candidates: SixFactorCandidateConfigV1[],
) {
  return candidates.map((candidate) =>
    scoreSixFactorCandidate(artifact, features, candidate),
  );
}

export function selectBestSixFactorCandidate(
  scores: SixFactorCandidateScoreV1[],
) {
  if (scores.length === 0) {
    throw new Error("Cannot select a six-factor candidate from an empty score set.");
  }
  return scores.reduce((best, score) =>
    score.predictedCombinedScore > best.predictedCombinedScore ? score : best,
  );
}
