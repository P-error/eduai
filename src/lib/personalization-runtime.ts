import type { ActivePredictionRuntimeSnapshot } from "@/lib/active-policy";
import {
  buildDecisionProvenanceV1,
  buildLearnerStateSnapshotV1,
  normalizeDecisionBackendKindV1,
  normalizeToPedagogicalDecisionV1,
  resolveDecisionBackendKindFromSources,
  type DecisionProvenanceV1,
  type LearnerStateSnapshotV1,
  type PedagogicalDecisionDepthV1,
  type PedagogicalDecisionV1,
  type PedagogicalInstructionalModeV1,
} from "@/lib/pedagogical-decision-contract";
import {
  clampDifficulty,
  clampQuestionCount,
  clampResponseFormat,
  type DifficultyTarget,
  type ResponseFormat,
} from "@/lib/prediction-baselines";
import {
  buildPredictionFeaturePayload,
  type PredictionHistoryAttempt,
} from "@/lib/prediction-feature-layer";
import { type DurationHistoricalAttempt } from "@/lib/prediction-duration";
import {
  type PredictionCell,
  type PredictionRuntimeDescriptor,
} from "@/lib/prediction-contract";
import { runPredictionRuntime } from "@/lib/prediction-runtime";
import {
  DIFFICULTY_ORDER,
  isSupportedTagForAxis,
  sanitizePreferenceMap,
  TARGET_SCORE_BAND,
} from "@/lib/tags";

export const PEDAGOGICAL_DECISION_SCHEMA_VERSION =
  "pedagogical_decision_v1_2026_03" as const;
export const RENDERING_RULES_LAYER_ID =
  "rendering_rules_v1_2026_03" as const;

export type ExplanationDepth = PedagogicalDecisionDepthV1;
export type PersonalizationSurface = "test" | "chat";
export type PersonalizationMode = Exclude<
  PedagogicalInstructionalModeV1,
  "unknown"
>;

export type PedagogicalDecision = Pick<
  PedagogicalDecisionV1,
  "difficulty" | "depth"
>;

export type DecisionContext = {
  subjectId: string | null;
  subjectTitle: string | null;
  sectionId: string | null;
  topic: string | null;
  educationLevel: string | null;
  domain: string | null;
  context: string | null;
  taskType: PersonalizationMode;
  questionCount: number;
  historicalSignals: {
    recentAccuracy: number | null;
    totalQuestionsBefore: number;
    timeSinceLastAttemptSec: number | null;
  };
};

export type DifficultyCandidateEvaluation = {
  difficulty: DifficultyTarget;
  expectedAccuracy: PredictionCell;
  expectedTotalDurationMs: PredictionCell;
};

export type DecisionSelectionTrace = {
  value: DifficultyTarget | ExplanationDepth;
  confidence: number;
  sourceType: PredictionCell["metadata"]["sourceType"];
  basis: string;
};

export type RenderingDecision = {
  tone: string;
  explanationStyle: string;
  responseFormat: ResponseFormat;
  presentationMode: "mcq_test" | "structured_chat";
  formattingHint: "brief" | "balanced" | "scaffolded";
};

export type MaterializedDeliveryPlan = {
  rulesLayerId: typeof RENDERING_RULES_LAYER_ID;
  basis: string;
  renderingDecision: RenderingDecision;
  uxPreset: {
    tone: string;
    explanation_style: string;
    response_format: ResponseFormat;
  };
  pedagogyPreset: {
    difficulty_target: DifficultyTarget;
    depth: ExplanationDepth;
  };
  delivery: {
    tone: string;
    explanation_style: string;
    response_format: ResponseFormat;
    difficulty_target: DifficultyTarget;
    depth: ExplanationDepth;
  };
};

export type PersonalizationPlan = {
  schemaVersion: typeof PEDAGOGICAL_DECISION_SCHEMA_VERSION;
  surface: PersonalizationSurface;
  runtime: PredictionRuntimeDescriptor;
  decisionContext: DecisionContext;
  learnerStateSnapshot: LearnerStateSnapshotV1;
  decisionProvenance: DecisionProvenanceV1;
  candidateEvaluations: DifficultyCandidateEvaluation[];
  pedagogicalDecision: PedagogicalDecision;
  pedagogicalDecisionV1: PedagogicalDecisionV1;
  decisionTrace: {
    difficulty: DecisionSelectionTrace;
    depth: DecisionSelectionTrace;
  };
  selectedPrediction: {
    expectedAccuracy: PredictionCell;
    expectedTotalDurationMs: PredictionCell;
  };
  materialization: MaterializedDeliveryPlan;
};

