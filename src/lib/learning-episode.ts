import { Prisma } from "@prisma/client";
import {
  getChatMessageDisplayContent,
  LEARNING_DIALOGUE_MAX_LEARNER_TURNS,
} from "@/lib/chat";
import { sanitizeQuestionsForClient } from "@/lib/test-payload";
import { prisma } from "@/lib/prisma";
import { sanitizePreferenceMap } from "@/lib/tags";
import {
  buildEvaluationAssignment,
  buildEvaluationEpisodeSummary,
  resolveEvaluationPolicySelection,
  resolveOrCreateEvaluationEpisode,
  STRUCTURED_EVALUATION_PROTOCOL_KEY,
  type EvaluationHoldoutStrategy,
  type EvaluationPolicyArmInput,
  type EvaluationRequestInput,
  type EvaluationSequenceRole,
} from "@/lib/evaluation";
import { getSubjectRecommendation } from "@/lib/recommendation";
import {
  buildDecisionProvenanceV1,
  buildDeliveredPedagogicalDecisionV1,
  buildLearnerStateSnapshotV1,
  normalizeToPedagogicalDecisionV1,
  type DeliveredPedagogicalDecisionV1,
} from "@/lib/pedagogical-decision-contract";
import {
  createBaselineMaterialization,
  createDeclaredPreferenceMaterialization,
  materializeDeliveryPlan,
  type MaterializedDeliveryPlan,
  type PedagogicalDecision,
} from "@/lib/personalization-runtime";
import {
  generateLearningContentForEpisode,
  type GenerateLearningContentPlan,
} from "@/lib/learning-content-generation";
import {
  buildMlPersonalizationView,
  type MlPersonalizationView,
} from "@/lib/ml-personalization-view";
import {
  buildSixFactorDerivedPedagogicalDecision,
  resolvePrimarySixFactorDecision,
  shouldUseSixFactorAsPrimaryDecision,
} from "@/lib/ml-six-factor-primary-decision";
import {
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  type SixFactorDecisionMetadataV1,
} from "@/lib/ml-six-factor-shadow";
import {
  generateTestForUser,
  type GenerateTestPlan,
  type GenerateTestPayload,
  type GenerateTestUser,
} from "@/lib/test-generation";
import {
  isTrainingDatasetPhase,
  type TrainingDatasetCollectionMeta,
} from "@/lib/training-dataset-contract";

export const EPISODE_ORCHESTRATION_SCHEMA_VERSION =
  "learning_episode_mvp_v1_2026_03" as const;

type EpisodeSurfaceContract = {
  delivery: {
    tone: string;
    explanation_style: string;
    response_format: "mcq";
    difficulty_target: string;
    depth: string;
  };
  renderingDecision: MaterializedDeliveryPlan["renderingDecision"];
  rulesLayer: {
    id: string;
    basis: string;
  };
};

type EpisodeOrchestrationPackage = {
  schemaVersion: typeof EPISODE_ORCHESTRATION_SCHEMA_VERSION;
  personalizationMode: "on" | "off";
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  familyKey: string;
  conceptKey: string | null;
  skillKey: string | null;
  holdoutStrategy: EvaluationHoldoutStrategy;
  delayedRecheckMinutes: number | null;
  policy: {
    selectionMode: string;
    arm: string;
    policyMode: string | null;
    policyId: string | null;
    assignment: ReturnType<typeof buildEvaluationAssignment>;
  };
  pedagogicalDecision: PedagogicalDecision;
  decisionContext: unknown;
  decisionBackend: {
    runtimePolicyId: string | null;
    backendKind: string;
    backendId: string | null;
    backendStatus: string | null;
    schemaVersion: string | null;
  } | null;
  recommendationSnapshot: unknown;
  policyMeta: Record<string, unknown>;
  sixFactorDecision: EduAIAppSixFactorDecisionV1 | null;
  sixFactorDecisionMetadata: SixFactorDecisionMetadataV1 | null;
  decisionBoundary: DeliveredPedagogicalDecisionV1;
  surfaces: {
    test: EpisodeSurfaceContract;
    learningContent: EpisodeSurfaceContract;
  };
};

export type CreateLearningEpisodeInput = {
  subjectId: string;
  sectionId?: string | null;
  topic: string;
  clientKey?: string;
  questionCount?: number;
  mode?: "quiz" | "exam" | "practice";
  personalizationMode?: "on" | "off";
  assignmentArm?: EvaluationPolicyArmInput;
  conceptKey?: string | null;
  skillKey?: string | null;
  familyKey?: string | null;
  includeHoldout?: boolean;
  holdoutStrategy?: EvaluationHoldoutStrategy;
  delayedRecheckMinutes?: number | null;
  expectedSequenceRoles?: EvaluationSequenceRole[];
} & TrainingDatasetCollectionMeta;

export type MaterializedEpisodeStep =
  | {
      status:
        | "ready"
        | "awaiting_test_submission"
        | "acknowledge_learning_content";
      sequenceRole: EvaluationSequenceRole;
      contentKind: "generated_test";
      contentId: string;
      itemId: string | null;
      test: {
        id: string;
        title: string;
        questions: Array<{
          prompt: string;
          options: string[];
          explanation?: string;
        }>;
      };
      learningContent: null;
      dueAtIso: null;
    }
  | {
      status: "ready" | "acknowledge_learning_content";
      sequenceRole: EvaluationSequenceRole;
      contentKind: "chat_session";
      contentId: string;
      itemId: string | null;
      test: null;
      learningContent: {
        sessionId: string;
        title: string;
        summary: string;
        sections: Array<{
          heading: string;
          body: string;
        }>;
        reflectionPrompt: string;
        renderedContent: string;
        generationSource: "llm" | "llm_repaired" | "fallback";
        dialogueThread: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          createdAtIso: string;
          mlPersonalization?: MlPersonalizationView | null;
        }>;
        dialogueBudget: {
          maxLearnerTurns: number;
          learnerTurnsUsed: number;
          learnerTurnsRemaining: number;
          reachedLimit: boolean;
        };
        pedagogicalContext: {
          difficulty: string | null;
          depth: string | null;
          supportLevel: string | null;
          presentationFormat: string | null;
          examplesLevel: string | null;
          terminologyLevel: string | null;
          tone: string | null;
          explanationStyle: string | null;
          policyMode: string | null;
          policyId: string | null;
          personalizationMode: "on" | "off";
        };
        mlPersonalization: MlPersonalizationView | null;
      };
      dueAtIso: null;
    }
  | {
      status: "waiting_delay";
      sequenceRole: "delayed_recheck";
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: string;
    }
  | {
      status: "pending_materialization";
      sequenceRole: EvaluationSequenceRole;
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: null;
    }
  | {
      status: "completed";
      sequenceRole: null;
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: null;
    };

export type LearningEpisodeState = {
  episode: Awaited<ReturnType<typeof buildEvaluationEpisodeSummary>>;
  currentStep: MaterializedEpisodeStep;
};

