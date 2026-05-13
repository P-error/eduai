import {
  clampDifficulty,
  type DifficultyTarget,
  type ResponseFormat,
} from "@/lib/prediction-baselines";
import type {
  PredictionBackendKind,
  PredictionRuntimeDescriptor,
  PredictionValueSourceType,
} from "@/lib/prediction-contract";
import { sanitizePreferenceMap } from "@/lib/tags";

export type PedagogicalDecisionDepthV1 = "brief" | "standard" | "detailed";
export type PedagogicalInstructionalModeV1 =
  | "quiz"
  | "exam"
  | "practice"
  | "chat"
  | "unknown";
export type PedagogicalHintPolicyV1 =
  | "not_explicitly_controlled"
  | "on_request"
  | "guided_scaffolding"
  | "unknown";
export type PedagogicalDecisionSourceV1 =
  | "predicted_runtime_bridge"
  | "declared_preference_bridge"
  | "baseline_bridge"
  | "manual_override_bridge"
  | "unknown";
export type DecisionBackendKindV1 =
  | "heuristic"
  | "stub"
  | "artifact"
  | "unknown";
export type DecisionMaterializationSurfaceV1 = "test" | "chat" | "unknown";
export type DecisionPresentationModeV1 =
  | "mcq_test"
  | "structured_chat"
  | null;
export type DecisionFormattingHintV1 = "brief" | "balanced" | "scaffolded" | null;

export type PedagogicalDecisionV1 = {
  difficulty: DifficultyTarget;
  depth: PedagogicalDecisionDepthV1;
  instructional_mode: PedagogicalInstructionalModeV1;
  hint_policy: PedagogicalHintPolicyV1;
  decision_source: PedagogicalDecisionSourceV1;
  policy_name: string;
  policy_version: string;
  decision_confidence: number;
  materialization_constraints: {
    surface: DecisionMaterializationSurfaceV1;
    response_format: ResponseFormat | null;
    tone: string | null;
    explanation_style: string | null;
    presentation_mode: DecisionPresentationModeV1;
    formatting_hint: DecisionFormattingHintV1;
    explanation_strategy?: string | null;
    question_format?: ResponseFormat | null;
  };
};

export type DecisionProvenanceV1 = {
  backend_kind: DecisionBackendKindV1;
  policy_name: string;
  policy_version: string;
  source_module: string;
  fallback_used: boolean;
  artifact_id?: string | null;
  notes?: string | null;
};

export type LearnerStateSnapshotV1 = {
  declared_preferences_summary: {
    difficulty_target: string | null;
    depth: string | null;
    tone: string | null;
    explanation_style: string | null;
    response_format: string | null;
    availability: "available" | "partial" | "missing";
  };
  accessibility_summary: {
    theme: string | null;
    font_scale: string | null;
    high_contrast: boolean | null;
    reduced_motion: boolean | null;
    availability: "available" | "partial" | "missing";
  };
  recent_performance_summary: {
    recent_accuracy: number | null;
    total_questions_before: number | null;
    time_since_last_attempt_sec: number | null;
    evidence_status: "available" | "limited" | "missing";
  };
  topic_context_summary: {
    subject_id: string | null;
    subject_title: string | null;
    section_id: string | null;
    topic: string | null;
    education_level: string | null;
    domain: string | null;
    context: string | null;
    task_type: PedagogicalInstructionalModeV1 | null;
  };
  uncertainty_summary: {
    declared_preferences_complete: boolean;
    accessibility_complete: boolean;
    recent_performance_low_evidence: boolean;
    notes?: string | null;
  };
};

export type DeliveredPedagogicalDecisionV1 = {
  learner_state_snapshot: LearnerStateSnapshotV1;
  pedagogical_decision: PedagogicalDecisionV1;
  provenance: DecisionProvenanceV1;
  delivered_at_iso: string | null;
  episode_linkage: {
    episode_id: string | null;
    sequence_role: string | null;
    touchpoint_type: string | null;
    content_id: string | null;
  };
};

