import type { DifficultyTarget, ResponseFormat } from "@/lib/prediction-baselines";

export const PREDICTION_RUNTIME_CONFIG_VERSION =
  "prediction_runtime_config_v1_2026_03" as const;
export const PREDICTION_RUNTIME_POLICY_ID =
  "prediction_runtime_v1_2026_03" as const;
export const PREDICTION_RUNTIME_POLICY_VERSION =
  "prediction_runtime_policy_v1_2026_03" as const;
export const PREDICTION_FEATURE_PAYLOAD_VERSION =
  "prediction_feature_payload_v1_2026_03" as const;

export const HEURISTIC_BASELINE_BACKEND_ID =
  "heuristic_baseline_backend_v1_2026_03" as const;
export const STUB_MODEL_BACKEND_ID = "stub_model_backend_v1_2026_03" as const;
export const ARTIFACT_ML_BACKEND_ID = "artifact_ml_backend_v1_2026_03" as const;

export const PREDICTION_MODEL_ARTIFACT_KIND =
  "eduai_prediction_model_artifact" as const;
export const PREDICTION_MODEL_ARTIFACT_SCHEMA_VERSION =
  "prediction_model_artifact_v1_2026_03" as const;

export const ACCURACY_ML_FEATURE_SCHEMA_VERSION =
  "accuracy_ml_features_v1" as const;

export type PredictionTargetId =
  | "expected_accuracy"
  | "expected_total_duration_ms";

export type PredictionBackendKind =
  | "heuristic_baseline"
  | "stub_model"
  | "artifact_ml";

export type PredictionValueSourceType = "heuristic" | "stub" | "ml_artifact";

export type PredictionCellStatus = "ready" | "unavailable";

export type PredictionArtifactStatus =
  | "not_applicable"
  | "ready"
  | "missing"
  | "invalid";

export type PredictionHeuristicPolicyId =
  | "v1_accuracy_raw_duration_baseline"
  | "v2_accuracy_beta_duration_unified";

export type PredictionRuntimeBackendConfig =
  | {
      kind: "heuristic_baseline";
      heuristicPolicyId: PredictionHeuristicPolicyId;
    }
  | {
      kind: "stub_model";
    }
  | {
      kind: "artifact_ml";
      artifactPath?: string | null;
    };

export type PredictionRuntimeConfig = {
  version: typeof PREDICTION_RUNTIME_CONFIG_VERSION;
  policyId: typeof PREDICTION_RUNTIME_POLICY_ID;
  backend: PredictionRuntimeBackendConfig;
};

export type PredictionRuntimePolicy = {
  id: typeof PREDICTION_RUNTIME_POLICY_ID;
  version: typeof PREDICTION_RUNTIME_POLICY_VERSION;
  targets: PredictionTargetId[];
};

export type PredictionAccuracyWindowEvidence = {
  scope:
    | "subject_lastN_clean"
    | "subject_lastN_fallback"
    | "global_lastN_clean";
  attemptCount: number;
  totalQuestions: number;
  correctQuestions: number;
  meanAccuracy: number | null;
};

export type PredictionDurationEvidence = {
  historyWindowAttempts: number;
  recentAttemptCount: number;
  observedQuestionCount: number;
  meanPerQuestionFirstAnswerMs: number | null;
};

export type PredictionFeaturePayload = {
  version: typeof PREDICTION_FEATURE_PAYLOAD_VERSION;
  context: {
    subjectId: string | null;
    difficultyTarget: DifficultyTarget;
    responseFormat: ResponseFormat;
    questionCount: number;
    currentAtIso: string;
  };
  accuracyEvidence: {
    windowAttempts: number;
    subjectCleanMinAttempts: number;
    totalHistoryAttemptsScanned: number;
    totalLearningEligibleAttempts: number;
    totalQuestionsBefore: number;
    recentAccuracy: number | null;
    timeSinceLastAttemptSec: number | null;
    subjectLastNClean: PredictionAccuracyWindowEvidence;
    subjectLastNFallback: PredictionAccuracyWindowEvidence;
    globalLastNClean: PredictionAccuracyWindowEvidence;
  };
  durationEvidence: PredictionDurationEvidence;
};

export type AccuracyMlFeatureDescriptor = {
  name: string;
  description: string;
  transform: string;
};

