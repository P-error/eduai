import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureTagLegend } from "@/lib/tag-seed";
import {
  llmChatJsonWithRepair,
  type LlmJsonCallDiagnostics,
} from "@/lib/llm/provider";
import {
  TestSchema,
  validateGeneratedTestArtifact,
  type GeneratedTestValidationResult,
} from "@/lib/test-schema";
import {
  judgeGeneratedTestArtifact,
  type GeneratedTestJudgeRun,
} from "@/lib/generated-test-judge";
import { tagQuestion } from "@/lib/tagger";
import { getActivePromptTemplate, renderPrompt } from "@/lib/prompts";
import { tagQuestionsWithLLM } from "@/lib/llm-tagger";
import {
  appendPromptBlocks,
  buildTestSystemPrompt,
} from "@/lib/llm-prompt-builders";
import {
  buildEvaluationAssignment,
  buildEvaluationItemMeta,
  resolveEvaluationPolicySelection,
  registerEvaluationEpisodeItem,
  resolveOrCreateEvaluationEpisode,
  EVALUATION_HOLDOUT_STRATEGIES,
  EVALUATION_ITEM_ROLES,
  EVALUATION_ITEM_VARIANTS,
  EVALUATION_LINKAGE_KINDS,
  EVALUATION_POLICY_ARMS,
  EVALUATION_SEQUENCE_ROLES,
  EVALUATION_TOUCHPOINT_TYPES,
  type EvaluationAssignmentMeta,
  type EvaluationItemMeta,
  type EvaluationPolicySelection,
  type EvaluationRequestInput,
} from "@/lib/evaluation";
import {
  buildTestGenerationPrompt,
  type TestGenerationPackage,
} from "@/lib/episode-generation";
import { buildOptionalSixFactorDeliveredConfigMetadata } from "@/lib/ml-six-factor-decision-metadata";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import {
  buildOptionalSixFactorShadowMetadata,
  isSixFactorShadowEnabled,
} from "@/lib/ml-six-factor-shadow";
import { buildLearnerStateAggregatesForSixFactorPolicy } from "@/lib/ml-six-factor-learner-state-features";
import { getSubjectRecommendation } from "@/lib/recommendation";
import {
  clampExplanationDepth,
  createBaselineMaterialization,
  createDeclaredPreferenceMaterialization,
  type RenderingDecision,
} from "@/lib/personalization-runtime";
import {
  MAX_RETRIES,
  sanitizePreferenceMap,
} from "@/lib/tags";
import {
  computeUxCompliance,
  evaluateUxComplianceGate,
  logLearningQualityGateDecision,
  pickRequestedUxAxes,
  type CoreDeliveryRequest,
  type ObservedQuestionTags,
  type UxComplianceGateDecision,
} from "@/lib/learning-quality-gate";
import { type TrainingDatasetCollectionMeta } from "@/lib/training-dataset-contract";

export const DeliverySchema = z
  .object({
    tone: z.string().optional(),
    explanation_style: z.string().optional(),
    response_format: z.string().optional(),
    difficulty_target: z.string().optional(),
    depth: z.string().optional(),
    cognitive_process: z.string().optional(),
    task_family: z.string().optional(),
    context: z.string().optional(),
  })
  .optional();

export const DeliveryComplianceSchema = z
  .object({
    tone: z.string().optional(),
    explanation_style: z.string().optional(),
    response_format: z.string().optional(),
    difficulty_target: z.string().optional(),
    depth: z.string().optional(),
    cognitive_process: z.string().optional(),
    task_family: z.string().optional(),
    context: z.string().optional(),
  })
  .optional();

export const GenerateSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().optional().nullable(),
  topic: z.string().min(2),
  questionCount: z.number().int().min(1).max(20),
  mode: z.enum(["quiz", "exam", "practice"]).default("quiz"),
  personalizationMode: z.enum(["on", "off"]).optional().default("on"),
  delivery: DeliverySchema,
  evaluation: z
    .object({
      episodeId: z.string().min(1).optional(),
      protocolKey: z.string().min(1).optional(),
      touchpointType: z.enum(EVALUATION_TOUCHPOINT_TYPES).optional(),
      sequenceRole: z.enum(EVALUATION_SEQUENCE_ROLES).optional(),
      itemRole: z.enum(EVALUATION_ITEM_ROLES).optional(),
      itemVariant: z.enum(EVALUATION_ITEM_VARIANTS).optional(),
      linkageKind: z.enum(EVALUATION_LINKAGE_KINDS).optional(),
      linkedContentId: z.string().min(1).optional().nullable(),
      assignmentArm: z.enum(EVALUATION_POLICY_ARMS).optional(),
      conceptKey: z.string().min(1).optional().nullable(),
      skillKey: z.string().min(1).optional().nullable(),
      familyKey: z.string().min(1).optional().nullable(),
      holdoutStrategy: z.enum(EVALUATION_HOLDOUT_STRATEGIES).optional(),
      delayedMinutes: z.number().int().positive().optional().nullable(),
      expectedTouchpoints: z
        .array(z.enum(EVALUATION_TOUCHPOINT_TYPES))
        .max(6)
        .optional(),
      expectedSequenceRoles: z
        .array(z.enum(EVALUATION_SEQUENCE_ROLES))
        .max(6)
        .optional(),
    })
    .optional(),
  recommended: z.boolean().optional(),
  recommendationSnapshot: z.unknown().optional(),
});

type DeliveryRequest = NonNullable<z.infer<typeof DeliveryComplianceSchema>>;
export type GenerateTestPayload = z.infer<typeof GenerateSchema>;