export type DeclaredPreferenceMaterialization = {
  pedagogicalDecision: PedagogicalDecision;
  materialization: MaterializedDeliveryPlan;
  coverage: {
    difficultyFromDeclared: boolean;
    depthFromDeclaredPreference: boolean;
    depthFromDeclaredStyleFallback: boolean;
  };
};

type DifficultyCandidateRuntime = DifficultyCandidateEvaluation & {
  featurePayload: ReturnType<typeof buildPredictionFeaturePayload>;
  runtime: PredictionRuntimeDescriptor;
};

export const BASELINE_PEDAGOGICAL_DECISION: PedagogicalDecision = {
  difficulty: "medium",
  depth: "standard",
};

export const BASELINE_RENDERING_PRESET = {
  tone: "formal",
  explanationStyle: "stepwise",
  responseFormat: "mcq" as ResponseFormat,
} as const;

export const BASELINE_DELIVERY = {
  tone: BASELINE_RENDERING_PRESET.tone,
  explanation_style: BASELINE_RENDERING_PRESET.explanationStyle,
  response_format: BASELINE_RENDERING_PRESET.responseFormat,
  difficulty_target: BASELINE_PEDAGOGICAL_DECISION.difficulty,
  depth: BASELINE_PEDAGOGICAL_DECISION.depth,
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function clampExplanationDepth(
  value: string | null | undefined,
): ExplanationDepth {
  if (value === "brief" || value === "standard" || value === "detailed") {
    return value;
  }
  return BASELINE_PEDAGOGICAL_DECISION.depth;
}

function resolveTone(value: string | null | undefined) {
  if (isSupportedTagForAxis("tone", value)) {
    return value;
  }
  return BASELINE_RENDERING_PRESET.tone;
}

function resolveExplanationStyle(value: string | null | undefined) {
  if (isSupportedTagForAxis("explanation_style", value)) {
    return value;
  }
  return BASELINE_RENDERING_PRESET.explanationStyle;
}

function buildDifficultyCandidates(params: {
  snapshot: ActivePredictionRuntimeSnapshot;
  historyAttempts: PredictionHistoryAttempt[];
  durationAttempts: DurationHistoricalAttempt[];
  subjectId: string | null;
  responseFormat: ResponseFormat;
  questionCount: number;
  currentAt: Date;
}): DifficultyCandidateRuntime[] {
  return DIFFICULTY_ORDER.map((difficulty) => {
    const featurePayload = buildPredictionFeaturePayload({
      historyAttempts: params.historyAttempts,
      durationAttempts: params.durationAttempts,
      subjectId: params.subjectId,
      difficultyTarget: difficulty,
      responseFormat: params.responseFormat,
      questionCount: params.questionCount,
      currentAt: params.currentAt,
    });
    const runtimeResult = runPredictionRuntime({
      snapshot: params.snapshot,
      featurePayload,
    });

    return {
      difficulty,
      expectedAccuracy: runtimeResult.predicted.expectedAccuracy,
      expectedTotalDurationMs: runtimeResult.predicted.expectedTotalDurationMs,
      featurePayload,
      runtime: runtimeResult.runtime,
    };
  });
}

function selectDifficultyCandidate(params: {
  candidates: DifficultyCandidateRuntime[];
  currentDifficulty: DifficultyTarget;
}) {
  const targetMidpoint =
    (TARGET_SCORE_BAND.low + TARGET_SCORE_BAND.high) / 2;
  const currentIndex = DIFFICULTY_ORDER.indexOf(params.currentDifficulty);
  const ready = params.candidates
    .filter(
      (candidate) =>
        candidate.expectedAccuracy.status === "ready" &&
        candidate.expectedAccuracy.value != null,
    )
    .sort((left, right) => {
      const leftValue = left.expectedAccuracy.value ?? targetMidpoint;
      const rightValue = right.expectedAccuracy.value ?? targetMidpoint;
      const leftWithin =
        leftValue >= TARGET_SCORE_BAND.low && leftValue <= TARGET_SCORE_BAND.high;
      const rightWithin =
        rightValue >= TARGET_SCORE_BAND.low && rightValue <= TARGET_SCORE_BAND.high;

      if (leftWithin !== rightWithin) {
        return leftWithin ? -1 : 1;
      }

      const leftDistance = Math.abs(leftValue - targetMidpoint);
      const rightDistance = Math.abs(rightValue - targetMidpoint);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      const leftStep = Math.abs(DIFFICULTY_ORDER.indexOf(left.difficulty) - currentIndex);
      const rightStep = Math.abs(
        DIFFICULTY_ORDER.indexOf(right.difficulty) - currentIndex,
      );
      return leftStep - rightStep;
    });

  const chosen =
    ready[0] ??
    params.candidates.find(
      (candidate) => candidate.difficulty === params.currentDifficulty,
    ) ??
    params.candidates[1] ??
    params.candidates[0];

  if (ready[0]) {
    const accuracyValue = ready[0].expectedAccuracy.value ?? targetMidpoint;
    const selectionBasis =
      accuracyValue >= TARGET_SCORE_BAND.low &&
      accuracyValue <= TARGET_SCORE_BAND.high
        ? "within_target_band"
        : "closest_to_target_midpoint";

    return {
      chosen,
      trace: {
        value: ready[0].difficulty,
        confidence: ready[0].expectedAccuracy.confidence,
        sourceType: ready[0].expectedAccuracy.metadata.sourceType,
        basis: `${selectionBasis}|${ready[0].expectedAccuracy.basis}`,
      } satisfies DecisionSelectionTrace,
    };
  }

  return {
    chosen,
    trace: {
      value: chosen.difficulty,
      confidence: 0,
      sourceType: "heuristic",
      basis: `no_ready_accuracy_candidate_keep_current|backend=${chosen.runtime.backendKind}`,
    } satisfies DecisionSelectionTrace,
  };
}

function selectExplanationDepth(params: {
  snapshot: ActivePredictionRuntimeSnapshot;
  candidate: DifficultyCandidateRuntime;
}) {
  const expectedAccuracy = params.candidate.expectedAccuracy.value;
  const evidence = params.candidate.featurePayload.accuracyEvidence;
  const totalQuestionsBefore = evidence.totalQuestionsBefore;
  const recentAccuracy = evidence.recentAccuracy;

  if (params.snapshot.config.backend.kind === "stub_model") {
    const score =
      (expectedAccuracy ?? 0.5) -
      0.5 +
      (params.candidate.difficulty === "hard"
        ? -0.12
        : params.candidate.difficulty === "easy"
          ? 0.12
          : 0) +
      (totalQuestionsBefore < 12 ? -0.08 : 0);

    if (score <= -0.08) {
      return {
        value: "detailed",
        confidence: clamp01(0.35 + params.candidate.expectedAccuracy.confidence),
        sourceType: "stub",
        basis: "stub_depth_thresholding(score<=-0.08)",
      } satisfies DecisionSelectionTrace;
    }

    if (score >= 0.12) {
      return {
        value: "brief",
        confidence: clamp01(0.35 + params.candidate.expectedAccuracy.confidence),
        sourceType: "stub",
        basis: "stub_depth_thresholding(score>=0.12)",
      } satisfies DecisionSelectionTrace;
    }

    return {
      value: "standard",
      confidence: clamp01(0.35 + params.candidate.expectedAccuracy.confidence),
      sourceType: "stub",
      basis: "stub_depth_thresholding(standard_band)",
    } satisfies DecisionSelectionTrace;
  }

  if (
    totalQuestionsBefore < 10 ||
    recentAccuracy == null ||
    (expectedAccuracy != null && expectedAccuracy < TARGET_SCORE_BAND.low) ||
    (params.candidate.difficulty === "hard" &&
      (expectedAccuracy == null || expectedAccuracy < 0.72))
  ) {
    return {
      value: "detailed",
      confidence: clamp01(0.45 + params.candidate.expectedAccuracy.confidence * 0.5),
      sourceType: "heuristic",
      basis:
        "heuristic_depth_more_scaffolding(low_evidence_or_low_expected_success)",
    } satisfies DecisionSelectionTrace;
  }

  if (
    expectedAccuracy != null &&
    expectedAccuracy > TARGET_SCORE_BAND.high &&
    totalQuestionsBefore >= 20
  ) {
    return {
      value: "brief",
      confidence: clamp01(0.45 + params.candidate.expectedAccuracy.confidence * 0.5),
      sourceType: "heuristic",
      basis: "heuristic_depth_brief(high_expected_success_with_history)",
    } satisfies DecisionSelectionTrace;
  }

  return {
    value: "standard",
    confidence: clamp01(0.45 + params.candidate.expectedAccuracy.confidence * 0.5),
    sourceType: "heuristic",
    basis: "heuristic_depth_balanced(mid_band_default)",
  } satisfies DecisionSelectionTrace;
}

function materializeExplanationStyle(params: {
  preferredStyle: string;
  depth: ExplanationDepth;
  surface: PersonalizationSurface;
}) {
  if (params.depth === "brief") {
    return "concise";
  }

  if (params.depth === "detailed") {
    if (
      params.surface === "chat" &&
      params.preferredStyle === "exploratory"
    ) {
      return "exploratory";
    }
    return "stepwise";
  }

  return params.preferredStyle;
}

function materializeFormattingHint(
  depth: ExplanationDepth,
  surface: PersonalizationSurface,
) {
  if (surface === "chat") {
    return depth === "brief"
      ? "brief"
      : depth === "detailed"
        ? "scaffolded"
        : "balanced";
  }

  return depth === "detailed"
    ? "scaffolded"
    : depth === "brief"
      ? "brief"
      : "balanced";
}

function buildMaterialization(params: {
  surface: PersonalizationSurface;
  preferences: Record<string, string>;
  decision: PedagogicalDecision;
}): MaterializedDeliveryPlan {
  const tone = resolveTone(params.preferences.tone);
  const preferredStyle = resolveExplanationStyle(
    params.preferences.explanation_style,
  );
  const explanationStyle = materializeExplanationStyle({
    preferredStyle,
    depth: params.decision.depth,
    surface: params.surface,
  });
  const responseFormat = clampResponseFormat(params.preferences.response_format);
  const renderingDecision: RenderingDecision = {
    tone,
    explanationStyle,
    responseFormat,
    presentationMode:
      params.surface === "chat" ? "structured_chat" : "mcq_test",
    formattingHint: materializeFormattingHint(
      params.decision.depth,
      params.surface,
    ),
  };

  return {
    rulesLayerId: RENDERING_RULES_LAYER_ID,
    basis: [
      `surface=${params.surface}`,
      `depth=${params.decision.depth}`,
      `preferred_style=${preferredStyle}`,
      `tone=${tone}`,
    ].join("|"),
    renderingDecision,
    uxPreset: {
      tone,
      explanation_style: explanationStyle,
      response_format: responseFormat,
    },
    pedagogyPreset: {
      difficulty_target: params.decision.difficulty,
      depth: params.decision.depth,
    },
    // Legacy delivery сохраняем только как адаптер для текущих route/input surfaces.
    delivery: {
      tone,
      explanation_style: explanationStyle,
      response_format: responseFormat,
      difficulty_target: params.decision.difficulty,
      depth: params.decision.depth,
    },
  };
}

export function materializeDeliveryPlan(params: {
  surface: PersonalizationSurface;
  preferences: Record<string, unknown> | null | undefined;
  decision: PedagogicalDecision;
}) {
  return buildMaterialization({
    surface: params.surface,
    preferences: sanitizePreferenceMap(params.preferences),
    decision: params.decision,
  });
}

export function buildPersonalizationPlan(params: {
  snapshot: ActivePredictionRuntimeSnapshot;
  historyAttempts: PredictionHistoryAttempt[];
  durationAttempts: DurationHistoricalAttempt[];
  declaredPreferences?: Record<string, unknown> | null | undefined;
  effectivePreferences: Record<string, unknown> | null | undefined;
  accessibilityPreferences?: Record<string, unknown> | null | undefined;
  surface: PersonalizationSurface;
  mode: PersonalizationMode;
  subjectId?: string | null;
  subjectTitle?: string | null;
  sectionId?: string | null;
  topic?: string | null;
  questionCount: number;
  currentDifficulty?: string | null;
  educationLevel?: string | null;
  currentAt?: Date;
}): PersonalizationPlan {
  const preferences = sanitizePreferenceMap(params.effectivePreferences);
  const responseFormat = clampResponseFormat(preferences.response_format);
  const questionCount = clampQuestionCount(params.questionCount);
  const currentDifficulty = clampDifficulty(
    params.currentDifficulty ?? preferences.difficulty_target,
  );
  const currentAt = params.currentAt ?? new Date();

  const candidates = buildDifficultyCandidates({
    snapshot: params.snapshot,
    historyAttempts: params.historyAttempts,
    durationAttempts: params.durationAttempts,
    subjectId: params.subjectId ?? null,
    responseFormat,
    questionCount,
    currentAt,
  });
  const selectedDifficulty = selectDifficultyCandidate({
    candidates,
    currentDifficulty,
  });
  const selectedDepth = selectExplanationDepth({
    snapshot: params.snapshot,
    candidate: selectedDifficulty.chosen,
  });
  const pedagogicalDecision: PedagogicalDecision = {
    difficulty: selectedDifficulty.chosen.difficulty,
    depth: selectedDepth.value as ExplanationDepth,
  };
  const materialization = buildMaterialization({
    surface: params.surface,
    preferences,
    decision: pedagogicalDecision,
  });
  const learnerStateSnapshot = buildLearnerStateSnapshotV1({
    declaredPreferences: params.declaredPreferences,
    accessibilityPreferences: params.accessibilityPreferences,
    recentPerformance: {
      recentAccuracy:
        selectedDifficulty.chosen.featurePayload.accuracyEvidence.recentAccuracy,
      totalQuestionsBefore:
        selectedDifficulty.chosen.featurePayload.accuracyEvidence
          .totalQuestionsBefore,
      timeSinceLastAttemptSec:
        selectedDifficulty.chosen.featurePayload.accuracyEvidence
          .timeSinceLastAttemptSec,
    },
    topicContext: {
      subjectId: params.subjectId ?? null,
      subjectTitle: params.subjectTitle ?? null,
      sectionId: params.sectionId ?? null,
      topic: params.topic ?? null,
      educationLevel: params.educationLevel ?? null,
      domain: params.subjectTitle ?? null,
      context: params.topic ?? params.subjectTitle ?? null,
      taskType: params.mode,
    },
    notes:
      params.declaredPreferences == null
        ? "Declared preferences were not provided to the runtime decision boundary."
        : null,
  });
  const decisionBackendKind = resolveDecisionBackendKindFromSources({
    runtime: selectedDifficulty.chosen.runtime,
    sourceTypes: [
      selectedDifficulty.trace.sourceType,
      selectedDepth.sourceType,
    ],
  });
  const decisionProvenance = buildDecisionProvenanceV1({
    backendKind: decisionBackendKind,
    policyName: selectedDifficulty.chosen.runtime.policyId,
    policyVersion: selectedDifficulty.chosen.runtime.policyVersion,
    sourceModule: "@/lib/personalization-runtime.ts",
    fallbackUsed:
      decisionBackendKind !==
        normalizeDecisionBackendKindV1(
          selectedDifficulty.chosen.runtime.backendKind,
        ) || selectedDifficulty.trace.basis.startsWith("no_ready_accuracy_candidate"),
    artifactId:
      selectedDifficulty.chosen.runtime.backendKind === "artifact_ml"
        ? selectedDifficulty.chosen.runtime.artifact.modelVersion ??
          selectedDifficulty.chosen.runtime.backendId
        : null,
    notes: [
      `runtime_backend=${selectedDifficulty.chosen.runtime.backendKind}`,
      `difficulty_source=${selectedDifficulty.trace.sourceType}`,
      `depth_source=${selectedDepth.sourceType}`,
    ].join("|"),
  });
  const pedagogicalDecisionV1 = normalizeToPedagogicalDecisionV1({
    difficulty: pedagogicalDecision.difficulty,
    depth: pedagogicalDecision.depth,
    instructionalMode: params.mode,
    hintPolicy: "not_explicitly_controlled",
    decisionSource: "predicted_runtime_bridge",
    policyName: decisionProvenance.policy_name,
    policyVersion: decisionProvenance.policy_version,
    decisionConfidence: Math.min(
      selectedDifficulty.trace.confidence,
      selectedDepth.confidence,
    ),
    materialization: {
      surface: params.surface,
      responseFormat: materialization.uxPreset.response_format,
      tone: materialization.uxPreset.tone,
      explanationStyle: materialization.uxPreset.explanation_style,
      presentationMode: materialization.renderingDecision.presentationMode,
      formattingHint: materialization.renderingDecision.formattingHint,
    },
  });

  return {
    schemaVersion: PEDAGOGICAL_DECISION_SCHEMA_VERSION,
    surface: params.surface,
    runtime: selectedDifficulty.chosen.runtime,
    decisionContext: {
      subjectId: params.subjectId ?? null,
      subjectTitle: params.subjectTitle ?? null,
      sectionId: params.sectionId ?? null,
      topic: params.topic ?? null,
      educationLevel: params.educationLevel ?? null,
      domain: params.subjectTitle ?? null,
      context: params.topic ?? params.subjectTitle ?? null,
      taskType: params.mode,
      questionCount,
      historicalSignals: {
        recentAccuracy:
          selectedDifficulty.chosen.featurePayload.accuracyEvidence.recentAccuracy,
        totalQuestionsBefore:
          selectedDifficulty.chosen.featurePayload.accuracyEvidence
            .totalQuestionsBefore,
        timeSinceLastAttemptSec:
          selectedDifficulty.chosen.featurePayload.accuracyEvidence
            .timeSinceLastAttemptSec,
      },
    },
    learnerStateSnapshot,
    decisionProvenance,
    candidateEvaluations: candidates.map((candidate) => ({
      difficulty: candidate.difficulty,
      expectedAccuracy: candidate.expectedAccuracy,
      expectedTotalDurationMs: candidate.expectedTotalDurationMs,
    })),
    pedagogicalDecision,
    pedagogicalDecisionV1,
    decisionTrace: {
      difficulty: selectedDifficulty.trace,
      depth: selectedDepth,
    },
    selectedPrediction: {
      expectedAccuracy: selectedDifficulty.chosen.expectedAccuracy,
      expectedTotalDurationMs:
        selectedDifficulty.chosen.expectedTotalDurationMs,
    },
    materialization,
  };
}

export function describeDifficultyGuidance(difficulty: DifficultyTarget) {
  if (difficulty === "easy") {
    return "Keep the task accessible, concrete, and low-friction.";
  }
  if (difficulty === "hard") {
    return "Keep the task challenging and require stronger transfer or reasoning.";
  }
  return "Keep the task moderately challenging with balanced scaffolding.";
}

export function describeDepthGuidance(depth: ExplanationDepth) {
  if (depth === "brief") {
    return "Prefer short explanations, minimal scaffolding, and quick confirmation.";
  }
  if (depth === "detailed") {
    return "Provide more scaffolding, intermediate steps, and explicit reasoning.";
  }
  return "Use balanced explanation depth with practical but not excessive detail.";
}

export function createBaselineMaterialization(
  surface: PersonalizationSurface,
): MaterializedDeliveryPlan {
  return materializeDeliveryPlan({
    surface,
    preferences: {},
    decision: BASELINE_PEDAGOGICAL_DECISION,
  });
}

function mapDeclaredStyleToDepth(
  explanationStyle: string | null | undefined,
): ExplanationDepth {
  // В self-report ветке depth выводим явно из заявленного style, потому что
  // отдельная пользовательская ось depth в текущем контракте ещё не заведена.
  if (explanationStyle === "concise") {
    return "brief";
  }
  if (explanationStyle === "stepwise") {
    return "detailed";
  }
  return "standard";
}

export function createDeclaredPreferenceMaterialization(params: {
  surface: PersonalizationSurface;
  declaredPreferences: Record<string, unknown> | null | undefined;
}): DeclaredPreferenceMaterialization {
  const preferences = sanitizePreferenceMap(params.declaredPreferences);
  const hasDeclaredDepth = typeof preferences.depth === "string";
  const pedagogicalDecision: PedagogicalDecision = {
    difficulty: clampDifficulty(preferences.difficulty_target),
    depth: hasDeclaredDepth
      ? clampExplanationDepth(preferences.depth)
      : mapDeclaredStyleToDepth(preferences.explanation_style),
  };

  return {
    pedagogicalDecision,
    materialization: materializeDeliveryPlan({
      surface: params.surface,
      preferences,
      decision: pedagogicalDecision,
    }),
    coverage: {
      difficultyFromDeclared: typeof preferences.difficulty_target === "string",
      depthFromDeclaredPreference: hasDeclaredDepth,
      depthFromDeclaredStyleFallback:
        !hasDeclaredDepth && typeof preferences.explanation_style === "string",
    },
  };
}