type DecisionMaterializationInput = {
  surface?: string | null;
  responseFormat?: string | null;
  tone?: string | null;
  explanationStyle?: string | null;
  presentationMode?: string | null;
  formattingHint?: string | null;
  explanationStrategy?: string | null;
  questionFormat?: string | null;
} | null;

function clamp01(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeString(value: string | null | undefined, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeResponseFormat(value: string | null | undefined): ResponseFormat | null {
  return value === "mcq" ? value : null;
}

export function normalizePedagogicalDecisionDepthV1(
  value: string | null | undefined,
): PedagogicalDecisionDepthV1 {
  if (value === "brief" || value === "standard" || value === "detailed") {
    return value;
  }
  return "standard";
}

export function normalizeInstructionalModeV1(
  value: string | null | undefined,
): PedagogicalInstructionalModeV1 {
  if (
    value === "quiz" ||
    value === "exam" ||
    value === "practice" ||
    value === "chat"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeHintPolicyV1(
  value: string | null | undefined,
): PedagogicalHintPolicyV1 {
  if (
    value === "not_explicitly_controlled" ||
    value === "on_request" ||
    value === "guided_scaffolding"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeDecisionSourceV1(
  value: string | null | undefined,
): PedagogicalDecisionSourceV1 {
  if (
    value === "predicted_runtime_bridge" ||
    value === "declared_preference_bridge" ||
    value === "baseline_bridge" ||
    value === "manual_override_bridge"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeMaterializationSurfaceV1(
  value: string | null | undefined,
): DecisionMaterializationSurfaceV1 {
  if (value === "test" || value === "chat") {
    return value;
  }
  return "unknown";
}

function normalizePresentationModeV1(
  value: string | null | undefined,
): DecisionPresentationModeV1 {
  if (value === "mcq_test" || value === "structured_chat") {
    return value;
  }
  return null;
}

function normalizeFormattingHintV1(
  value: string | null | undefined,
): DecisionFormattingHintV1 {
  if (value === "brief" || value === "balanced" || value === "scaffolded") {
    return value;
  }
  return null;
}

export function normalizeDecisionBackendKindV1(
  value: PredictionBackendKind | DecisionBackendKindV1 | string | null | undefined,
): DecisionBackendKindV1 {
  if (value === "heuristic_baseline" || value === "heuristic") {
    return "heuristic";
  }
  if (value === "stub_model" || value === "stub") {
    return "stub";
  }
  if (value === "artifact_ml" || value === "artifact") {
    return "artifact";
  }
  return "unknown";
}

export function resolveDecisionBackendKindFromSources(params: {
  runtime?: Pick<PredictionRuntimeDescriptor, "backendKind"> | null;
  sourceTypes?: Array<PredictionValueSourceType | null | undefined>;
}): DecisionBackendKindV1 {
  const sourceTypes = params.sourceTypes ?? [];
  if (sourceTypes.some((value) => value === "heuristic")) {
    return "heuristic";
  }
  if (sourceTypes.some((value) => value === "stub")) {
    return "stub";
  }
  if (sourceTypes.some((value) => value === "ml_artifact")) {
    return "artifact";
  }
  return normalizeDecisionBackendKindV1(params.runtime?.backendKind);
}

export function buildDecisionProvenanceV1(params: {
  backendKind?: PredictionBackendKind | DecisionBackendKindV1 | string | null;
  policyName?: string | null;
  policyVersion?: string | null;
  sourceModule: string;
  fallbackUsed?: boolean;
  artifactId?: string | null;
  notes?: string | null;
}): DecisionProvenanceV1 {
  return {
    backend_kind: normalizeDecisionBackendKindV1(params.backendKind),
    policy_name: normalizeString(params.policyName, "unknown_policy"),
    policy_version: normalizeString(params.policyVersion, "unknown_version"),
    source_module: normalizeString(params.sourceModule, "unknown_module"),
    fallback_used: params.fallbackUsed === true,
    artifact_id: normalizeOptionalString(params.artifactId),
    notes: normalizeOptionalString(params.notes),
  };
}

export function normalizeToPedagogicalDecisionV1(params: {
  difficulty: string | null | undefined;
  depth: string | null | undefined;
  instructionalMode?: string | null;
  hintPolicy?: string | null;
  decisionSource?: string | null;
  policyName?: string | null;
  policyVersion?: string | null;
  decisionConfidence?: number | null;
  materialization?: DecisionMaterializationInput;
}): PedagogicalDecisionV1 {
  const materialization = params.materialization ?? null;

  return {
    difficulty: clampDifficulty(params.difficulty),
    depth: normalizePedagogicalDecisionDepthV1(params.depth),
    instructional_mode: normalizeInstructionalModeV1(params.instructionalMode),
    hint_policy: normalizeHintPolicyV1(params.hintPolicy),
    decision_source: normalizeDecisionSourceV1(params.decisionSource),
    policy_name: normalizeString(params.policyName, "unknown_policy"),
    policy_version: normalizeString(params.policyVersion, "unknown_version"),
    decision_confidence: clamp01(params.decisionConfidence),
    materialization_constraints: {
      surface: normalizeMaterializationSurfaceV1(materialization?.surface),
      response_format: normalizeResponseFormat(materialization?.responseFormat),
      tone: normalizeOptionalString(materialization?.tone),
      explanation_style: normalizeOptionalString(materialization?.explanationStyle),
      presentation_mode: normalizePresentationModeV1(
        materialization?.presentationMode,
      ),
      formatting_hint: normalizeFormattingHintV1(materialization?.formattingHint),
      explanation_strategy: normalizeOptionalString(
        materialization?.explanationStrategy,
      ),
      question_format: normalizeResponseFormat(materialization?.questionFormat),
    },
  };
}

export function buildLearnerStateSnapshotV1(params: {
  declaredPreferences?: Record<string, unknown> | null;
  accessibilityPreferences?: Record<string, unknown> | null;
  recentPerformance?: {
    recentAccuracy?: number | null;
    totalQuestionsBefore?: number | null;
    timeSinceLastAttemptSec?: number | null;
  } | null;
  topicContext?: {
    subjectId?: string | null;
    subjectTitle?: string | null;
    sectionId?: string | null;
    topic?: string | null;
    educationLevel?: string | null;
    domain?: string | null;
    context?: string | null;
    taskType?: string | null;
  } | null;
  notes?: string | null;
}): LearnerStateSnapshotV1 {
  const declaredPreferences = sanitizePreferenceMap(params.declaredPreferences);
  const accessibility = params.accessibilityPreferences ?? {};
  const performance = params.recentPerformance ?? null;
  const topicContext = params.topicContext ?? null;

  const declaredPreferenceFields = [
    declaredPreferences.difficulty_target,
    declaredPreferences.depth,
    declaredPreferences.tone,
    declaredPreferences.explanation_style,
    declaredPreferences.response_format,
  ].filter((value) => typeof value === "string").length;
  const accessibilityFields = [
    typeof accessibility.theme === "string",
    typeof accessibility.fontScale === "string",
    typeof accessibility.highContrast === "boolean",
    typeof accessibility.reducedMotion === "boolean",
  ].filter(Boolean).length;
  const performanceAvailability =
    typeof performance?.recentAccuracy === "number" ||
    typeof performance?.totalQuestionsBefore === "number" ||
    typeof performance?.timeSinceLastAttemptSec === "number";
  const totalQuestionsBefore =
    typeof performance?.totalQuestionsBefore === "number" &&
    Number.isFinite(performance.totalQuestionsBefore)
      ? Math.max(0, Math.floor(performance.totalQuestionsBefore))
      : null;

  return {
    declared_preferences_summary: {
      difficulty_target: declaredPreferences.difficulty_target ?? null,
      depth: declaredPreferences.depth ?? null,
      tone: declaredPreferences.tone ?? null,
      explanation_style: declaredPreferences.explanation_style ?? null,
      response_format: declaredPreferences.response_format ?? null,
      availability:
        declaredPreferenceFields === 0
          ? "missing"
          : declaredPreferenceFields < 5
            ? "partial"
            : "available",
    },
    accessibility_summary: {
      theme:
        typeof accessibility.theme === "string" ? accessibility.theme : null,
      font_scale:
        typeof accessibility.fontScale === "string"
          ? accessibility.fontScale
          : null,
      high_contrast:
        typeof accessibility.highContrast === "boolean"
          ? accessibility.highContrast
          : null,
      reduced_motion:
        typeof accessibility.reducedMotion === "boolean"
          ? accessibility.reducedMotion
          : null,
      availability:
        accessibilityFields === 0
          ? "missing"
          : accessibilityFields < 4
            ? "partial"
            : "available",
    },
    recent_performance_summary: {
      recent_accuracy:
        typeof performance?.recentAccuracy === "number" &&
        Number.isFinite(performance.recentAccuracy)
          ? clamp01(performance.recentAccuracy)
          : null,
      total_questions_before: totalQuestionsBefore,
      time_since_last_attempt_sec:
        typeof performance?.timeSinceLastAttemptSec === "number" &&
        Number.isFinite(performance.timeSinceLastAttemptSec)
          ? Math.max(0, Math.floor(performance.timeSinceLastAttemptSec))
          : null,
      evidence_status:
        !performanceAvailability
          ? "missing"
          : totalQuestionsBefore != null && totalQuestionsBefore >= 10
            ? "available"
            : "limited",
    },
    topic_context_summary: {
      subject_id: normalizeOptionalString(topicContext?.subjectId),
      subject_title: normalizeOptionalString(topicContext?.subjectTitle),
      section_id: normalizeOptionalString(topicContext?.sectionId),
      topic: normalizeOptionalString(topicContext?.topic),
      education_level: normalizeOptionalString(topicContext?.educationLevel),
      domain: normalizeOptionalString(topicContext?.domain),
      context: normalizeOptionalString(topicContext?.context),
      task_type: topicContext?.taskType
        ? normalizeInstructionalModeV1(topicContext.taskType)
        : null,
    },
    uncertainty_summary: {
      declared_preferences_complete: declaredPreferenceFields >= 5,
      accessibility_complete: accessibilityFields >= 4,
      recent_performance_low_evidence:
        totalQuestionsBefore == null || totalQuestionsBefore < 10,
      notes: normalizeOptionalString(params.notes),
    },
  };
}

export function buildDeliveredPedagogicalDecisionV1(params: {
  learnerStateSnapshot: LearnerStateSnapshotV1;
  pedagogicalDecision: PedagogicalDecisionV1;
  provenance: DecisionProvenanceV1;
  deliveredAt?: Date | string | null;
  episodeId?: string | null;
  sequenceRole?: string | null;
  touchpointType?: string | null;
  contentId?: string | null;
}): DeliveredPedagogicalDecisionV1 {
  const deliveredAtIso =
    params.deliveredAt instanceof Date
      ? params.deliveredAt.toISOString()
      : typeof params.deliveredAt === "string"
        ? params.deliveredAt
        : null;

  return {
    learner_state_snapshot: params.learnerStateSnapshot,
    pedagogical_decision: params.pedagogicalDecision,
    provenance: params.provenance,
    delivered_at_iso: deliveredAtIso,
    episode_linkage: {
      episode_id: normalizeOptionalString(params.episodeId),
      sequence_role: normalizeOptionalString(params.sequenceRole),
      touchpoint_type: normalizeOptionalString(params.touchpointType),
      content_id: normalizeOptionalString(params.contentId),
    },
  };
}