type EpisodeRecord = {
  id: string;
  status: string;
  protocolKey: string;
  topic: string | null;
  subjectId: string | null;
  sectionId: string | null;
  datasetPhase: TrainingDatasetCollectionMeta["datasetPhase"];
  datasetOrigin: TrainingDatasetCollectionMeta["datasetOrigin"];
  conceptKey: string | null;
  skillKey: string | null;
  assignmentJson: Prisma.JsonValue;
  designJson: Prisma.JsonValue;
  createdAt: Date;
  subject: {
    id: string;
    title: string;
  } | null;
  items: Array<{
    id: string;
    contentKind: string;
    contentId: string;
    sequenceRole: string;
    linkedContentId: string | null;
    delayedMinutes: number | null;
    outcomeRecordedAt: Date | null;
    outcomeJson: Prisma.JsonValue | null;
    deliveredAt: Date;
  }>;
};

function asObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function uniqueOrdered<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function normalizeSequenceRoles(
  input: EvaluationSequenceRole[] | null | undefined,
): EvaluationSequenceRole[] {
  const allowed: EvaluationSequenceRole[] = [
    "precheck",
    "learning_content",
    "postcheck",
    "holdout",
    "delayed_recheck",
  ];
  const filtered = (input ?? []).filter((role): role is EvaluationSequenceRole =>
    allowed.includes(role),
  );
  return filtered.length > 0 ? uniqueOrdered(filtered) : [];
}

function resolveSequenceRoles(input: CreateLearningEpisodeInput) {
  const explicit = normalizeSequenceRoles(input.expectedSequenceRoles);
  if (explicit.length > 0) {
    return explicit;
  }

  const roles: EvaluationSequenceRole[] = [
    "precheck",
    "learning_content",
    "postcheck",
  ];
  if (input.includeHoldout) {
    roles.push("holdout");
  }
  if (
    typeof input.delayedRecheckMinutes === "number" &&
    Number.isFinite(input.delayedRecheckMinutes) &&
    input.delayedRecheckMinutes > 0
  ) {
    roles.push("delayed_recheck");
  }
  return roles;
}

function resolveHoldoutStrategy(input: CreateLearningEpisodeInput) {
  if (input.holdoutStrategy) {
    return input.holdoutStrategy;
  }
  if (input.includeHoldout) {
    return "holdout_unseen" satisfies EvaluationHoldoutStrategy;
  }
  return "none" satisfies EvaluationHoldoutStrategy;
}

function sanitizeFamilyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function deriveFamilyKey(params: {
  episodeId: string;
  requestedFamilyKey?: string | null;
  skillKey?: string | null;
  conceptKey?: string | null;
}) {
  const preferred =
    params.requestedFamilyKey ?? params.skillKey ?? params.conceptKey ?? null;
  const normalized =
    typeof preferred === "string" && preferred.trim().length > 0
      ? sanitizeFamilyKey(preferred)
      : "";
  return normalized.length > 0
    ? `episode_${params.episodeId}_${normalized}`
    : `episode_${params.episodeId}_core`;
}

async function resolveSubjectForEpisode(userId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      userId,
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!subject) {
    throw new Error("EPISODE_SUBJECT_NOT_FOUND");
  }

  return subject;
}

async function resolveSectionSnapshot(
  subjectId: string,
  sectionId: string | null | undefined,
) {
  if (!sectionId) {
    return {
      sectionId: null,
      sectionSnapshot: null,
    };
  }

  const section = await prisma.subjectSection.findFirst({
    where: { id: sectionId, subjectId },
  });
  if (!section) {
    throw new Error("EPISODE_SECTION_NOT_FOUND");
  }

  const path: string[] = [];
  let current: typeof section | null = section;
  let guard = 0;
  while (current && guard < 10) {
    path.unshift(current.title);
    if (!current.parentId) break;
    current = await prisma.subjectSection.findFirst({
      where: { id: current.parentId, subjectId },
    });
    guard += 1;
  }

  const description = section.description
    ? `Description: ${section.description}`
    : "Description: none";

  return {
    sectionId: section.id,
    sectionSnapshot: `Section path: ${path.join(" → ")}. ${description}`,
  };
}

function buildSurfaceContract(plan: MaterializedDeliveryPlan): EpisodeSurfaceContract {
  return {
    delivery: {
      tone: plan.delivery.tone,
      explanation_style: plan.delivery.explanation_style,
      response_format: plan.delivery.response_format,
      difficulty_target: plan.delivery.difficulty_target,
      depth: plan.delivery.depth,
    },
    renderingDecision: plan.renderingDecision,
    rulesLayer: {
      id: plan.rulesLayerId,
      basis: plan.basis,
    },
  };
}

function isEpisodeMaterializationConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) || (
    error instanceof Error &&
    error.message === "EVALUATION_EPISODE_SEQUENCE_ROLE_CONFLICT"
  );
}

function resolveBridgeDecisionSource(params: {
  usedRecommendation: boolean;
  selectionMode: string;
}) {
  if (params.usedRecommendation) {
    return "predicted_runtime_bridge" as const;
  }
  if (params.selectionMode === "self_report_declared") {
    return "declared_preference_bridge" as const;
  }
  if (params.selectionMode === "manual_override") {
    return "manual_override_bridge" as const;
  }
  return "baseline_bridge" as const;
}

function decisionBackendKindForSixFactor(
  decision: EduAIAppSixFactorDecisionV1,
) {
  return decision.decisionSource === "ml_policy" ? "artifact" : "heuristic";
}

function buildSixFactorMaterialization(params: {
  surface: "test" | "chat";
  decision: EduAIAppSixFactorDecisionV1;
}) {
  const pedagogicalDecision = buildSixFactorDerivedPedagogicalDecision(
    params.decision,
  );
  const materialization = materializeDeliveryPlan({
    surface: params.surface,
    preferences: {
      tone: "formal",
      explanation_style:
        params.decision.presentationFormat === "qa"
          ? "exploratory"
          : params.decision.depth === "brief" &&
              params.decision.supportLevel === "minimal"
            ? "concise"
            : "stepwise",
      response_format: "mcq",
    },
    decision: pedagogicalDecision,
  });

  return {
    delivery: materialization.delivery,
    renderingDecision: materialization.renderingDecision,
    rulesLayer: {
      id: materialization.rulesLayerId,
      basis: `${materialization.basis}|decision=six_factor_primary`,
    },
    pedagogicalDecision,
  };
}