type SubjectSnapshot = {
  id: string;
  title: string;
};

type ResolvedSectionSnapshot = {
  sectionId: string | null;
  sectionSnapshot: string | null;
};

export type GenerateTestPlan = {
  personalizationMode: "on" | "off";
  assignment: EvaluationAssignmentMeta;
  policySelection: EvaluationPolicySelection;
  policyMode: string | null;
  policyId: string | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  };
  appliedDelivery: CoreDeliveryRequest;
  renderingDecision: {
    tone: string;
    explanation_style: string;
    response_format: "mcq";
  };
  renderingRules: {
    id: string;
    basis: string;
  };
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
};

export type GenerateTestUser = {
  id: string;
  personalizationReady: boolean;
  declaredPreferencesJson: unknown;
  effectivePreferencesJson: unknown;
};

export type GenerateTestForUserParams = {
  user: GenerateTestUser;
  payload: GenerateTestPayload;
  rawBody?: unknown;
  hasManualDeliveryOverride?: boolean;
  resolvedPlan?: GenerateTestPlan;
} & TrainingDatasetCollectionMeta;

export type GeneratedTestArtifact = {
  id: string;
  evaluationEpisodeId: string | null;
  title: string;
  questions: z.infer<typeof TestSchema>["questions"];
  questionCount: number;
  topic: string;
  generationPackage: TestGenerationPackage | null;
  evaluation: EvaluationItemMeta | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  };
  renderingDecision: {
    tone: string;
    explanation_style: string;
    response_format: string;
  };
};

export class TestGenerationError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const BASELINE_DELIVERY_PRESET: CoreDeliveryRequest =
  createBaselineMaterialization("test").delivery;

function fallbackTest(subject: string, topic: string, count: number) {
  return {
    title: `${subject}: diagnostic fallback for ${topic}`,
    questions: Array.from({ length: count }).map((_, index) => ({
      prompt: `Diagnostic fallback check ${index + 1}: which statement is most directly connected to ${topic}?`,
      options: [
        `A statement about ${topic}`,
        "A statement about an unrelated topic",
        "A statement with no assessable learning claim",
      ],
      answerIndex: 0,
      explanation:
        "Diagnostic fallback item generated because the external LLM path was unavailable or invalid; this item is excluded from learning updates.",
    })),
  } satisfies z.infer<typeof TestSchema>;
}

function pickCoreDeliveryFields(
  source: DeliveryRequest | Record<string, unknown> | null | undefined,
): CoreDeliveryRequest {
  const root = source ?? {};
  return {
    tone: typeof root.tone === "string" ? root.tone : undefined,
    explanation_style:
      typeof root.explanation_style === "string"
        ? root.explanation_style
        : undefined,
    response_format:
      typeof root.response_format === "string"
        ? root.response_format
        : undefined,
    difficulty_target:
      typeof root.difficulty_target === "string"
        ? root.difficulty_target
        : undefined,
    depth: typeof root.depth === "string" ? root.depth : undefined,
  };
}

function buildStrictDeliveryReinforcement(
  requestedUx: Record<string, string>,
): string {
  const requirements = Object.entries(requestedUx)
    .map(([axis, value]) => `${axis} MUST be ${value}`)
    .join("; ");

  return `STRICT DELIVERY REQUIREMENTS: For EVERY question ${requirements}. If you cannot comply, rewrite the question until it matches. Do not explain these requirements. Output JSON only.`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function testValidationMessages(result: GeneratedTestValidationResult) {
  return [...result.errors, ...result.warnings].map((issue) =>
    `${issue.path ? `${issue.path}:` : ""}${issue.code}: ${issue.message}`,
  );
}

async function resolveSectionSnapshot(
  subjectId: string,
  sectionId: string | null | undefined,
) {
  if (!sectionId) {
    return {
      sectionId: null,
      sectionSnapshot: null,
    } satisfies ResolvedSectionSnapshot;
  }

  const section = await prisma.subjectSection.findFirst({
    where: { id: sectionId, subjectId },
  });
  if (!section) {
    throw new TestGenerationError(
      400,
      "INVALID_INPUT",
      "Section not found.",
    );
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
  } satisfies ResolvedSectionSnapshot;
}

async function resolveSubjectSnapshot(
  userId: string,
  subjectId: string,
): Promise<SubjectSnapshot> {
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
    throw new TestGenerationError(
      400,
      "INVALID_INPUT",
      "Subject not found.",
    );
  }

  return subject;
}

