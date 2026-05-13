import {
  type EduAIAppPolicyFeaturesV1,
  type EduAISixFactorMlConfigV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  isMlSixFactorConfig,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  buildMissingSixFactorOutcome,
  type SixFactorOutcomeLinkV1,
  type SixFactorOutcomeV1,
} from "@/lib/ml-six-factor-outcome-linking";

export const TRAINING_OBSERVATION_V1_SCHEMA_VERSION =
  "training_observation.v1" as const;
export const REAL_USER_EXPORT_SOURCE_NAME = "eduai_app" as const;
export const REAL_USER_EXPORT_SOURCE_VERSION = "app_export_v1" as const;
export const REAL_USER_EXPORT_ADAPTER_VERSION =
  "real_user_export_adapter_v1_2026_05" as const;

export type TrainingObservationV1 = {
  schema_version: typeof TRAINING_OBSERVATION_V1_SCHEMA_VERSION;
  ids: {
    observation_id: string;
    user_ref: string;
    subject_ref: string;
    topic_ref: string;
    session_ref: string | null;
    content_event_ref: string | null;
    test_event_ref: string | null;
  };
  timestamps: {
    decision_created_at: string;
    outcome_observed_at: string | null;
  };
  source: {
    source_kind: "real_user";
    source_name: typeof REAL_USER_EXPORT_SOURCE_NAME;
    source_version: typeof REAL_USER_EXPORT_SOURCE_VERSION;
    adapter_version: typeof REAL_USER_EXPORT_ADAPTER_VERSION;
  };
  pre_decision_features: {
    prior_attempts_count: number;
    prior_correct_rate: number;
    recent_correct_rate: number;
    recent_attempts_count: number;
    topic_seen_count: number;
    minutes_since_last_activity: number | null;
    session_position: number;
    declared_preference_difficulty:
      | EduAIAppPolicyFeaturesV1["declaredPreferenceDifficulty"];
    declared_preference_depth: EduAIAppPolicyFeaturesV1["declaredPreferenceDepth"];
    declared_preference_format:
      | EduAIAppPolicyFeaturesV1["declaredPreferenceFormat"];
  };
  candidate_config: EduAISixFactorMlConfigV1;
  delivered_config: EduAISixFactorMlConfigV1;
  outcome: SixFactorOutcomeV1;
  leakage_guard: {
    features_cutoff_at: string;
    uses_only_pre_decision_data: true;
    notes: string | null;
  };
  policy_context: {
    policy_id: string | null;
    model_version: string | null;
    backend_kind: string | null;
    fallback_used: boolean | null;
  };
};

function readNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function clampRate(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function nonNegativeNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

function buildObservationId(params: {
  userRef: string;
  contentEventRef: string | null;
  testEventRef: string | null;
  decisionCreatedAt: string;
}) {
  const raw = [
    "real_user",
    params.userRef,
    params.contentEventRef ?? "no_content",
    params.testEventRef ?? "no_outcome",
    params.decisionCreatedAt,
  ].join("|");

  return raw.replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 240);
}

function buildPreDecisionFeatures(
  features: EduAIAppPolicyFeaturesV1,
): TrainingObservationV1["pre_decision_features"] {
  return {
    prior_attempts_count: nonNegativeInteger(features.priorAttemptsCount),
    prior_correct_rate: clampRate(
      features.priorCorrectRate,
      clampRate(features.recentCorrectRate),
    ),
    recent_correct_rate: clampRate(
      features.recentCorrectRate,
      clampRate(features.priorCorrectRate),
    ),
    recent_attempts_count: nonNegativeInteger(features.recentAttemptsCount),
    topic_seen_count: nonNegativeInteger(features.topicSeenCount),
    minutes_since_last_activity: nonNegativeNumberOrNull(
      features.minutesSinceLastActivity,
    ),
    session_position: nonNegativeInteger(features.sessionPosition),
    declared_preference_difficulty: features.declaredPreferenceDifficulty,
    declared_preference_depth: features.declaredPreferenceDepth,
    declared_preference_format: features.declaredPreferenceFormat,
  };
}