async function resolveEpisodeOrchestrationPackage(params: {
  user: GenerateTestUser;
  input: CreateLearningEpisodeInput;
  subject: {
    id: string;
    title: string;
  };
  sectionId: string | null;
}) {
  const personalizationMode = params.input.personalizationMode ?? "on";
  const declaredPreferences = sanitizePreferenceMap(
    (params.user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
  );
  const baselineTest = createBaselineMaterialization("test");
  const questionCount = params.input.questionCount ?? 3;
  const mode = params.input.mode ?? "practice";

  const policySelection = resolveEvaluationPolicySelection({
    surface: "test",
    requestedArm: params.input.assignmentArm ?? null,
    personalizationMode,
    manualOverrideActive: false,
  });
  const selfReportTest = createDeclaredPreferenceMaterialization({
    surface: "test",
    declaredPreferences,
  });
  const shouldFetchPredictedRecommendation =
    policySelection.selectionMode === "predicted_runtime" ||
    (policySelection.selectionMode === "manual_override" &&
      personalizationMode === "on") ||
    (policySelection.selectionMode === "observational_only" &&
      personalizationMode === "on");
  const shouldUseSixFactorPrimary = shouldUseSixFactorAsPrimaryDecision({
    personalizationMode,
    selectionMode: policySelection.selectionMode,
  });
  const sixFactorPrimary = shouldUseSixFactorPrimary
    ? await resolvePrimarySixFactorDecision({
        prisma,
        userId: params.user.id,
        subjectId: params.subject.id,
        topicRef: params.input.conceptKey ?? params.input.skillKey ?? null,
        conceptKey: params.input.conceptKey ?? null,
        skillKey: params.input.skillKey ?? null,
        familyKey: params.input.familyKey ?? null,
        topic: params.input.topic,
        previousDifficulty: selfReportTest.pedagogicalDecision.difficulty,
        previousDepth: selfReportTest.pedagogicalDecision.depth,
        declaredPreferences,
        policyId: policySelection.policyId,
        backendKind: "six_factor_policy",
      })
    : null;
  const recommendation = shouldFetchPredictedRecommendation && !sixFactorPrimary
    ? await getSubjectRecommendation(params.user.id, params.subject.id, {
        sectionId: params.sectionId,
        topic: params.input.topic,
        questionCount,
        mode,
      })
    : null;
  const sixFactorTestMaterialization = sixFactorPrimary
    ? buildSixFactorMaterialization({
        surface: "test",
        decision: sixFactorPrimary.shadow.decision,
      })
    : null;

  const baseTestMaterialization =
    sixFactorTestMaterialization ??
    (recommendation?.ok === true
      ? {
          delivery: recommendation.preset.delivery,
          renderingDecision: recommendation.preset.renderingDecision,
          rulesLayer: recommendation.preset.rulesLayer,
          pedagogicalDecision: recommendation.preset.pedagogicalDecision,
        }
      : policySelection.selectionMode === "self_report_declared"
        ? {
            delivery: selfReportTest.materialization.delivery,
            renderingDecision: selfReportTest.materialization.renderingDecision,
            rulesLayer: {
              id: selfReportTest.materialization.rulesLayerId,
              basis: selfReportTest.materialization.basis,
            },
            pedagogicalDecision: selfReportTest.pedagogicalDecision,
          }
        : {
            delivery: baselineTest.delivery,
            renderingDecision: baselineTest.renderingDecision,
            rulesLayer: {
              id: baselineTest.rulesLayerId,
              basis: baselineTest.basis,
            },
            pedagogicalDecision: {
              difficulty: baselineTest.delivery.difficulty_target,
              depth: baselineTest.delivery.depth,
            } satisfies PedagogicalDecision,
          });

  const pedagogicalDecision: PedagogicalDecision = {
    difficulty: baseTestMaterialization.pedagogicalDecision.difficulty,
    depth: baseTestMaterialization.pedagogicalDecision.depth,
  };
  const contentSurfaceMaterialization = materializeDeliveryPlan({
    surface: "chat",
    preferences: {
      tone: baseTestMaterialization.delivery.tone,
      explanation_style: baseTestMaterialization.delivery.explanation_style,
      response_format: baseTestMaterialization.delivery.response_format,
    },
    decision: pedagogicalDecision,
  });
  const assignment = buildEvaluationAssignment({
    selection: policySelection,
    runtimePolicyId: sixFactorPrimary
      ? sixFactorPrimary.shadow.decision.policyId
      : recommendation?.ok
        ? recommendation.preset.meta?.runtimePolicyId ?? null
        : null,
    backendKind: sixFactorPrimary
      ? sixFactorPrimary.shadow.decision.backendKind
      : recommendation?.ok
        ? recommendation.preset.meta?.backendKind ?? null
        : null,
    backendId: sixFactorPrimary
      ? sixFactorPrimary.shadow.decision.artifactPath ??
        sixFactorPrimary.shadow.decision.modelVersion
      : recommendation?.ok
        ? recommendation.preset.meta?.backendId ?? null
        : null,
  });
  const policyMeta = {
    personalizationMode:
      policySelection.personalizationMode ?? personalizationMode,
    usedRecommendation: recommendation?.ok === true,
    usedBaseline:
      sixFactorPrimary == null &&
      recommendation?.ok !== true &&
      policySelection.selectionMode !== "self_report_declared",
    usedDeclaredPreferences: policySelection.selectionMode === "self_report_declared",
    usedManualDelivery: false,
    assignedArm: policySelection.arm,
    selectionMode: policySelection.selectionMode,
    declaredCoverage: selfReportTest.coverage,
    usedSixFactorPrimary: sixFactorPrimary != null,
    sixFactorDecisionSource:
      sixFactorPrimary?.shadow.decision.decisionSource ?? null,
    sixFactorFallbackUsed:
      sixFactorPrimary?.shadow.decision.fallbackUsed ?? null,
    pedagogicalDecisionRole: sixFactorPrimary
      ? "derived_two_factor_compatibility_projection"
      : "legacy_two_factor_decision",
  } satisfies Record<string, unknown>;
  const bridgeDecisionSource = resolveBridgeDecisionSource({
    usedRecommendation: recommendation?.ok === true,
    selectionMode: policySelection.selectionMode,
  });
  const learnerStateSnapshot =
    sixFactorPrimary
      ? buildLearnerStateSnapshotV1({
          declaredPreferences,
          recentPerformance: {
            recentAccuracy: sixFactorPrimary.shadow.features.recentCorrectRate,
            totalQuestionsBefore:
              sixFactorPrimary.shadow.features.priorAttemptsCount,
            timeSinceLastAttemptSec:
              sixFactorPrimary.shadow.features.minutesSinceLastActivity == null
                ? null
                : Math.round(
                    sixFactorPrimary.shadow.features.minutesSinceLastActivity *
                      60,
                  ),
          },
          topicContext: {
            subjectId: params.subject.id,
            subjectTitle: params.subject.title,
            sectionId: params.sectionId,
            topic: params.input.topic,
            context: params.input.topic,
            taskType: mode,
          },
          notes:
            "Six-factor primary decision used pre-decision learner-state aggregates.",
        })
      : recommendation?.ok === true
      ? recommendation.preset.decisionBoundary.learnerStateSnapshot
      : buildLearnerStateSnapshotV1({
          declaredPreferences,
          recentPerformance: {
            recentAccuracy: null,
            totalQuestionsBefore: null,
            timeSinceLastAttemptSec: null,
          },
          topicContext: {
            subjectId: params.subject.id,
            subjectTitle: params.subject.title,
            sectionId: params.sectionId,
            topic: params.input.topic,
            context: params.input.topic,
            taskType: mode,
          },
          notes:
            "Episode orchestration did not fetch runtime performance features for this bridge path.",
        });
  const recommendationFallbackUsed =
    shouldFetchPredictedRecommendation && recommendation?.ok !== true;
  const decisionProvenance =
    sixFactorPrimary
      ? buildDecisionProvenanceV1({
          backendKind: decisionBackendKindForSixFactor(
            sixFactorPrimary.shadow.decision,
          ),
          policyName:
            sixFactorPrimary.shadow.decision.policyId ??
            "six_factor_runtime_ml_policy_v1",
          policyVersion:
            sixFactorPrimary.shadow.decision.modelVersion ??
            "eduai_app_six_factor_decision_v1_2026_05",
          sourceModule: "@/lib/ml-six-factor-policy-adapter.ts",
          fallbackUsed: sixFactorPrimary.shadow.decision.fallbackUsed,
          artifactId:
            sixFactorPrimary.shadow.decision.artifactPath ??
            sixFactorPrimary.shadow.decision.modelVersion,
          notes:
            sixFactorPrimary.shadow.decision.decisionSource === "ml_policy"
              ? "Primary episode pedagogical decision came from six-factor candidate scoring."
              : "Primary episode decision used explicit six-factor fallback; it is not ML evidence.",
        })
      : recommendation?.ok === true
      ? recommendation.preset.decisionBoundary.provenance
      : buildDecisionProvenanceV1({
          backendKind:
            policySelection.selectionMode === "self_report_declared"
              ? selfReportTest.coverage.depthFromDeclaredStyleFallback
                ? "heuristic"
                : "unknown"
              : "heuristic",
          policyName:
            policySelection.selectionMode === "self_report_declared"
              ? "declared_preferences_bridge"
              : "learning_episode_baseline_bridge",
          policyVersion: "decision_boundary_bridge_v1_2026_04",
          sourceModule: "@/lib/learning-episode.ts",
          fallbackUsed:
            recommendationFallbackUsed
              ? true
              : policySelection.selectionMode === "self_report_declared"
                ? selfReportTest.coverage.depthFromDeclaredStyleFallback
                : false,
          notes:
            policySelection.selectionMode === "self_report_declared"
              ? selfReportTest.coverage.depthFromDeclaredStyleFallback
                ? "Depth was materialized from declared explanation_style because declared depth was absent."
                : "Decision came from declared learner preferences without runtime prediction."
              : recommendationFallbackUsed
                ? "Predicted recommendation path was requested but the episode fell back to baseline bridge materialization."
                : "Episode used the baseline bridge materialization without switching the active runtime backend.",
        });
  const pedagogicalDecisionV1 =
    sixFactorPrimary
      ? normalizeToPedagogicalDecisionV1({
          difficulty: pedagogicalDecision.difficulty,
          depth: pedagogicalDecision.depth,
          instructionalMode: mode,
          hintPolicy:
            sixFactorPrimary.shadow.decision.supportLevel === "minimal"
              ? "on_request"
              : "guided_scaffolding",
          decisionSource: "six_factor_policy",
          policyName: decisionProvenance.policy_name,
          policyVersion: decisionProvenance.policy_version,
          decisionConfidence: sixFactorPrimary.shadow.decision.confidence ?? 0,
          materialization: {
            surface: "test",
            responseFormat: baseTestMaterialization.delivery.response_format,
            tone: baseTestMaterialization.delivery.tone,
            explanationStyle:
              baseTestMaterialization.delivery.explanation_style,
            presentationMode:
              baseTestMaterialization.renderingDecision.presentationMode,
            formattingHint:
              baseTestMaterialization.renderingDecision.formattingHint,
          },
        })
      : recommendation?.ok === true
      ? recommendation.preset.decisionBoundary.pedagogicalDecision
      : normalizeToPedagogicalDecisionV1({
          difficulty: pedagogicalDecision.difficulty,
          depth: pedagogicalDecision.depth,
          instructionalMode: mode,
          hintPolicy: "not_explicitly_controlled",
          decisionSource: bridgeDecisionSource,
          policyName: decisionProvenance.policy_name,
          policyVersion: decisionProvenance.policy_version,
          decisionConfidence: 0,
          materialization: {
            surface: "test",
            responseFormat: baseTestMaterialization.delivery.response_format,
            tone: baseTestMaterialization.delivery.tone,
            explanationStyle:
              baseTestMaterialization.delivery.explanation_style,
            presentationMode:
              baseTestMaterialization.renderingDecision.presentationMode,
            formattingHint:
              baseTestMaterialization.renderingDecision.formattingHint,
          },
        });
  const decisionBoundary = buildDeliveredPedagogicalDecisionV1({
    learnerStateSnapshot,
    pedagogicalDecision: pedagogicalDecisionV1,
    provenance: decisionProvenance,
    episodeId: null,
    sequenceRole: null,
    touchpointType: null,
    contentId: null,
  });

  return {
    schemaVersion: EPISODE_ORCHESTRATION_SCHEMA_VERSION,
    personalizationMode,
    questionCount,
    mode,
    familyKey: "",
    conceptKey: params.input.conceptKey ?? null,
    skillKey: params.input.skillKey ?? null,
    holdoutStrategy: resolveHoldoutStrategy(params.input),
    delayedRecheckMinutes:
      typeof params.input.delayedRecheckMinutes === "number" &&
      Number.isFinite(params.input.delayedRecheckMinutes) &&
      params.input.delayedRecheckMinutes > 0
        ? Math.floor(params.input.delayedRecheckMinutes)
        : null,
    policy: {
      selectionMode: policySelection.selectionMode,
      arm: policySelection.arm,
      policyMode: assignment.policyMode,
      policyId: assignment.policyId,
      assignment,
    },
    pedagogicalDecision,
    decisionContext: recommendation?.ok ? recommendation.preset.decisionContext : null,
    decisionBackend: sixFactorPrimary
      ? {
          runtimePolicyId:
            sixFactorPrimary.shadow.decision.policyId ??
            "six_factor_runtime_ml_policy_v1",
          backendKind:
            sixFactorPrimary.shadow.decision.backendKind ??
            sixFactorPrimary.shadow.decision.decisionSource,
          backendId:
            sixFactorPrimary.shadow.decision.artifactPath ??
            sixFactorPrimary.shadow.decision.modelVersion,
          backendStatus: sixFactorPrimary.shadow.decision.fallbackUsed
            ? "fallback"
            : "ready",
          schemaVersion: sixFactorPrimary.shadow.decision.modelVersion,
        }
      : recommendation?.ok
      ? {
          runtimePolicyId:
            recommendation.preset.meta?.runtimePolicyId ?? null,
          backendKind:
            recommendation.preset.meta?.backendKind ?? "heuristic_baseline",
          backendId: recommendation.preset.meta?.backendId ?? null,
          backendStatus: recommendation.preset.meta?.backendStatus ?? "ready",
          schemaVersion: recommendation.preset.meta?.schemaVersion ?? null,
        }
        : null,
    recommendationSnapshot:
      recommendation?.ok === true
        ? {
            ok: true,
            preset: recommendation.preset,
            rationale: recommendation.rationale,
            dataStatus: recommendation.dataStatus,
          }
        : null,
    policyMeta,
    sixFactorDecision: sixFactorPrimary?.shadow.decision ?? null,
    sixFactorDecisionMetadata: sixFactorPrimary?.shadow.metadata ?? null,
    decisionBoundary,
    surfaces: {
      test: {
        delivery: {
          tone: baseTestMaterialization.delivery.tone,
          explanation_style: baseTestMaterialization.delivery.explanation_style,
          response_format: baseTestMaterialization.delivery.response_format,
          difficulty_target: baseTestMaterialization.delivery.difficulty_target,
          depth: baseTestMaterialization.delivery.depth,
        },
        renderingDecision: baseTestMaterialization.renderingDecision,
        rulesLayer: baseTestMaterialization.rulesLayer,
      },
      learningContent: buildSurfaceContract(contentSurfaceMaterialization),
    },
  } satisfies EpisodeOrchestrationPackage;
}

function readOrchestrationPackage(
  designJson: Prisma.JsonValue,
): EpisodeOrchestrationPackage | null {
  const root = asObject(designJson);
  const orchestration = asObject(root?.orchestration);
  if (
    !orchestration ||
    orchestration.schemaVersion !== EPISODE_ORCHESTRATION_SCHEMA_VERSION
  ) {
    return null;
  }

  return orchestration as unknown as EpisodeOrchestrationPackage;
}

async function persistOrchestrationPackage(params: {
  episodeId: string;
  designJson: Prisma.JsonValue;
  orchestration: EpisodeOrchestrationPackage;
}) {
  const root = asObject(params.designJson) ?? {};
  await prisma.evaluationEpisode.update({
    where: { id: params.episodeId },
    data: {
      designJson: toJsonValue({
        ...root,
        orchestration: params.orchestration,
      }),
    },
  });
}

async function loadEpisodeRecord(userId: string, episodeId: string): Promise<EpisodeRecord> {
  const episode = await prisma.evaluationEpisode.findFirst({
    where: {
      id: episodeId,
      userId,
    },
    select: {
      id: true,
      status: true,
      protocolKey: true,
      topic: true,
      subjectId: true,
      sectionId: true,
      datasetPhase: true,
      datasetOrigin: true,
      conceptKey: true,
      skillKey: true,
      assignmentJson: true,
      designJson: true,
      createdAt: true,
      subject: {
        select: {
          id: true,
          title: true,
        },
      },
      items: {
        orderBy: { sequenceIndex: "asc" },
        select: {
          id: true,
          contentKind: true,
          contentId: true,
          sequenceRole: true,
          linkedContentId: true,
          delayedMinutes: true,
          outcomeRecordedAt: true,
          outcomeJson: true,
          deliveredAt: true,
        },
      },
    },
  });

  if (!episode) {
    throw new Error("EPISODE_NOT_FOUND");
  }

  const datasetPhase = episode.datasetPhase;
  if (!isTrainingDatasetPhase(datasetPhase)) {
    throw new Error("EPISODE_DATASET_PHASE_INVALID");
  }

  return {
    ...episode,
    datasetPhase,
  };
}

function buildEvaluationRequestForRole(params: {
  episode: EpisodeRecord;
  orchestration: EpisodeOrchestrationPackage;
  sequenceRoles: EvaluationSequenceRole[];
  role: EvaluationSequenceRole;
  lastEvaluationTestId: string | null;
}) {
  const base = {
    episodeId: params.episode.id,
    protocolKey: params.episode.protocolKey,
    assignmentArm: params.orchestration.policy.arm as CreateLearningEpisodeInput["assignmentArm"],
    conceptKey: params.orchestration.conceptKey,
    skillKey: params.orchestration.skillKey,
    familyKey: params.orchestration.familyKey,
    expectedSequenceRoles: params.sequenceRoles,
  } satisfies EvaluationRequestInput;

  if (params.role === "precheck") {
    return {
      ...base,
      touchpointType: "pre_check",
      sequenceRole: "precheck",
      itemRole: "evaluation",
      itemVariant: "unknown",
      linkageKind: "none",
      linkedContentId: null,
      holdoutStrategy: "none",
    } satisfies EvaluationRequestInput;
  }

  if (params.role === "learning_content") {
    return {
      ...base,
      touchpointType: "content_delivery",
      sequenceRole: "learning_content",
      itemRole: "supporting_signal",
      itemVariant: "unknown",
      linkageKind: "none",
      linkedContentId: null,
      holdoutStrategy: "none",
    } satisfies EvaluationRequestInput;
  }

  if (params.role === "postcheck") {
    return {
      ...base,
      touchpointType: "post_check",
      sequenceRole: "postcheck",
      itemRole: "evaluation",
      itemVariant:
        params.orchestration.holdoutStrategy === "isomorphic_same_skill"
          ? "isomorphic_same_skill"
          : "unknown",
      linkageKind:
        params.orchestration.holdoutStrategy === "isomorphic_same_skill"
          ? "isomorphic_family_of"
          : "none",
      linkedContentId: null,
      holdoutStrategy: params.orchestration.holdoutStrategy,
    } satisfies EvaluationRequestInput;
  }

  if (params.role === "holdout") {
    return {
      ...base,
      touchpointType: "holdout",
      sequenceRole: "holdout",
      itemRole: "evaluation",
      itemVariant:
        params.orchestration.holdoutStrategy === "isomorphic_same_skill"
          ? "isomorphic_same_skill"
          : "holdout_unseen",
      linkageKind:
        params.orchestration.holdoutStrategy === "isomorphic_same_skill"
          ? "isomorphic_family_of"
          : "holdout_skill_check",
      linkedContentId: null,
      holdoutStrategy: params.orchestration.holdoutStrategy,
    } satisfies EvaluationRequestInput;
  }

  return {
    ...base,
    touchpointType: "delayed_recheck",
    sequenceRole: "delayed_recheck",
    itemRole: "evaluation",
    itemVariant: "delayed_holdout",
    linkageKind: "delayed_recheck_of",
    linkedContentId: params.lastEvaluationTestId,
    holdoutStrategy: "delayed_holdout",
    delayedMinutes: params.orchestration.delayedRecheckMinutes,
  } satisfies EvaluationRequestInput;
}

async function hydrateTestStep(item: EpisodeRecord["items"][number]) {
  const test = await prisma.generatedTest.findUnique({
    where: { id: item.contentId },
    select: {
      id: true,
      topic: true,
      questionsJson: true,
      validationMetaJson: true,
      subject: {
        select: { title: true },
      },
    },
  });

  if (!test || !Array.isArray(test.questionsJson)) {
    throw new Error("EPISODE_STEP_TEST_NOT_FOUND");
  }

  const validationMeta = asObject(test.validationMetaJson);
  const title =
    typeof validationMeta?.generatedTitle === "string"
      ? validationMeta.generatedTitle
      : `${test.subject.title}: ${test.topic}`;

  return {
    id: test.id,
    title,
    questions: sanitizeQuestionsForClient(
      test.questionsJson as Array<{
        prompt: string;
        options: string[];
        answerIndex: number;
        explanation?: string;
      }>,
    ),
  };
}

async function hydrateLearningContentStep(
  item: EpisodeRecord["items"][number],
): Promise<NonNullable<Extract<MaterializedEpisodeStep, { contentKind: "chat_session" }>["learningContent"]>> {
  const session = await prisma.chatSession.findUnique({
    where: { id: item.contentId },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          signalsJson: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("EPISODE_STEP_CHAT_NOT_FOUND");
  }

  const assistantMessage =
    session.messages.find((message) => {
      const signals = asObject(message.signalsJson);
      return (
        message.role === "assistant" &&
        signals?.deliveryMode === "episode_learning_content"
      );
    }) ??
    session.messages.find((message) => message.role === "assistant") ??
    null;
  const assistantSignals = asObject(assistantMessage?.signalsJson);
  const card = asObject(assistantSignals?.learningContentCard);
  const generationSource =
    assistantSignals?.generationSource === "fallback"
      ? "fallback"
      : assistantSignals?.generationSource === "llm_repaired"
        ? "llm_repaired"
        : "llm";
  const mlPersonalization = buildMlPersonalizationView(assistantSignals);
  const selectedSixFactorConfig = mlPersonalization?.selected_config ?? null;
  const storedPedagogicalDecision = asObject(
    assistantSignals?.pedagogicalDecision,
  );
  const storedDifficulty =
    typeof storedPedagogicalDecision?.difficulty === "string"
      ? storedPedagogicalDecision.difficulty
      : null;
  const storedDepth =
    typeof storedPedagogicalDecision?.depth === "string"
      ? storedPedagogicalDecision.depth
      : null;
  const dialogueThread = session.messages
    .map((message) => {
      const signals = asObject(message.signalsJson);
      if (signals?.deliveryMode !== "episode_learning_dialogue") {
        return null;
      }
      if (message.role !== "user" && message.role !== "assistant") {
        return null;
      }
      const content = getChatMessageDisplayContent(message);
      if (!content) {
        return null;
      }
      return {
        id: message.id,
        role: message.role,
        content,
        createdAtIso: message.createdAt.toISOString(),
        mlPersonalization:
          message.role === "assistant"
            ? buildMlPersonalizationView(signals)
            : null,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAtIso: string;
    mlPersonalization?: MlPersonalizationView | null;
  }>;
  const learnerTurnsUsed = dialogueThread.filter(
    (message) => message.role === "user",
  ).length;
  const learnerTurnsRemaining = Math.max(
    0,
    LEARNING_DIALOGUE_MAX_LEARNER_TURNS - learnerTurnsUsed,
  );

  return {
    sessionId: session.id,
    title:
      typeof card?.title === "string"
        ? card.title
        : "Learning content step",
    summary:
      typeof card?.summary === "string" ? card.summary : assistantMessage?.content ?? "",
    sections: Array.isArray(card?.sections)
      ? (card.sections
          .map((section) => {
            const root = asObject(section);
            if (
              typeof root?.heading !== "string" ||
              typeof root?.body !== "string"
            ) {
              return null;
            }
            return {
              heading: root.heading,
              body: root.body,
            };
          })
          .filter(Boolean) as Array<{ heading: string; body: string }>)
      : [],
    reflectionPrompt:
      typeof card?.reflectionPrompt === "string"
        ? card.reflectionPrompt
        : "What is the key idea of this explanation?",
    renderedContent:
      getChatMessageDisplayContent(assistantMessage ?? { content: "", signalsJson: null }) ??
      "",
    generationSource,
    dialogueThread,
    dialogueBudget: {
      maxLearnerTurns: LEARNING_DIALOGUE_MAX_LEARNER_TURNS,
      learnerTurnsUsed,
      learnerTurnsRemaining,
      reachedLimit: learnerTurnsRemaining === 0,
    },
    pedagogicalContext: {
      difficulty: selectedSixFactorConfig?.difficulty ?? storedDifficulty,
      depth: selectedSixFactorConfig?.depth ?? storedDepth,
      supportLevel: selectedSixFactorConfig?.support_level ?? null,
      presentationFormat: selectedSixFactorConfig?.presentation_format ?? null,
      examplesLevel: selectedSixFactorConfig?.examples_level ?? null,
      terminologyLevel: selectedSixFactorConfig?.terminology_level ?? null,
      tone:
        typeof assistantSignals?.uxPreset === "object" &&
        assistantSignals.uxPreset &&
        typeof (assistantSignals.uxPreset as Record<string, unknown>).tone ===
          "string"
          ? ((assistantSignals.uxPreset as Record<string, unknown>).tone as string)
          : null,
      explanationStyle:
        typeof assistantSignals?.uxPreset === "object" &&
        assistantSignals.uxPreset &&
        typeof (assistantSignals.uxPreset as Record<string, unknown>).explanation_style ===
          "string"
          ? ((assistantSignals.uxPreset as Record<string, unknown>)
              .explanation_style as string)
          : null,
      policyMode:
        typeof assistantSignals?.policyMode === "string"
          ? assistantSignals.policyMode
          : null,
      policyId:
        typeof assistantSignals?.policyId === "string"
          ? assistantSignals.policyId
          : null,
      personalizationMode:
        assistantSignals?.personalizationMode === "off" ? "off" : "on",
    },
    mlPersonalization,
  };
}

function parsePriorTestOutcome(item: EpisodeRecord["items"][number] | null) {
  const outcome = asObject(item?.outcomeJson);
  if (!item || !outcome) {
    return null;
  }

  return {
    contentId: item.contentId,
    accuracy:
      typeof outcome.accuracy === "number" && Number.isFinite(outcome.accuracy)
        ? outcome.accuracy
        : null,
    questionCount:
      typeof outcome.questionCount === "number" &&
      Number.isFinite(outcome.questionCount)
        ? outcome.questionCount
        : null,
    totalDurationMs:
      typeof outcome.totalDurationMs === "number" &&
      Number.isFinite(outcome.totalDurationMs)
        ? outcome.totalDurationMs
        : null,
    submittedAtIso:
      typeof outcome.submittedAtIso === "string" ? outcome.submittedAtIso : null,
  };
}

function buildTestPlanFromOrchestration(
  orchestration: EpisodeOrchestrationPackage,
): GenerateTestPlan {
  return {
    personalizationMode: orchestration.personalizationMode,
    assignment: orchestration.policy.assignment,
    policySelection: {
      arm: orchestration.policy.assignment.arm,
      requestedArm: orchestration.policy.assignment.requestedArm,
      assignmentSource: orchestration.policy.assignment.assignmentSource,
      selectionMode:
        orchestration.policy.selectionMode as GenerateTestPlan["policySelection"]["selectionMode"],
      personalizationMode:
        orchestration.policy.assignment.personalizationMode,
      policyMode: orchestration.policy.assignment.policyMode,
      policyId: orchestration.policy.assignment.policyId,
    },
    policyMode: orchestration.policy.policyMode,
    policyId: orchestration.policy.policyId,
    pedagogicalDecision: orchestration.pedagogicalDecision,
    appliedDelivery: orchestration.surfaces.test.delivery,
    renderingDecision: {
      tone: orchestration.surfaces.test.delivery.tone,
      explanation_style: orchestration.surfaces.test.delivery.explanation_style,
      response_format: orchestration.surfaces.test.delivery.response_format,
    },
    renderingRules: orchestration.surfaces.test.rulesLayer,
    decisionContext: orchestration.decisionContext,
    decisionBackend: orchestration.decisionBackend,
    recommendationSnapshot: orchestration.recommendationSnapshot,
    policyMeta: orchestration.policyMeta,
    sixFactorDecision: orchestration.sixFactorDecision ?? null,
    sixFactorDecisionMetadata: orchestration.sixFactorDecisionMetadata ?? null,
  };
}

function buildLearningContentPlanFromOrchestration(
  orchestration: EpisodeOrchestrationPackage,
): GenerateLearningContentPlan {
  return {
    personalizationMode: orchestration.personalizationMode,
    assignment: orchestration.policy.assignment,
    policyMode: orchestration.policy.policyMode,
    policyId: orchestration.policy.policyId,
    pedagogicalDecision: orchestration.pedagogicalDecision,
    renderingDecision: {
      tone: orchestration.surfaces.learningContent.delivery.tone,
      explanation_style:
        orchestration.surfaces.learningContent.delivery.explanation_style,
      response_format:
        orchestration.surfaces.learningContent.delivery.response_format,
    },
    renderingRules: orchestration.surfaces.learningContent.rulesLayer,
    sixFactorDecision: orchestration.sixFactorDecision ?? null,
    sixFactorDecisionMetadata: orchestration.sixFactorDecisionMetadata ?? null,
  };
}

async function summarizeEpisode(episodeId: string) {
  const summary = await buildEvaluationEpisodeSummary(prisma, episodeId);
  if (!summary) {
    throw new Error("EPISODE_NOT_FOUND");
  }
  return summary;
}

async function buildEpisodeStateFromSummary(
  userId: string,
  episodeId: string,
  currentStep: MaterializedEpisodeStep,
): Promise<LearningEpisodeState> {
  return {
    episode: await summarizeEpisode(episodeId),
    currentStep,
  };
}

async function materializeNewStep(params: {
  user: GenerateTestUser;
  episode: EpisodeRecord;
  orchestration: EpisodeOrchestrationPackage;
  sectionSnapshot: string | null;
  sequenceRoles: EvaluationSequenceRole[];
  role: EvaluationSequenceRole;
  lastEvaluationTestId: string | null;
}) {
  if (!params.episode.subject) {
    throw new Error("EPISODE_SUBJECT_NOT_FOUND");
  }

  const evaluation = buildEvaluationRequestForRole({
    episode: params.episode,
    orchestration: params.orchestration,
    sequenceRoles: params.sequenceRoles,
    role: params.role,
    lastEvaluationTestId: params.lastEvaluationTestId,
  });

  if (
    params.role === "precheck" ||
    params.role === "postcheck" ||
    params.role === "holdout" ||
    params.role === "delayed_recheck"
  ) {
    const artifact = await generateTestForUser({
      user: params.user,
      payload: {
        subjectId: params.episode.subject.id,
        sectionId: params.episode.sectionId,
        topic: params.episode.topic ?? params.episode.subject.title,
        questionCount: params.orchestration.questionCount,
        mode: params.orchestration.mode,
        personalizationMode: params.orchestration.personalizationMode,
        delivery: params.orchestration.surfaces.test.delivery,
        evaluation,
        recommended: false,
      } satisfies GenerateTestPayload,
      hasManualDeliveryOverride: false,
      resolvedPlan: buildTestPlanFromOrchestration(params.orchestration),
      datasetPhase: params.episode.datasetPhase ?? null,
      datasetOrigin: params.episode.datasetOrigin ?? null,
    });

    return {
      status: "ready",
      sequenceRole: params.role,
      contentKind: "generated_test",
      contentId: artifact.id,
      itemId: null,
      test: {
        id: artifact.id,
        title: artifact.title,
        questions: sanitizeQuestionsForClient(artifact.questions),
      },
      learningContent: null,
      dueAtIso: null,
    } satisfies MaterializedEpisodeStep;
  }

  const priorTestItem =
    [...params.episode.items]
      .reverse()
      .find(
        (item) =>
          item.contentKind === "generated_test" &&
          item.outcomeRecordedAt != null,
      ) ?? null;
  const artifact = await generateLearningContentForEpisode({
    user: params.user,
    subject: params.episode.subject,
    sectionId: params.episode.sectionId,
    sectionSnapshot: params.sectionSnapshot,
    topic: params.episode.topic ?? params.episode.subject.title,
    evaluation,
    familyKey: params.orchestration.familyKey,
    plan: buildLearningContentPlanFromOrchestration(params.orchestration),
    priorTestOutcome: parsePriorTestOutcome(priorTestItem),
    datasetPhase: params.episode.datasetPhase ?? null,
    datasetOrigin: params.episode.datasetOrigin ?? null,
  });

  return {
    status: "ready",
    sequenceRole: params.role,
    contentKind: "chat_session",
    contentId: artifact.sessionId,
    itemId: null,
    test: null,
    learningContent: {
      sessionId: artifact.sessionId,
      title: artifact.card.title,
      summary: artifact.card.summary,
      sections: artifact.card.sections,
      reflectionPrompt: artifact.card.reflectionPrompt,
      renderedContent: artifact.renderedContent,
      generationSource: artifact.generationSource,
      dialogueThread: [],
      dialogueBudget: {
        maxLearnerTurns: LEARNING_DIALOGUE_MAX_LEARNER_TURNS,
        learnerTurnsUsed: 0,
        learnerTurnsRemaining: LEARNING_DIALOGUE_MAX_LEARNER_TURNS,
        reachedLimit: false,
      },
      pedagogicalContext: {
        difficulty:
          artifact.sixFactorDeliveredConfig?.deliveredConfig.difficulty ??
          params.orchestration.pedagogicalDecision.difficulty,
        depth:
          artifact.sixFactorDeliveredConfig?.deliveredConfig.depth ??
          params.orchestration.pedagogicalDecision.depth,
        supportLevel:
          artifact.sixFactorDeliveredConfig?.deliveredConfig.support_level ??
          null,
        presentationFormat:
          artifact.sixFactorDeliveredConfig?.deliveredConfig
            .presentation_format ?? null,
        examplesLevel:
          artifact.sixFactorDeliveredConfig?.deliveredConfig.examples_level ??
          null,
        terminologyLevel:
          artifact.sixFactorDeliveredConfig?.deliveredConfig
            .terminology_level ?? null,
        tone: params.orchestration.surfaces.learningContent.delivery.tone,
        explanationStyle:
          params.orchestration.surfaces.learningContent.delivery
            .explanation_style,
        policyMode: params.orchestration.policy.policyMode,
        policyId: params.orchestration.policy.policyId,
        personalizationMode: params.orchestration.personalizationMode,
      },
      mlPersonalization: buildMlPersonalizationView(
        artifact.sixFactorDeliveredConfig,
      ),
    },
    dueAtIso: null,
  } satisfies MaterializedEpisodeStep;
}

export async function createLearningEpisode(
  user: GenerateTestUser,
  input: CreateLearningEpisodeInput,
): Promise<LearningEpisodeState> {
  const subject = await resolveSubjectForEpisode(user.id, input.subjectId);
  const section = await resolveSectionSnapshot(subject.id, input.sectionId ?? null);
  const sequenceRoles = resolveSequenceRoles(input);
  const orchestration = await resolveEpisodeOrchestrationPackage({
    user,
    input,
    subject,
    sectionId: section.sectionId,
  });
  const requested: EvaluationRequestInput = {
    protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
    clientKey: input.clientKey ?? null,
    assignmentArm: orchestration.policy.arm as CreateLearningEpisodeInput["assignmentArm"],
    conceptKey: orchestration.conceptKey,
    skillKey: orchestration.skillKey,
    holdoutStrategy: orchestration.holdoutStrategy,
    delayedMinutes: orchestration.delayedRecheckMinutes,
    expectedSequenceRoles: sequenceRoles,
  };

  const resolvedEpisode = await resolveOrCreateEvaluationEpisode({
    prisma,
    userId: user.id,
    subjectId: subject.id,
    sectionId: section.sectionId,
    topic: input.topic,
    conceptKey: orchestration.conceptKey,
    skillKey: orchestration.skillKey,
    datasetPhase: input.datasetPhase ?? null,
    datasetOrigin: input.datasetOrigin ?? null,
    requested,
    assignment: orchestration.policy.assignment,
  });

  const finalOrchestration = {
    ...orchestration,
    familyKey: deriveFamilyKey({
      episodeId: resolvedEpisode.episode.id,
      requestedFamilyKey: input.familyKey ?? null,
      skillKey: input.skillKey ?? null,
      conceptKey: input.conceptKey ?? null,
    }),
    sixFactorDecisionMetadata: orchestration.sixFactorDecisionMetadata
      ? {
          ...orchestration.sixFactorDecisionMetadata,
          featuresSnapshot: {
            ...orchestration.sixFactorDecisionMetadata.featuresSnapshot,
            sessionRef: resolvedEpisode.episode.id,
          },
          featureRefs: {
            ...orchestration.sixFactorDecisionMetadata.featureRefs,
            sessionRef: resolvedEpisode.episode.id,
          },
        }
      : null,
    decisionBoundary: buildDeliveredPedagogicalDecisionV1({
      learnerStateSnapshot: orchestration.decisionBoundary.learner_state_snapshot,
      pedagogicalDecision: orchestration.decisionBoundary.pedagogical_decision,
      provenance: orchestration.decisionBoundary.provenance,
      deliveredAt: null,
      episodeId: resolvedEpisode.episode.id,
      sequenceRole: null,
      touchpointType: null,
      contentId: null,
    }),
  } satisfies EpisodeOrchestrationPackage;

  await persistOrchestrationPackage({
    episodeId: resolvedEpisode.episode.id,
    designJson: resolvedEpisode.episode.designJson,
    orchestration: finalOrchestration,
  });

  return advanceLearningEpisode(user, resolvedEpisode.episode.id, false);
}

export async function getLearningEpisodeState(
  userId: string,
  episodeId: string,
): Promise<LearningEpisodeState> {
  return advanceLearningEpisode(
    {
      id: userId,
      personalizationReady: false,
      declaredPreferencesJson: {},
      effectivePreferencesJson: {},
    },
    episodeId,
    false,
    true,
  );
}

export async function advanceLearningEpisode(
  user: GenerateTestUser,
  episodeId: string,
  acknowledgeLearningContent: boolean,
  readOnly = false,
): Promise<LearningEpisodeState> {
  const episode = await loadEpisodeRecord(user.id, episodeId);
  const orchestration = readOrchestrationPackage(episode.designJson);
  if (!orchestration) {
    throw new Error("EPISODE_ORCHESTRATION_MISSING");
  }

  const section = await resolveSectionSnapshot(
    episode.subjectId ?? "",
    episode.sectionId ?? null,
  );
  const sequenceRoles = normalizeSequenceRoles(
    (asObject(episode.designJson)?.expectedSequenceRoles as EvaluationSequenceRole[]) ??
      [],
  );
  const roles =
    sequenceRoles.length > 0
      ? sequenceRoles
      : (["precheck", "learning_content", "postcheck"] satisfies EvaluationSequenceRole[]);
  const lastEvaluationTestId =
    [...episode.items]
      .reverse()
      .find((item) => item.contentKind === "generated_test")
      ?.contentId ?? null;

  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    const item = episode.items.find((candidate) => candidate.sequenceRole === role) ?? null;

    if (!item) {
      if (
        role === "delayed_recheck" &&
        orchestration.delayedRecheckMinutes != null
      ) {
        const previousOutcome =
          [...episode.items]
            .reverse()
            .find((candidate) => candidate.outcomeRecordedAt != null) ?? null;
        if (previousOutcome?.outcomeRecordedAt) {
          const dueAt = new Date(
            previousOutcome.outcomeRecordedAt.getTime() +
              orchestration.delayedRecheckMinutes * 60 * 1000,
          );
          if (dueAt.getTime() > Date.now()) {
            return buildEpisodeStateFromSummary(user.id, episodeId, {
              status: "waiting_delay",
              sequenceRole: "delayed_recheck",
              contentKind: null,
              contentId: null,
              itemId: null,
              test: null,
              learningContent: null,
              dueAtIso: dueAt.toISOString(),
            });
          }
        }
      }

      if (readOnly) {
        return buildEpisodeStateFromSummary(user.id, episodeId, {
          status: "pending_materialization",
          sequenceRole: role,
          contentKind: null,
          contentId: null,
          itemId: null,
          test: null,
          learningContent: null,
          dueAtIso: null,
        });
      }

      try {
        const createdStep = await materializeNewStep({
          user,
          episode,
          orchestration,
          sectionSnapshot: section.sectionSnapshot,
          sequenceRoles: roles,
          role,
          lastEvaluationTestId,
        });
        return buildEpisodeStateFromSummary(user.id, episodeId, createdStep);
      } catch (error) {
        if (isEpisodeMaterializationConflict(error)) {
          return advanceLearningEpisode(
            user,
            episodeId,
            acknowledgeLearningContent,
            true,
          );
        }
        throw error;
      }
    }

    if (item.contentKind === "generated_test" && item.outcomeRecordedAt == null) {
      return buildEpisodeStateFromSummary(user.id, episodeId, {
        status: "awaiting_test_submission",
        sequenceRole: role,
        contentKind: "generated_test",
        contentId: item.contentId,
        itemId: item.id,
        test: await hydrateTestStep(item),
        learningContent: null,
        dueAtIso: null,
      });
    }

    if (role === "learning_content") {
      const hasLaterItem = roles
        .slice(index + 1)
        .some((laterRole) =>
          episode.items.some((candidate) => candidate.sequenceRole === laterRole),
        );
      if (!acknowledgeLearningContent && !hasLaterItem) {
        return buildEpisodeStateFromSummary(user.id, episodeId, {
          status: "acknowledge_learning_content",
          sequenceRole: role,
          contentKind: "chat_session",
          contentId: item.contentId,
          itemId: item.id,
          test: null,
          learningContent: await hydrateLearningContentStep(item),
          dueAtIso: null,
        });
      }
    }
  }

  return buildEpisodeStateFromSummary(user.id, episodeId, {
    status: "completed",
    sequenceRole: null,
    contentKind: null,
    contentId: null,
    itemId: null,
    test: null,
    learningContent: null,
    dueAtIso: null,
  });
}
