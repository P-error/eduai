import { Prisma } from "@prisma/client";
import {
  buildDecisionProvenanceV1,
  buildLearnerStateSnapshotV1,
  normalizeToPedagogicalDecisionV1,
  type DecisionProvenanceV1,
  type LearnerStateSnapshotV1,
  type PedagogicalDecisionV1,
} from "@/lib/pedagogical-decision-contract";
import { prisma } from "@/lib/prisma";
import { getActivePredictionRuntimeConfig } from "@/lib/active-policy";
import { DURATION_HISTORY_WINDOW_ATTEMPTS } from "@/lib/prediction-duration";
import {
  BASELINE_DELIVERY,
  PEDAGOGICAL_DECISION_SCHEMA_VERSION,
  buildPersonalizationPlan,
  createBaselineMaterialization,
  type ExplanationDepth,
  type PersonalizationPlan,
} from "@/lib/personalization-runtime";
import { type DifficultyTarget } from "@/lib/prediction-baselines";

export type RecommendationPreset = {
  subjectId: string;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  decisionContext: PersonalizationPlan["decisionContext"];
  pedagogicalDecision: {
    difficulty: DifficultyTarget;
    depth: ExplanationDepth;
  };
  decisionTrace: PersonalizationPlan["decisionTrace"];
  renderingDecision: PersonalizationPlan["materialization"]["renderingDecision"];
  rulesLayer: {
    id: PersonalizationPlan["materialization"]["rulesLayerId"];
    basis: string;
  };
  uxPreset: PersonalizationPlan["materialization"]["uxPreset"];
  pedagogyPreset: PersonalizationPlan["materialization"]["pedagogyPreset"];
  delivery: PersonalizationPlan["materialization"]["delivery"];
  decisionBoundary: {
    learnerStateSnapshot: LearnerStateSnapshotV1;
    pedagogicalDecision: PedagogicalDecisionV1;
    provenance: DecisionProvenanceV1;
  };
  meta?: {
    exploration: boolean;
    epsilon: number;
    randomAxes: string[];
    backendKind: PersonalizationPlan["runtime"]["backendKind"];
    backendId: PersonalizationPlan["runtime"]["backendId"];
    backendStatus: PersonalizationPlan["runtime"]["backendStatus"];
    runtimePolicyId: PersonalizationPlan["runtime"]["policyId"];
    schemaVersion: PersonalizationPlan["schemaVersion"];
  };
};

export type RecommendationResult = {
  ok: boolean;
  preset: RecommendationPreset;
  rationale: string;
  dataStatus: "INSUFFICIENT" | "OK";
};

export type ChatPersonalizationPreset = {
  runtime: PersonalizationPlan["runtime"];
  decisionContext: PersonalizationPlan["decisionContext"];
  pedagogicalDecision: PersonalizationPlan["pedagogicalDecision"];
  decisionBoundary: RecommendationPreset["decisionBoundary"];
  decisionTrace: PersonalizationPlan["decisionTrace"];
  renderingDecision: PersonalizationPlan["materialization"]["renderingDecision"];
  rulesLayer: {
    id: PersonalizationPlan["materialization"]["rulesLayerId"];
    basis: string;
  };
  uxPreset: PersonalizationPlan["materialization"]["uxPreset"];
  pedagogyPreset: PersonalizationPlan["materialization"]["pedagogyPreset"];
  delivery: PersonalizationPlan["materialization"]["delivery"];
};

export type RecommendationOverrides = {
  sectionId?: string | null;
  topic?: string | null;
  questionCount?: number | null;
  mode?: "quiz" | "exam" | "practice";
};

export const V2_BASELINE_UX_PRESET = {
  tone: BASELINE_DELIVERY.tone,
  explanation_style: BASELINE_DELIVERY.explanation_style,
  response_format: BASELINE_DELIVERY.response_format,
} as const;

export const V2_BASELINE_PEDAGOGY_PRESET = {
  difficulty_target: BASELINE_DELIVERY.difficulty_target,
  depth: BASELINE_DELIVERY.depth,
} as const;

const PREDICTION_HISTORY_SCAN_LIMIT = 200;