async function resolveTestGenerationPlan(params: {
  user: GenerateTestUser;
  payload: GenerateTestPayload;
  hasManualDeliveryOverride: boolean;
  subject: SubjectSnapshot;
  sectionId: string | null;
}) {
  const evaluationRequest: EvaluationRequestInput | null =
    params.payload.evaluation ?? null;
  const personalizationMode = params.payload.personalizationMode ?? "on";
  const baselineMaterialization = createBaselineMaterialization("test");
  const declaredPreferences = sanitizePreferenceMap(
    (params.user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
  );

  const policySelection = resolveEvaluationPolicySelection({
    surface: "test",
    requestedArm: evaluationRequest?.assignmentArm ?? null,
    personalizationMode,
    manualOverrideActive: params.hasManualDeliveryOverride,
  });

  const selfReportMaterialization = createDeclaredPreferenceMaterialization({
    surface: "test",
    declaredPreferences,
  });
  const shouldFetchPredictedRecommendation =
    policySelection.selectionMode === "predicted_runtime" ||
    (policySelection.selectionMode === "manual_override" &&
      personalizationMode === "on") ||
    (policySelection.selectionMode === "observational_only" &&
      personalizationMode === "on");
  const recommendation = shouldFetchPredictedRecommendation
    ? await getSubjectRecommendation(params.user.id, params.subject.id, {
        sectionId: params.sectionId,
        topic: params.payload.topic,
        questionCount: params.payload.questionCount,
        mode: params.payload.mode,
      })
    : null;
  const baseDelivery =
    recommendation?.ok === true
      ? recommendation.preset.delivery
      : policySelection.selectionMode === "self_report_declared"
        ? selfReportMaterialization.materialization.delivery
        : baselineMaterialization.delivery;
  const clientRequestedDelivery = pickCoreDeliveryFields(
    DeliveryComplianceSchema.parse(params.payload.delivery ?? {}) ?? {},
  );
  const appliedDelivery: CoreDeliveryRequest = params.hasManualDeliveryOverride
    ? {
        ...baseDelivery,
        ...clientRequestedDelivery,
      }
    : baseDelivery;
  const pedagogicalDecision = {
    difficulty:
      appliedDelivery.difficulty_target ??
      BASELINE_DELIVERY_PRESET.difficulty_target ??
      "medium",
    depth: clampExplanationDepth(appliedDelivery.depth),
  };
  const renderingDecision: GenerateTestPlan["renderingDecision"] = {
    tone: appliedDelivery.tone ?? BASELINE_DELIVERY_PRESET.tone ?? "formal",
    explanation_style:
      appliedDelivery.explanation_style ??
      BASELINE_DELIVERY_PRESET.explanation_style ??
      "stepwise",
    response_format:
      (appliedDelivery.response_format ??
        BASELINE_DELIVERY_PRESET.response_format ??
        "mcq") as "mcq",
  };
  const policyMeta = {
    personalizationMode:
      policySelection.personalizationMode ?? personalizationMode,
    usedRecommendation: recommendation?.ok === true,
    usedBaseline:
      recommendation?.ok !== true &&
      policySelection.selectionMode !== "self_report_declared",
    usedDeclaredPreferences: policySelection.selectionMode === "self_report_declared",
    usedManualDelivery: params.hasManualDeliveryOverride,
    assignedArm: policySelection.arm,
    selectionMode: policySelection.selectionMode,
    declaredCoverage: selfReportMaterialization.coverage,
  } satisfies Record<string, unknown>;
  const recommendationSnapshot =
    params.payload.recommendationSnapshot ??
    (recommendation?.ok
      ? {
          ok: true,
          preset: recommendation.preset,
          rationale: recommendation.rationale,
          dataStatus: recommendation.dataStatus,
        }
      : policySelection.selectionMode === "self_report_declared"
        ? {
            ok: true,
            source: "self_report_declared",
            pedagogicalDecision: selfReportMaterialization.pedagogicalDecision,
            delivery: selfReportMaterialization.materialization.delivery,
            rulesLayer: {
              id: selfReportMaterialization.materialization.rulesLayerId,
              basis: selfReportMaterialization.materialization.basis,
            },
            coverage: selfReportMaterialization.coverage,
          }
        : undefined);
  const assignment = buildEvaluationAssignment({
    selection: policySelection,
    runtimePolicyId: recommendation?.ok
      ? recommendation.preset.meta?.runtimePolicyId ?? null
      : null,
    backendKind: recommendation?.ok
      ? recommendation.preset.meta?.backendKind ?? null
      : null,
    backendId: recommendation?.ok
      ? recommendation.preset.meta?.backendId ?? null
      : null,
  });

  return {
    personalizationMode,
    assignment,
    policySelection,
    policyMode: assignment.policyMode,
    policyId: assignment.policyId,
    pedagogicalDecision,
    appliedDelivery,
    renderingDecision,
    renderingRules: recommendation?.ok
      ? recommendation.preset.rulesLayer
      : {
          id: baselineMaterialization.rulesLayerId,
          basis: params.hasManualDeliveryOverride
            ? `manual_override|base=${baselineMaterialization.basis}`
            : baselineMaterialization.basis,
        },
    decisionContext: recommendation?.ok
      ? recommendation.preset.decisionContext
      : null,
    decisionBackend: recommendation?.ok
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
    recommendationSnapshot,
    policyMeta,
  } satisfies GenerateTestPlan;
}

function buildEpisodeTestPackage(params: {
  episodeId: string;
  protocolKey: string;
  sequenceRole: EvaluationItemMeta["sequenceRole"];
  touchpointType: EvaluationItemMeta["touchpointType"];
  subject: SubjectSnapshot;
  sectionSnapshot: string | null;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  familyKey: string;
  conceptKey: string | null;
  skillKey: string | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  };
  renderingDecision: {
    tone: string;
    explanation_style: string;
    response_format: "mcq";
  };
  renderingRules: {
    id: string;
    basis: string;
  };
  assignment: EvaluationAssignmentMeta;
  evaluation: EvaluationItemMeta;
}) {
  return {
    schemaVersion: "episode_generation_package_v1_2026_03",
    episodeId: params.episodeId,
    protocolKey: params.protocolKey,
    contentKind: "generated_test",
    sequenceRole: params.sequenceRole,
    touchpointType: params.touchpointType,
    questionCount: params.questionCount,
    mode: params.mode,
    pedagogicalDecision: params.pedagogicalDecision,
    rendering: {
      tone: params.renderingDecision.tone,
      explanationStyle: params.renderingDecision.explanation_style,
      responseFormat: params.renderingDecision.response_format,
      rulesLayer: params.renderingRules,
      renderingDecision: {
        tone: params.renderingDecision.tone,
        explanationStyle: params.renderingDecision.explanation_style,
        responseFormat: params.renderingDecision.response_format,
        presentationMode: "mcq_test",
        formattingHint:
          params.pedagogicalDecision.depth === "detailed"
            ? "scaffolded"
            : params.pedagogicalDecision.depth === "brief"
              ? "brief"
              : "balanced",
      } satisfies RenderingDecision,
    },
    policy: {
      arm: params.assignment.arm,
      policyMode: params.assignment.policyMode,
      policyId: params.assignment.policyId,
      assignmentSource: params.assignment.assignmentSource,
      personalizationMode: params.assignment.personalizationMode ?? "on",
    },
    scope: {
      subjectId: params.subject.id,
      subjectTitle: params.subject.title,
      sectionId: params.sectionId,
      sectionPath: params.sectionSnapshot,
      topic: params.topic,
      conceptKey: params.conceptKey,
      skillKey: params.skillKey,
      familyKey: params.familyKey,
    },
    linkage: {
      linkageKind: params.evaluation.linkageKind,
      linkedContentId: params.evaluation.linkedContentId,
      holdoutStrategy: params.evaluation.holdoutStrategy,
    },
    outputContract: {
      kind: "mcq_test",
      schema: "TestSchema",
    },
  } satisfies TestGenerationPackage;
}