export function buildTrainingObservationV1FromAppRecord(params: {
  deliveredMetadata: SixFactorDeliveredConfigMetadataV1;
  outcomeLink?: SixFactorOutcomeLinkV1 | null;
  observationId?: string | null;
  userRef?: string | null;
  subjectRef?: string | null;
  topicRef?: string | null;
  sessionRef?: string | null;
  contentEventRef?: string | null;
  testEventRef?: string | null;
}) {
  const metadata = params.deliveredMetadata;
  const features = metadata.featuresSnapshot;
  const outcomeLink = params.outcomeLink ?? null;
  const userRef = readNonEmptyString(
    params.userRef ?? outcomeLink?.userRef ?? features.userRef,
    "unknown_user",
  );
  const subjectRef = readNonEmptyString(
    params.subjectRef ?? outcomeLink?.subjectRef ?? features.subjectRef,
    "unknown_subject",
  );
  const topicRef = readNonEmptyString(
    params.topicRef ?? outcomeLink?.topicRef ?? features.topicRef,
    "unknown_topic",
  );
  const contentEventRef = readNullableString(
    params.contentEventRef ??
      outcomeLink?.contentEventRef ??
      features.contentEventRef,
  );
  const testEventRef = readNullableString(
    params.testEventRef ?? outcomeLink?.testEventRef,
  );
  const sessionRef = readNullableString(
    params.sessionRef ?? outcomeLink?.sessionRef ?? features.sessionRef,
  );

  return {
    schema_version: TRAINING_OBSERVATION_V1_SCHEMA_VERSION,
    ids: {
      observation_id:
        readNullableString(params.observationId) ??
        buildObservationId({
          userRef,
          contentEventRef,
          testEventRef,
          decisionCreatedAt: metadata.decisionCreatedAt,
        }),
      user_ref: userRef,
      subject_ref: subjectRef,
      topic_ref: topicRef,
      session_ref: sessionRef,
      content_event_ref: contentEventRef,
      test_event_ref: testEventRef,
    },
    timestamps: {
      decision_created_at: metadata.decisionCreatedAt,
      outcome_observed_at: outcomeLink?.outcomeObservedAt ?? null,
    },
    source: {
      source_kind: "real_user",
      source_name: REAL_USER_EXPORT_SOURCE_NAME,
      source_version: REAL_USER_EXPORT_SOURCE_VERSION,
      adapter_version: REAL_USER_EXPORT_ADAPTER_VERSION,
    },
    pre_decision_features: buildPreDecisionFeatures(features),
    candidate_config: metadata.candidateConfig,
    delivered_config: metadata.deliveredConfig,
    outcome: outcomeLink?.outcome ?? buildMissingSixFactorOutcome(),
    leakage_guard: {
      features_cutoff_at: metadata.featuresCutoffAt,
      uses_only_pre_decision_data: true,
      notes:
        metadata.leakageGuard.notes ??
        "Outcome values are stored only in the outcome block and are never copied into pre_decision_features.",
    },
    policy_context: {
      policy_id: metadata.policyId,
      model_version: metadata.modelVersion,
      backend_kind: metadata.backendKind,
      fallback_used: metadata.fallbackUsed,
    },
  } satisfies TrainingObservationV1;
}

export function isTrainingObservationV1Shape(
  value: unknown,
): value is TrainingObservationV1 {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const root = value as TrainingObservationV1;
  const pre = root.pre_decision_features as Record<string, unknown> | undefined;
  const forbiddenOutcomeFeatures = [
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "outcome_available",
    "outcome",
  ];

  return (
    root.schema_version === TRAINING_OBSERVATION_V1_SCHEMA_VERSION &&
    root.source?.source_kind === "real_user" &&
    isMlSixFactorConfig(root.candidate_config) &&
    isMlSixFactorConfig(root.delivered_config) &&
    root.leakage_guard?.uses_only_pre_decision_data === true &&
    pre != null &&
    forbiddenOutcomeFeatures.every((field) => !(field in pre))
  );
}