function buildFallbackRecommendation(params: {
  subjectId: string;
  sectionId?: string | null;
  topic?: string | null;
  questionCount?: number | null;
  mode?: "quiz" | "exam" | "practice";
}): RecommendationPreset {
  const materialization = createBaselineMaterialization("test");
  const learnerStateSnapshot = buildLearnerStateSnapshotV1({
    recentPerformance: {
      recentAccuracy: null,
      totalQuestionsBefore: 0,
      timeSinceLastAttemptSec: null,
    },
    topicContext: {
      subjectId: params.subjectId,
      sectionId: params.sectionId ?? null,
      topic: params.topic ?? null,
      context: params.topic ?? null,
      taskType: params.mode ?? "practice",
    },
    notes:
      "Fallback recommendation boundary does not carry declared preferences or accessibility inputs.",
  });
  const provenance = buildDecisionProvenanceV1({
    backendKind: "heuristic",
    policyName: "baseline_recommendation_fallback",
    policyVersion: "decision_boundary_bridge_v1_2026_04",
    sourceModule: "@/lib/recommendation.ts",
    fallbackUsed: false,
    notes: "No runtime recommendation was available; baseline bridge preset applied.",
  });
  const pedagogicalDecisionV1 = normalizeToPedagogicalDecisionV1({
    difficulty: materialization.delivery.difficulty_target,
    depth: materialization.delivery.depth,
    instructionalMode: params.mode ?? "practice",
    hintPolicy: "not_explicitly_controlled",
    decisionSource: "baseline_bridge",
    policyName: provenance.policy_name,
    policyVersion: provenance.policy_version,
    decisionConfidence: 0,
    materialization: {
      surface: "test",
      responseFormat: materialization.delivery.response_format,
      tone: materialization.delivery.tone,
      explanationStyle: materialization.delivery.explanation_style,
      presentationMode: materialization.renderingDecision.presentationMode,
      formattingHint: materialization.renderingDecision.formattingHint,
    },
  });
  return {
    subjectId: params.subjectId,
    sectionId: params.sectionId ?? null,
    topic: params.topic ?? "",
    questionCount: params.questionCount ?? 5,
    mode: params.mode ?? "practice",
    decisionContext: {
      subjectId: params.subjectId,
      subjectTitle: null,
      sectionId: params.sectionId ?? null,
      topic: params.topic ?? null,
      educationLevel: null,
      domain: null,
      context: params.topic ?? null,
      taskType: params.mode ?? "practice",
      questionCount: params.questionCount ?? 5,
      historicalSignals: {
        recentAccuracy: null,
        totalQuestionsBefore: 0,
        timeSinceLastAttemptSec: null,
      },
    },
    pedagogicalDecision: {
      difficulty: V2_BASELINE_PEDAGOGY_PRESET.difficulty_target,
      depth: V2_BASELINE_PEDAGOGY_PRESET.depth,
    },
    decisionTrace: {
      difficulty: {
        value: V2_BASELINE_PEDAGOGY_PRESET.difficulty_target,
        confidence: 0,
        sourceType: "heuristic",
        basis: "baseline_recommendation_fallback",
      },
      depth: {
        value: V2_BASELINE_PEDAGOGY_PRESET.depth,
        confidence: 0,
        sourceType: "heuristic",
        basis: "baseline_recommendation_fallback",
      },
    },
    renderingDecision: materialization.renderingDecision,
    rulesLayer: {
      id: materialization.rulesLayerId,
      basis: materialization.basis,
    },
    uxPreset: materialization.uxPreset,
    pedagogyPreset: materialization.pedagogyPreset,
    delivery: materialization.delivery,
    decisionBoundary: {
      learnerStateSnapshot,
      pedagogicalDecision: pedagogicalDecisionV1,
      provenance,
    },
    meta: {
      exploration: false,
      epsilon: 0,
      randomAxes: [],
      backendKind: "heuristic_baseline",
      backendId: "fallback_baseline_no_runtime",
      backendStatus: "ready",
      runtimePolicyId: "prediction_runtime_v1_2026_03",
      schemaVersion: PEDAGOGICAL_DECISION_SCHEMA_VERSION,
    },
  };
}

function buildRecommendationPreset(params: {
  subjectId: string;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  plan: PersonalizationPlan;
}): RecommendationPreset {
  return {
    subjectId: params.subjectId,
    sectionId: params.sectionId,
    topic: params.topic,
    questionCount: params.questionCount,
    mode: params.mode,
    decisionContext: params.plan.decisionContext,
    pedagogicalDecision: params.plan.pedagogicalDecision,
    decisionTrace: params.plan.decisionTrace,
    renderingDecision: params.plan.materialization.renderingDecision,
    rulesLayer: {
      id: params.plan.materialization.rulesLayerId,
      basis: params.plan.materialization.basis,
    },
    uxPreset: params.plan.materialization.uxPreset,
    pedagogyPreset: params.plan.materialization.pedagogyPreset,
    delivery: params.plan.materialization.delivery,
    decisionBoundary: {
      learnerStateSnapshot: params.plan.learnerStateSnapshot,
      pedagogicalDecision: params.plan.pedagogicalDecisionV1,
      provenance: params.plan.decisionProvenance,
    },
    meta: {
      exploration: false,
      epsilon: 0,
      randomAxes: [],
      backendKind: params.plan.runtime.backendKind,
      backendId: params.plan.runtime.backendId,
      backendStatus: params.plan.runtime.backendStatus,
      runtimePolicyId: params.plan.runtime.policyId,
      schemaVersion: params.plan.schemaVersion,
    },
  };
}