export const ACCURACY_ML_FEATURE_SCHEMA = [
  {
    name: "difficulty_easy",
    description: "Easy difficulty indicator.",
    transform: "1 if difficultyTarget=easy else 0",
  },
  {
    name: "difficulty_hard",
    description: "Hard difficulty indicator.",
    transform: "1 if difficultyTarget=hard else 0",
  },
  {
    name: "question_count_centered",
    description: "Question-count deviation from the 5-question baseline.",
    transform: "(clampQuestionCount(questionCount) - 5) / 5",
  },
  {
    name: "log_total_questions_before",
    description: "Log-scaled amount of prior learning-eligible question evidence.",
    transform: "log1p(totalQuestionsBefore) / 5",
  },
  {
    name: "recent_accuracy_centered",
    description: "Recent accuracy centered around 0.5.",
    transform: "((recentAccuracy ?? 0.5) - 0.5) * 2",
  },
  {
    name: "recent_accuracy_missing",
    description: "Missing-indicator for recent accuracy.",
    transform: "1 if recentAccuracy is null else 0",
  },
  {
    name: "log_time_since_last_attempt_days",
    description: "Log-scaled recency since the last learning-eligible attempt.",
    transform: "log1p(timeSinceLastAttemptSec / 86400) when present else 0",
  },
  {
    name: "time_since_last_attempt_missing",
    description: "Missing-indicator for time-since-last-attempt.",
    transform: "1 if timeSinceLastAttemptSec is null else 0",
  },
] as const satisfies readonly AccuracyMlFeatureDescriptor[];

export type AccuracyMlFeatureName =
  (typeof ACCURACY_ML_FEATURE_SCHEMA)[number]["name"];

export type AccuracyMlFeatureInput = {
  difficultyTarget: string | null | undefined;
  questionCount: number | null | undefined;
  totalQuestionsBefore: number;
  recentAccuracy: number | null | undefined;
  timeSinceLastAttemptSec: number | null | undefined;
};

export type AccuracyMlFeatureVector = {
  schemaVersion: typeof ACCURACY_ML_FEATURE_SCHEMA_VERSION;
  values: Record<AccuracyMlFeatureName, number>;
};

export type PredictionArtifactDescriptor = {
  status: PredictionArtifactStatus;
  path: string | null;
  warning: string | null;
  modelVersion: string | null;
  artifactSchemaVersion: string | null;
};

export type PredictionRuntimeDescriptor = {
  policyId: string;
  policyVersion: string;
  configVersion: string;
  selectionSource: "config" | "default";
  selectionWarning: string | null;
  backendKind: PredictionBackendKind;
  backendId: string;
  backendStatus: "ready" | "artifact_missing" | "artifact_invalid";
  featurePayloadVersion: string;
  accuracyFeatureSchemaVersion: string;
  artifact: PredictionArtifactDescriptor;
};

export type PredictionCellMetadata = {
  targetId: PredictionTargetId;
  sourceType: PredictionValueSourceType;
  producerId: string;
  backendKind: PredictionBackendKind;
  backendId: string;
  runtimePolicyId: string;
  featurePayloadVersion: string;
  accuracyFeatureSchemaVersion: string;
  artifact: PredictionArtifactDescriptor;
};

export type PredictionCell = {
  targetId: PredictionTargetId;
  status: PredictionCellStatus;
  value: number | null;
  confidence: number;
  basis: string;
  metadata: PredictionCellMetadata;
  components?: {
    baseline: number;
    telemetryAdjustment?: number;
  };
};

export const DEFAULT_PREDICTION_RUNTIME_POLICY: PredictionRuntimePolicy = {
  id: PREDICTION_RUNTIME_POLICY_ID,
  version: PREDICTION_RUNTIME_POLICY_VERSION,
  targets: ["expected_accuracy", "expected_total_duration_ms"],
};

export const DEFAULT_PREDICTION_RUNTIME_CONFIG: PredictionRuntimeConfig = {
  version: PREDICTION_RUNTIME_CONFIG_VERSION,
  policyId: PREDICTION_RUNTIME_POLICY_ID,
  backend: {
    kind: "heuristic_baseline",
    heuristicPolicyId: "v2_accuracy_beta_duration_unified",
  },
};