export async function generateTestForUser(
  params: GenerateTestForUserParams,
): Promise<GeneratedTestArtifact> {
  const evaluationRequest: EvaluationRequestInput | null =
    params.payload.evaluation ?? null;
  const clientRequestedDelivery = pickCoreDeliveryFields(
    DeliveryComplianceSchema.parse(params.payload.delivery ?? {}) ?? {},
  );
  if (
    clientRequestedDelivery.response_format &&
    clientRequestedDelivery.response_format !== "mcq"
  ) {
    throw new TestGenerationError(
      400,
      "UNSUPPORTED_FEATURE",
      "response_format supports only mcq in this prototype.",
    );
  }

  await ensureTagLegend();

  const subject = await resolveSubjectSnapshot(params.user.id, params.payload.subjectId);
  const section = await resolveSectionSnapshot(
    subject.id,
    params.payload.sectionId ?? null,
  );
  const hasManualDeliveryOverride =
    params.hasManualDeliveryOverride ??
    (Boolean(params.rawBody) &&
      typeof params.rawBody === "object" &&
      Object.prototype.hasOwnProperty.call(params.rawBody, "delivery"));
  const plan =
    params.resolvedPlan ??
    (await resolveTestGenerationPlan({
      user: params.user,
      payload: params.payload,
      hasManualDeliveryOverride,
      subject,
      sectionId: section.sectionId,
    }));

  const declaredPreferences = sanitizePreferenceMap(
    (params.user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
  );
  const effectivePreferences = sanitizePreferenceMap(
    (params.user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
  );
  const promptTemplate = await getActivePromptTemplate("test_generation_v1");
  const llmModel = "gpt-4o-mini";
  const requestedUx = pickRequestedUxAxes(
    hasManualDeliveryOverride ? clientRequestedDelivery : {},
  );
  const hasRequestedUx = Object.keys(requestedUx).length > 0;
  const syntheticLlmDisabled = (() => {
    const raw = process.env.EDUAI_SYNTHETIC_DISABLE_LLM?.trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  })();
  const llmGenerationAvailable =
    !syntheticLlmDisabled &&
    typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.trim().length > 0;
  const baseSystemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(declaredPreferences),
    effective: JSON.stringify(effectivePreferences),
    ready: params.user.personalizationReady,
  });
  const systemPrompt = buildTestSystemPrompt({
    baseInstruction: baseSystemPrompt,
    profile: {
      userRef: params.user.id,
      personalizationReady: params.user.personalizationReady,
      declaredPreferences,
      effectivePreferences,
    },
  });

  const axes = await prisma.tagAxis.findMany({ include: { tags: true } });
  const axisMap = new Map(axes.map((axis) => [axis.key, axis]));

  let resolvedEpisode:
    | {
        id: string;
        protocolKey: string;
        created: boolean;
      }
    | null = null;
  let testEvaluation: EvaluationItemMeta | null = null;
  let generationPackage: TestGenerationPackage | null = null;

  if (evaluationRequest) {
    try {
      const episode = await resolveOrCreateEvaluationEpisode({
        prisma,
        userId: params.user.id,
        subjectId: subject.id,
        sectionId: section.sectionId,
        topic: params.payload.topic,
        conceptKey: evaluationRequest.conceptKey ?? null,
        skillKey: evaluationRequest.skillKey ?? null,
        datasetPhase: params.datasetPhase ?? null,
        datasetOrigin: params.datasetOrigin ?? null,
        requested: evaluationRequest,
        assignment: plan.assignment,
      });
      resolvedEpisode = {
        id: episode.episode.id,
        protocolKey: episode.episode.protocolKey,
        created: episode.created,
      };
      testEvaluation = buildEvaluationItemMeta({
        episodeId: episode.episode.id,
        assignment: plan.assignment,
        requested: evaluationRequest,
        contentKind: "generated_test",
        signalQuality: "primary_test",
        protocolKey: episode.episode.protocolKey,
        topic: params.payload.topic,
        subjectId: subject.id,
        sectionId: section.sectionId,
        pedagogicalDecision: plan.pedagogicalDecision,
        runtimePolicyId: plan.assignment.runtimePolicyId,
        backendKind: plan.assignment.backendKind,
        backendId: plan.assignment.backendId,
      });
      generationPackage = buildEpisodeTestPackage({
        episodeId: episode.episode.id,
        protocolKey: episode.episode.protocolKey,
        sequenceRole: testEvaluation.sequenceRole,
        touchpointType: testEvaluation.touchpointType,
        subject,
        sectionSnapshot: section.sectionSnapshot,
        sectionId: section.sectionId,
        topic: params.payload.topic,
        questionCount: params.payload.questionCount,
        mode: params.payload.mode,
        familyKey: testEvaluation.familyKey ?? `episode_${episode.episode.id}_core`,
        conceptKey: testEvaluation.conceptKey,
        skillKey: testEvaluation.skillKey,
        pedagogicalDecision: plan.pedagogicalDecision,
        renderingDecision: plan.renderingDecision,
        renderingRules: plan.renderingRules,
        assignment: plan.assignment,
        evaluation: testEvaluation,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("EVALUATION_ASSIGNMENT_") ||
          error.message.startsWith("EVALUATION_EPISODE_"))
      ) {
        throw new TestGenerationError(
          400,
          error.message.startsWith("EVALUATION_ASSIGNMENT_")
            ? "INVALID_EVALUATION_ASSIGNMENT"
            : "INVALID_EVALUATION_EPISODE",
          error.message.startsWith("EVALUATION_ASSIGNMENT_")
            ? "Evaluation arm conflicts with the requested delivery path."
            : "Evaluation episode linkage is invalid for this request.",
          { reason: error.message },
        );
      }
      throw error;
    }
  }

  const sixFactorDecisionAt = new Date();
  const sixFactorDecisionAtIso = sixFactorDecisionAt.toISOString();
  const sixFactorLearnerStateAggregates = isSixFactorShadowEnabled()
    ? await buildLearnerStateAggregatesForSixFactorPolicy({
        prisma,
        userId: params.user.id,
        subjectId: subject.id,
        topicRef: testEvaluation?.conceptKey ?? null,
        conceptKey: testEvaluation?.conceptKey ?? null,
        skillKey: testEvaluation?.skillKey ?? null,
        familyKey: testEvaluation?.familyKey ?? null,
        topic: params.payload.topic,
        evaluationEpisodeId: resolvedEpisode?.id ?? null,
        decisionCreatedAt: sixFactorDecisionAt,
      })
    : null;
  const sixFactorPolicyContext = {
    userRef: params.user.id,
    subjectRef: subject.id,
    topicRef: testEvaluation?.conceptKey ?? null,
    conceptKey: testEvaluation?.conceptKey ?? null,
    skillKey: testEvaluation?.skillKey ?? null,
    familyKey: testEvaluation?.familyKey ?? null,
    topic: params.payload.topic,
    sessionRef: resolvedEpisode?.id ?? null,
    ...(sixFactorLearnerStateAggregates ?? {}),
    previousDifficulty: plan.pedagogicalDecision.difficulty,
    previousDepth: plan.pedagogicalDecision.depth,
    declaredPreferences,
    policyId: plan.policyId,
    backendKind: plan.decisionBackend?.backendKind ?? null,
    modelVersion: plan.decisionBackend?.schemaVersion ?? null,
  };
  const sixFactorApply = buildAppliedSixFactorPromptInstructions({
    context: sixFactorPolicyContext,
    path: "test_generation",
  });
  const skipOptionalShadowAfterApplyFailure =
    !sixFactorApply.applied &&
    sixFactorApply.warnings.some((warning) =>
      warning.startsWith("six_factor_apply_error:"),
    );

  let attempts = 0;
  let hadRetry = false;

  type TestGenerationSource = "llm" | "llm_repaired" | "fallback";

  let finalTestPayload: z.infer<typeof TestSchema> = fallbackTest(
    subject.title,
    params.payload.topic,
    params.payload.questionCount,
  );
  let finalRawLlmOutput = "";
  let finalGenerationSource: TestGenerationSource = "fallback";
  let finalGenerationError: string | null = "LLM_NOT_ATTEMPTED";
  let finalValidation = validateGeneratedTestArtifact({
    artifact: finalTestPayload,
    requestedQuestionCount: params.payload.questionCount,
    topic: params.payload.topic,
    subjectTitle: subject.title,
    source: "fallback",
  });
  let finalLlmJsonDiagnostics: LlmJsonCallDiagnostics | null = null;
  let finalJudge: GeneratedTestJudgeRun | null = null;
  let finalNormalizedQuestions: z.infer<typeof TestSchema>["questions"] =
    finalTestPayload.questions;
  let finalTaggingWarnings: string[] = [];
  let finalTaggingFallbackCount = 0;
  let finalTaggingSource: "llm" | "rule_fallback" | "mixed" = "rule_fallback";
  let finalFilteredAssignments: {
    questionIndex: number;
    axisId: string;
    tagId: string;
  }[] = [];
  let finalCompliance = computeUxCompliance(plan.appliedDelivery, []);
  let finalComplianceGate: UxComplianceGateDecision = evaluateUxComplianceGate({
    requestedDelivery: clientRequestedDelivery,
    observedTagsPerQuestion: [],
    hasManualDeliveryOverride,
    taggingSource: finalTaggingSource,
  });

  const maxAttempts = 1 + MAX_RETRIES;
  const sectionLine = section.sectionSnapshot
    ? `Section context: ${section.sectionSnapshot}`
    : "Section context: none";
  const pedagogicalLine = `Pedagogical targets: difficulty=${plan.pedagogicalDecision.difficulty}, depth=${plan.pedagogicalDecision.depth}.`;
  const renderingLine = `Presentation rules: tone=${plan.renderingDecision.tone}, explanation_style=${plan.renderingDecision.explanation_style}, response_format=${plan.renderingDecision.response_format}.`;
  let generationFeedback: string[] = [];

  while (attempts < maxAttempts) {
    attempts += 1;
    hadRetry = attempts > 1;

    let currentTestPayload: z.infer<typeof TestSchema> | null = null;
    let currentRawLlmOutput = "";
    let currentGenerationSource: TestGenerationSource = "llm";
    let currentGenerationError: string | null = null;
    let currentValidation: GeneratedTestValidationResult | null = null;
    let currentLlmJsonDiagnostics: LlmJsonCallDiagnostics | null = null;
    let currentJudge: GeneratedTestJudgeRun | null = null;

    const strictClause =
      hasRequestedUx && attempts > 1
        ? ` ${buildStrictDeliveryReinforcement(requestedUx)}`
        : "";
    const baseUserPrompt =
      generationPackage == null
        ? `Generate ${params.payload.questionCount} multiple-choice questions on ${params.payload.topic} for ${subject.title}. ${sectionLine} ${pedagogicalLine} ${renderingLine} Keep answers clear.`
        : buildTestGenerationPrompt(generationPackage);
    const testGenerationPrompt = appendPromptBlocks(baseUserPrompt, [
      generationFeedback.length > 0
        ? [
            "Regenerate the full MCQ TestSchema JSON. The previous response failed validation:",
            ...generationFeedback,
            "Do not reuse invalid answerIndex values, duplicate options, placeholder text, or the wrong question count.",
          ].join("\n")
        : null,
      strictClause.trim().length > 0
        ? `Retry delivery enforcement:\n${strictClause.trim()}`
        : null,
      sixFactorApply.promptInstructionBlock,
    ]);

    try {
      if (!llmGenerationAvailable) {
        throw new Error("LLM_GENERATION_DISABLED");
      }
      const response = await llmChatJsonWithRepair(
        {
          model: llmModel,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: testGenerationPrompt,
            },
          ],
        },
        TestSchema,
        {
          contractName: "TestSchema",
          repairAttempts: 1,
        },
      );
      currentLlmJsonDiagnostics = response.diagnostics;
      currentGenerationSource =
        response.diagnostics.finalSource === "llm_repaired"
          ? "llm_repaired"
          : response.diagnostics.finalSource === "llm"
            ? "llm"
            : "fallback";
      currentRawLlmOutput = response.raw ?? "";
      if (response.data == null) {
        currentGenerationError =
          response.diagnostics.providerError ??
          response.diagnostics.schemaError ??
          response.diagnostics.parseError ??
          "LLM_JSON_INVALID";
      } else {
        currentTestPayload = response.data;
      }
    } catch (error) {
      currentGenerationSource = "fallback";
      currentGenerationError = errorMessage(error);
      currentRawLlmOutput = "";
    }

    if (currentTestPayload == null) {
      finalRawLlmOutput = currentRawLlmOutput;
      finalGenerationError = currentGenerationError ?? "LLM_JSON_INVALID";
      finalLlmJsonDiagnostics = currentLlmJsonDiagnostics;
      generationFeedback = [finalGenerationError];
      if (attempts < maxAttempts) {
        continue;
      }
      currentGenerationSource = "fallback";
      currentGenerationError = currentGenerationError ?? "FALLBACK_GENERATION";
      currentTestPayload = fallbackTest(
        subject.title,
        params.payload.topic,
        params.payload.questionCount,
      );
    }

    currentValidation = validateGeneratedTestArtifact({
      artifact: currentTestPayload,
      requestedQuestionCount: params.payload.questionCount,
      topic: params.payload.topic,
      subjectTitle: subject.title,
      source: currentGenerationSource,
    });
    if (!currentValidation.valid && currentGenerationSource !== "fallback") {
      const messages = testValidationMessages(currentValidation);
      finalTestPayload = currentTestPayload;
      finalRawLlmOutput = currentRawLlmOutput;
      finalGenerationSource = currentGenerationSource;
      finalGenerationError = messages.join("; ");
      finalValidation = currentValidation;
      finalLlmJsonDiagnostics = currentLlmJsonDiagnostics;
      generationFeedback = messages;
      if (attempts < maxAttempts) {
        continue;
      }
      currentGenerationSource = "fallback";
      currentGenerationError = `FALLBACK_GENERATION_AFTER_VALIDATION_FAILURE: ${messages.join("; ")}`;
      currentTestPayload = fallbackTest(
        subject.title,
        params.payload.topic,
        params.payload.questionCount,
      );
      currentValidation = validateGeneratedTestArtifact({
        artifact: currentTestPayload,
        requestedQuestionCount: params.payload.questionCount,
        topic: params.payload.topic,
        subjectTitle: subject.title,
        source: "fallback",
      });
    }

    if (currentGenerationSource !== "fallback" && currentValidation.valid) {
      currentJudge = await judgeGeneratedTestArtifact({
        subjectTitle: subject.title,
        topic: params.payload.topic,
        sectionSnapshot: section.sectionSnapshot,
        artifact: currentTestPayload,
      });
      if (currentJudge.status === "failed") {
        const messages = currentJudge.issues.length
          ? currentJudge.issues
          : ["Semantic judge rejected the generated answer key."];
        finalTestPayload = currentTestPayload;
        finalRawLlmOutput = currentRawLlmOutput;
        finalGenerationSource = currentGenerationSource;
        finalGenerationError = `JUDGE_REJECTED: ${messages.join("; ")}`;
        finalValidation = currentValidation;
        finalLlmJsonDiagnostics = currentLlmJsonDiagnostics;
        finalJudge = currentJudge;
        generationFeedback = messages;
        if (attempts < maxAttempts) {
          continue;
        }
        currentGenerationSource = "fallback";
        currentGenerationError = `FALLBACK_GENERATION_AFTER_JUDGE_REJECTION: ${messages.join("; ")}`;
        currentTestPayload = fallbackTest(
          subject.title,
          params.payload.topic,
          params.payload.questionCount,
        );
        currentValidation = validateGeneratedTestArtifact({
          artifact: currentTestPayload,
          requestedQuestionCount: params.payload.questionCount,
          topic: params.payload.topic,
          subjectTitle: subject.title,
          source: "fallback",
        });
      }
    }

    const currentNormalizedQuestions = currentTestPayload.questions;

    let taggedQuestions: Awaited<ReturnType<typeof tagQuestionsWithLLM>> | null =
      null;
    const llmTaggingAvailable =
      !syntheticLlmDisabled &&
      typeof process.env.OPENAI_API_KEY === "string" &&
      process.env.OPENAI_API_KEY.trim().length > 0;
    if (llmTaggingAvailable) {
      try {
        taggedQuestions = await tagQuestionsWithLLM(currentNormalizedQuestions);
      } catch (error) {
        console.error("LLM tagger failed, using fallback", error);
        taggedQuestions = null;
      }
    }

    const taggingWarnings: string[] = [];
    let taggingFallbackCount = 0;
    const observedTagsPerQuestion: ObservedQuestionTags[] = [];
    const assignments = currentNormalizedQuestions.flatMap((question, index) => {
      const diagnostics = taggedQuestions?.[index] ?? null;
      const llmTags = diagnostics?.tags ?? null;
      if (!llmTags) {
        taggingFallbackCount += 1;
        if (diagnostics?.warnings && diagnostics.warnings.length > 0) {
          taggingWarnings.push(
            `question_${index}:llm_invalid_tags:${diagnostics.warnings.join(",")}`,
          );
        }
        taggingWarnings.push(`question_${index}:rule_fallback_applied`);
      }

      const tags = llmTags ?? tagQuestion(question.prompt);
      observedTagsPerQuestion[index] = tags;

      return Object.entries(tags).map(([axisKey, tagKey]) => {
        const axis = axisMap.get(axisKey);
        const tag = axis?.tags.find((entry) => entry.key === tagKey);
        if (!axis || !tag) {
          taggingWarnings.push(`question_${index}:invalid_${axisKey}_${tagKey}`);
          return null;
        }
        return {
          questionIndex: index,
          axisId: axis.id,
          tagId: tag.id,
        };
      });
    });

    const filteredAssignments = assignments.filter(Boolean) as {
      questionIndex: number;
      axisId: string;
      tagId: string;
    }[];

    let taggingSource: "llm" | "rule_fallback" | "mixed";
    if (taggingFallbackCount === 0) {
      taggingSource = "llm";
    } else if (taggingFallbackCount === currentNormalizedQuestions.length) {
      taggingSource = "rule_fallback";
    } else {
      taggingSource = "mixed";
    }

    const compliance = computeUxCompliance(plan.appliedDelivery, observedTagsPerQuestion);
    const complianceGate = evaluateUxComplianceGate({
      requestedDelivery: clientRequestedDelivery,
      observedTagsPerQuestion,
      hasManualDeliveryOverride,
      taggingSource,
    });

    finalTestPayload = currentTestPayload;
    finalRawLlmOutput = currentRawLlmOutput;
    finalGenerationSource = currentGenerationSource;
    finalGenerationError = currentGenerationError;
    finalValidation = currentValidation;
    finalLlmJsonDiagnostics = currentLlmJsonDiagnostics;
    finalJudge = currentJudge;
    finalNormalizedQuestions = currentNormalizedQuestions;
    finalTaggingWarnings = taggingWarnings;
    finalTaggingFallbackCount = taggingFallbackCount;
    finalTaggingSource = taggingSource;
    finalFilteredAssignments = filteredAssignments;
    finalCompliance = compliance;
    finalComplianceGate = complianceGate;

    const shouldRetry =
      complianceGate.status === "failed" &&
      attempts < maxAttempts &&
      taggingSource === "llm";
    if (shouldRetry) {
      continue;
    }

    break;
  }

  const generationIsLlm =
    finalGenerationSource === "llm" || finalGenerationSource === "llm_repaired";
  const hasInvalidTagWarnings = finalTaggingWarnings.some(
    (warning) =>
      warning.includes(":llm_invalid_tags:") || warning.includes(":invalid_"),
  );
  const taggingIsLlm = finalTaggingSource === "llm" && !hasInvalidTagWarnings;
  const learningEligible =
    generationIsLlm && taggingIsLlm && !finalComplianceGate.learningExclusion;

  let learningExcludedReason: string | null = null;
  if (!generationIsLlm) {
    learningExcludedReason = "FALLBACK_GENERATION";
  } else if (!taggingIsLlm) {
    learningExcludedReason = "FALLBACK_TAGGING";
  } else if (finalComplianceGate.learningExclusion) {
    learningExcludedReason = "LOW_UX_COMPLIANCE";
  }

  const sixFactorShadow =
    sixFactorApply.metadata ??
    (skipOptionalShadowAfterApplyFailure
      ? null
      : buildOptionalSixFactorShadowMetadata(sixFactorPolicyContext));
  const sixFactorDeliveredConfig =
    buildOptionalSixFactorDeliveredConfigMetadata({
      sixFactorShadow,
      decisionCreatedAt: sixFactorDecisionAtIso,
      featuresCutoffAt: sixFactorDecisionAtIso,
      appliedPath: "test_generation",
    });

  const saved = await prisma.$transaction(async (tx) => {
    const createdTest = await tx.generatedTest.create({
      data: {
        userId: params.user.id,
        subjectId: subject.id,
        sectionId: section.sectionId,
        evaluationEpisodeId: resolvedEpisode?.id ?? null,
        promptTemplateId: promptTemplate.id,
        llmModel,
        promptTemplateKey: promptTemplate.key,
        promptTemplateVersion: promptTemplate.version,
        promptTemplateSnapshot: promptTemplate.template,
        rawLlmOutput: finalRawLlmOutput,
        normalizedJson: finalNormalizedQuestions,
        validationMetaJson: toJsonValue({
          schemaVersion: 2,
          generatedTitle: finalTestPayload.title,
          attempts,
          hadRetry,
          lastError: finalGenerationError,
          fallback: finalGenerationSource === "fallback",
          generationSource: finalGenerationSource,
          generationError: finalGenerationError,
          generationFinalSource: finalGenerationSource,
          llmJsonDiagnostics: finalLlmJsonDiagnostics,
          validation: finalValidation,
          validationIssues: finalValidation.errors,
          validationWarnings: finalValidation.warnings,
          judgeStatus:
            finalJudge?.status ??
            (finalGenerationSource === "fallback" ? "not_run_fallback" : "not_run"),
          judgeIssues: finalJudge?.issues ?? [],
          judgeResult: finalJudge?.result ?? null,
          judgeDiagnostics: finalJudge?.diagnostics ?? null,
          taggingSource: finalTaggingSource,
          taggingFallback: finalTaggingFallbackCount > 0,
          taggingFallbackCount: finalTaggingFallbackCount,
          taggingWarnings: finalTaggingWarnings,
          learningEligible,
          learningExcludedReason,
          requestedDelivery: clientRequestedDelivery,
          appliedDelivery: plan.appliedDelivery,
          pedagogicalDecision: plan.pedagogicalDecision,
          renderingDecision: plan.renderingDecision,
          decisionContext: plan.decisionContext ?? null,
          decisionBackend: plan.decisionBackend,
          rulesLayer: plan.renderingRules,
          generationPackage,
          evaluation:
            testEvaluation == null
              ? null
              : {
                  ...testEvaluation,
                  episodeCreated: resolvedEpisode?.created ?? false,
                },
          deliveryCompliance: {
            ux: finalCompliance.ux,
          },
          deliveryComplianceGate: finalComplianceGate,
          deliveryComplianceFailed: finalComplianceGate.learningExclusion,
          policyMode: plan.policyMode,
          policyId: plan.policyId,
          policyMeta: plan.policyMeta,
          ...(sixFactorShadow ? { sixFactorShadow } : {}),
          ...(sixFactorDeliveredConfig ? { sixFactorDeliveredConfig } : {}),
        }),
        sectionSnapshot: section.sectionSnapshot,
        recommended: params.payload.recommended ?? false,
        recommendationSnapshot: plan.recommendationSnapshot ?? undefined,
        topic: params.payload.topic,
        questionCount: params.payload.questionCount,
        mode: params.payload.mode,
        questionsJson: finalNormalizedQuestions,
        profileSnapshotJson: toJsonValue({
          declared: declaredPreferences,
          effective: effectivePreferences,
          personalizationReady: params.user.personalizationReady,
        }),
      },
    });

    let evaluationItem: {
      id: string;
      episodeId: string;
      sequenceIndex: number;
    } | null = null;
    if (testEvaluation) {
      evaluationItem = await registerEvaluationEpisodeItem({
        prisma: tx,
        item: testEvaluation,
        contentId: createdTest.id,
        decisionRuntimeSupplement: sixFactorDeliveredConfig
          ? { sixFactorDeliveredConfig }
          : null,
      });
    }

    if (finalFilteredAssignments.length) {
      await tx.tagAssignment.createMany({
        data: finalFilteredAssignments.map((assignment) => ({
          testId: createdTest.id,
          questionIndex: assignment.questionIndex,
          axisId: assignment.axisId,
          tagId: assignment.tagId,
        })),
      });
    }

    return { test: createdTest, evaluationItem };
  });
  const savedTest = saved.test;

  logLearningQualityGateDecision({
    phase: "test_generation",
    testId: savedTest.id,
    episodeId: resolvedEpisode?.id ?? null,
    itemIds: saved.evaluationItem ? [saved.evaluationItem.id] : [],
    styleConsistencyScore: finalComplianceGate.styleConsistencyScore,
    minStyleAxisScore: finalComplianceGate.minAxisScore,
    thresholds: finalComplianceGate.thresholds,
    gateStatus: finalComplianceGate.status,
    reasonCode: learningExcludedReason,
    missingFields: finalComplianceGate.missingFields,
    decision: learningEligible ? "include" : "exclude",
    generationSource: finalGenerationSource,
    taggingSource: finalTaggingSource,
  });

  return {
    id: savedTest.id,
    evaluationEpisodeId: resolvedEpisode?.id ?? null,
    title: finalTestPayload.title,
    questions: finalNormalizedQuestions,
    questionCount: params.payload.questionCount,
    topic: params.payload.topic,
    generationPackage,
    evaluation: testEvaluation,
    pedagogicalDecision: plan.pedagogicalDecision,
    renderingDecision: plan.renderingDecision,
  };
}