export async function getSubjectRecommendation(
  userId: string,
  subjectId: string,
  overrides: RecommendationOverrides = {},
): Promise<RecommendationResult> {
  const [subject, user, snapshot, subjectAttempts, historyAttempts, durationAttempts] =
    await Promise.all([
      prisma.subject.findFirst({
        where: { id: subjectId, userId },
        select: {
          id: true,
          title: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
      select: {
          declaredPreferencesJson: true,
          effectivePreferencesJson: true,
        },
      }),
      getActivePredictionRuntimeConfig(),
      prisma.testAttempt.count({
        where: { userId, test: { subjectId } },
      }),
      prisma.testAttempt.findMany({
        where: { userId },
        select: {
          score: true,
          byTagJson: true,
          createdAt: true,
          test: {
            select: {
              subjectId: true,
              questionCount: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: PREDICTION_HISTORY_SCAN_LIMIT,
      }),
      prisma.testAttempt.findMany({
        where: {
          userId,
          perQuestionFirstAnswerMsJson: { not: Prisma.DbNull },
        },
        select: {
          createdAt: true,
          perQuestionFirstAnswerMsJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: DURATION_HISTORY_WINDOW_ATTEMPTS,
      }),
    ]);

  if (!subject || !user) {
    return {
      ok: false,
      preset: buildFallbackRecommendation({
        subjectId,
        sectionId: overrides.sectionId,
        topic: overrides.topic,
        questionCount: overrides.questionCount,
        mode: overrides.mode,
      }),
      rationale: "Subject not found.",
      dataStatus: "INSUFFICIENT",
    };
  }

  const dataStatus = subjectAttempts > 0 ? "OK" : "INSUFFICIENT";
  const questionCount = Math.max(
    1,
    Math.floor(overrides.questionCount ?? (dataStatus === "OK" ? 8 : 5)),
  );
  const mode = overrides.mode ?? "practice";
  const topic = overrides.topic ?? subject.title;
  const plan = buildPersonalizationPlan({
    snapshot,
    historyAttempts,
    durationAttempts,
    declaredPreferences:
      (user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
    effectivePreferences:
      (user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
    surface: "test",
    mode,
    subjectId: subject.id,
    subjectTitle: subject.title,
    sectionId: overrides.sectionId ?? null,
    topic,
    questionCount,
  });

  const preset = buildRecommendationPreset({
    subjectId: subject.id,
    sectionId: overrides.sectionId ?? null,
    topic,
    questionCount,
    mode,
    plan,
  });

  const rationale =
    dataStatus === "INSUFFICIENT"
      ? `Sparse history; using conservative pedagogical defaults with explicit rules-layer materialization (difficulty=${preset.pedagogicalDecision.difficulty}, depth=${preset.pedagogicalDecision.depth}).`
      : `Runtime selected pedagogical decisions difficulty=${preset.pedagogicalDecision.difficulty}, depth=${preset.pedagogicalDecision.depth}; rules-layer materialized tone=${preset.uxPreset.tone}, explanation_style=${preset.uxPreset.explanation_style}.`;

  return { ok: true, preset, rationale, dataStatus };
}

export async function getUserPresetForChat(
  userId: string,
): Promise<ChatPersonalizationPreset> {
  const [user, snapshot, historyAttempts, durationAttempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        declaredPreferencesJson: true,
        effectivePreferencesJson: true,
      },
    }),
    getActivePredictionRuntimeConfig(),
    prisma.testAttempt.findMany({
      where: { userId },
      select: {
        score: true,
        byTagJson: true,
        createdAt: true,
        test: {
          select: {
            subjectId: true,
            questionCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: PREDICTION_HISTORY_SCAN_LIMIT,
    }),
    prisma.testAttempt.findMany({
      where: {
        userId,
        perQuestionFirstAnswerMsJson: { not: Prisma.DbNull },
      },
      select: {
        createdAt: true,
        perQuestionFirstAnswerMsJson: true,
      },
      orderBy: { createdAt: "desc" },
      take: DURATION_HISTORY_WINDOW_ATTEMPTS,
    }),
  ]);

  const plan = buildPersonalizationPlan({
    snapshot,
    historyAttempts,
    durationAttempts,
    declaredPreferences:
      (user?.declaredPreferencesJson ?? {}) as Record<string, unknown>,
    effectivePreferences:
      (user?.effectivePreferencesJson ?? {}) as Record<string, unknown>,
    surface: "chat",
    mode: "chat",
    questionCount: 1,
  });

  return {
    runtime: plan.runtime,
    decisionContext: plan.decisionContext,
    pedagogicalDecision: plan.pedagogicalDecision,
    decisionBoundary: {
      learnerStateSnapshot: plan.learnerStateSnapshot,
      pedagogicalDecision: plan.pedagogicalDecisionV1,
      provenance: plan.decisionProvenance,
    },
    decisionTrace: plan.decisionTrace,
    renderingDecision: plan.materialization.renderingDecision,
    rulesLayer: {
      id: plan.materialization.rulesLayerId,
      basis: plan.materialization.basis,
    },
    uxPreset: plan.materialization.uxPreset,
    pedagogyPreset: plan.materialization.pedagogyPreset,
    delivery: plan.materialization.delivery,
  };
}
