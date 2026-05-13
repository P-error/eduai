import { z } from "zod";
import { getActivePromptTemplate, renderPrompt } from "@/lib/prompts";
import { llmChatJsonWithRaw } from "@/lib/llm/provider";
import { createChatSessionWithMessages, type ChatSessionMeta } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import {
  appendPromptBlocks,
  buildLearningContentSystemPrompt,
} from "@/lib/llm-prompt-builders";
import {
  buildEvaluationItemMeta,
  registerEvaluationEpisodeItem,
  resolveOrCreateEvaluationEpisode,
  type EvaluationAssignmentMeta,
  type EvaluationItemMeta,
  type EvaluationRequestInput,
} from "@/lib/evaluation";
import {
  buildLearningContentPrompt,
  renderLearningContentCard,
  LEARNING_CONTENT_CARD_SCHEMA_VERSION,
  type LearningContentCard,
  type LearningContentGenerationPackage,
} from "@/lib/episode-generation";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import { buildOptionalSixFactorDeliveredConfigMetadata } from "@/lib/ml-six-factor-decision-metadata";
import {
  buildOptionalSixFactorShadowMetadata,
  isSixFactorShadowEnabled,
} from "@/lib/ml-six-factor-shadow";
import { buildLearnerStateAggregatesForSixFactorPolicy } from "@/lib/ml-six-factor-learner-state-features";
import { sanitizePreferenceMap } from "@/lib/tags";
import { type GenerateTestUser } from "@/lib/test-generation";
import { type TrainingDatasetCollectionMeta } from "@/lib/training-dataset-contract";

const LearningContentCardSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(500),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(80),
        body: z.string().min(1).max(600),
      }),
    )
    .min(2)
    .max(4),
  reflectionPrompt: z.string().min(1).max(220),
});

export type GenerateLearningContentPlan = {
  personalizationMode: "on" | "off";
  assignment: EvaluationAssignmentMeta;
  policyMode: string | null;
  policyId: string | null;
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
};

export type GenerateLearningContentParams = {
  user: GenerateTestUser;
  subject: {
    id: string;
    title: string;
  };
  sectionId?: string | null;
  sectionSnapshot?: string | null;
  topic: string;
  evaluation: EvaluationRequestInput;
  familyKey: string;
  plan: GenerateLearningContentPlan;
  priorTestOutcome?: {
    contentId: string;
    accuracy: number | null;
    questionCount: number | null;
    totalDurationMs: number | null;
    submittedAtIso: string | null;
  } | null;
} & TrainingDatasetCollectionMeta;

export type GeneratedLearningContentArtifact = {
  sessionId: string;
  evaluationEpisodeId: string;
  evaluation: EvaluationItemMeta;
  generationSource: "llm" | "fallback";
  generationPackage: LearningContentGenerationPackage;
  card: LearningContentCard;
  renderedContent: string;
};

function buildFallbackCard(params: {
  topic: string;
  difficulty: string;
  depth: string;
  tone: string;
  explanationStyle: string;
  priorTestOutcome?: GenerateLearningContentParams["priorTestOutcome"];
}) {
  const priorAccuracy =
    params.priorTestOutcome?.accuracy != null
      ? `${Math.round(params.priorTestOutcome.accuracy * 100)}%`
      : "unknown";

  return {
    schemaVersion: LEARNING_CONTENT_CARD_SCHEMA_VERSION,
    title: `${params.topic}: guided explanation`,
    summary: `This episode step explains the core idea at ${params.difficulty} difficulty and ${params.depth} depth.`,
    sections: [
      {
        heading: "Core idea",
        body: `Focus on the main concept behind ${params.topic} and keep the explanation ${params.explanationStyle} in a ${params.tone} tone.`,
      },
      {
        heading: "How to use it",
        body: `Connect the explanation to the next assessment step. The latest precheck accuracy in this episode was ${priorAccuracy}.`,
      },
      {
        heading: "What to remember",
        body: "Retain one clear rule, one example pattern, and one mistake to avoid before moving to the next test step.",
      },
    ],
    reflectionPrompt: `What is the key idea you would use to solve the next task on ${params.topic}?`,
  } satisfies LearningContentCard;
}

function buildLearningContentPackage(params: {
  episodeId: string;
  protocolKey: string;
  subjectId: string;
  subjectTitle: string;
  sectionId: string | null;
  sectionSnapshot: string | null;
  topic: string;
  conceptKey: string | null;
  skillKey: string | null;
  familyKey: string;
  plan: GenerateLearningContentPlan;
  evaluation: EvaluationItemMeta;
  priorTestOutcome?: GenerateLearningContentParams["priorTestOutcome"];
}) {
  return {
    schemaVersion: "episode_generation_package_v1_2026_03",
    episodeId: params.episodeId,
    protocolKey: params.protocolKey,
    contentKind: "chat_session",
    sequenceRole: params.evaluation.sequenceRole,
    touchpointType: params.evaluation.touchpointType,
    pedagogicalDecision: params.plan.pedagogicalDecision,
    rendering: {
      tone: params.plan.renderingDecision.tone,
      explanationStyle: params.plan.renderingDecision.explanation_style,
      responseFormat: params.plan.renderingDecision.response_format,
      rulesLayer: params.plan.renderingRules,
      renderingDecision: {
        tone: params.plan.renderingDecision.tone,
        explanationStyle: params.plan.renderingDecision.explanation_style,
        responseFormat: params.plan.renderingDecision.response_format,
        presentationMode: "structured_chat",
        formattingHint:
          params.plan.pedagogicalDecision.depth === "detailed"
            ? "scaffolded"
            : params.plan.pedagogicalDecision.depth === "brief"
              ? "brief"
              : "balanced",
      },
    },
    policy: {
      arm: params.plan.assignment.arm,
      policyMode: params.plan.policyMode,
      policyId: params.plan.policyId,
      assignmentSource: params.plan.assignment.assignmentSource,
      personalizationMode: params.plan.personalizationMode,
    },
    scope: {
      subjectId: params.subjectId,
      subjectTitle: params.subjectTitle,
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
    priorTestOutcome: params.priorTestOutcome ?? null,
    contentFormat: "structured_explanation_card",
    outputContract: {
      kind: "learning_content_card",
      schemaVersion: LEARNING_CONTENT_CARD_SCHEMA_VERSION,
    },
  } satisfies LearningContentGenerationPackage;
}

export async function generateLearningContentForEpisode(
  params: GenerateLearningContentParams,
): Promise<GeneratedLearningContentArtifact> {
  const declaredPreferences = sanitizePreferenceMap(
    (params.user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
  );
  const effectivePreferences = sanitizePreferenceMap(
    (params.user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
  );

  const resolvedEpisode = await resolveOrCreateEvaluationEpisode({
    prisma,
    userId: params.user.id,
    subjectId: params.subject.id,
    sectionId: params.sectionId ?? null,
    topic: params.topic,
    conceptKey: params.evaluation.conceptKey ?? null,
    skillKey: params.evaluation.skillKey ?? null,
    datasetPhase: params.datasetPhase ?? null,
    datasetOrigin: params.datasetOrigin ?? null,
    requested: params.evaluation,
    assignment: params.plan.assignment,
  });

  const evaluation = buildEvaluationItemMeta({
    episodeId: resolvedEpisode.episode.id,
    assignment: params.plan.assignment,
    requested: params.evaluation,
    contentKind: "chat_session",
    signalQuality: "secondary_chat_support",
    protocolKey: resolvedEpisode.episode.protocolKey,
    topic: params.topic,
    subjectId: params.subject.id,
    sectionId: params.sectionId ?? null,
    pedagogicalDecision: params.plan.pedagogicalDecision,
    runtimePolicyId: params.plan.assignment.runtimePolicyId,
    backendKind: params.plan.assignment.backendKind,
    backendId: params.plan.assignment.backendId,
  });

  const generationPackage = buildLearningContentPackage({
    episodeId: resolvedEpisode.episode.id,
    protocolKey: resolvedEpisode.episode.protocolKey,
    subjectId: params.subject.id,
    subjectTitle: params.subject.title,
    sectionId: params.sectionId ?? null,
    sectionSnapshot: params.sectionSnapshot ?? null,
    topic: params.topic,
    conceptKey: params.evaluation.conceptKey ?? null,
    skillKey: params.evaluation.skillKey ?? null,
    familyKey: params.familyKey,
    plan: params.plan,
    evaluation,
    priorTestOutcome: params.priorTestOutcome,
  });
  const sixFactorDecisionAt = new Date();
  const sixFactorDecisionAtIso = sixFactorDecisionAt.toISOString();
  const learnerStateAggregates = isSixFactorShadowEnabled()
    ? await buildLearnerStateAggregatesForSixFactorPolicy({
        prisma,
        userId: params.user.id,
        subjectId: params.subject.id,
        topicRef: params.evaluation.conceptKey ?? null,
        conceptKey: params.evaluation.conceptKey ?? null,
        skillKey: params.evaluation.skillKey ?? null,
        familyKey: params.familyKey,
        topic: params.topic,
        evaluationEpisodeId: resolvedEpisode.episode.id,
        decisionCreatedAt: sixFactorDecisionAt,
      })
    : {};
  const sixFactorPolicyContext = {
    userRef: params.user.id,
    subjectRef: params.subject.id,
    topicRef: params.evaluation.conceptKey ?? null,
    conceptKey: params.evaluation.conceptKey ?? null,
    skillKey: params.evaluation.skillKey ?? null,
    familyKey: params.familyKey,
    topic: params.topic,
    sessionRef: resolvedEpisode.episode.id,
    ...learnerStateAggregates,
    previousDifficulty: params.plan.pedagogicalDecision.difficulty,
    previousDepth: params.plan.pedagogicalDecision.depth,
    declaredPreferences: declaredPreferences,
    policyId: params.plan.policyId,
    backendKind: params.plan.assignment.backendKind,
    modelVersion: null,
  };
  const sixFactorApply = buildAppliedSixFactorPromptInstructions({
    context: sixFactorPolicyContext,
    path: "learning_content",
  });

  const promptTemplate = await getActivePromptTemplate("learning_content_v1");
  const baseSystemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(declaredPreferences),
    effective: JSON.stringify(effectivePreferences),
    ready: params.user.personalizationReady,
  });
  const systemPrompt = buildLearningContentSystemPrompt({
    baseInstruction: baseSystemPrompt,
    profile: {
      userRef: params.user.id,
      personalizationReady: params.user.personalizationReady,
      declaredPreferences,
      effectivePreferences,
    },
  });
  const baseLearningContentPrompt = buildLearningContentPrompt(generationPackage);
  const learningContentPrompt = appendPromptBlocks(baseLearningContentPrompt, [
    sixFactorApply.promptInstructionBlock,
  ]);

  let generationSource: "llm" | "fallback" = "llm";
  let card: LearningContentCard;
  try {
    const syntheticLlmDisabled = (() => {
      const raw = process.env.EDUAI_SYNTHETIC_DISABLE_LLM?.trim().toLowerCase();
      return raw === "1" || raw === "true" || raw === "yes";
    })();
    const llmGenerationAvailable =
      !syntheticLlmDisabled &&
      typeof process.env.OPENAI_API_KEY === "string" &&
      process.env.OPENAI_API_KEY.trim().length > 0;
    if (!llmGenerationAvailable) {
      throw new Error("LLM_GENERATION_DISABLED");
    }
    const response = await llmChatJsonWithRaw(
      {
        model: "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: learningContentPrompt,
          },
        ],
      },
      LearningContentCardSchema,
    );
    card = {
      schemaVersion: LEARNING_CONTENT_CARD_SCHEMA_VERSION,
      ...response.data,
    };
  } catch {
    generationSource = "fallback";
    card = buildFallbackCard({
      topic: params.topic,
      difficulty: params.plan.pedagogicalDecision.difficulty,
      depth: params.plan.pedagogicalDecision.depth,
      tone: params.plan.renderingDecision.tone,
      explanationStyle: params.plan.renderingDecision.explanation_style,
      priorTestOutcome: params.priorTestOutcome ?? null,
    });
  }

  const renderedContent = renderLearningContentCard(card);
  const skipOptionalShadowAfterApplyFailure =
    !sixFactorApply.applied &&
    sixFactorApply.warnings.some((warning) =>
      warning.startsWith("six_factor_apply_error:"),
    );
  const sixFactorShadowBase =
    sixFactorApply.metadata ??
    (skipOptionalShadowAfterApplyFailure
      ? null
      : buildOptionalSixFactorShadowMetadata(sixFactorPolicyContext));
  const sixFactorShadow =
    sixFactorShadowBase && sixFactorApply.applied && generationSource === "fallback"
      ? {
          ...sixFactorShadowBase,
          warnings: [
            ...sixFactorShadowBase.warnings,
            "six_factor_apply_warning: LLM generation was unavailable; fallback content may only partially reflect six-factor render instructions.",
          ],
        }
      : sixFactorShadowBase;
  const sixFactorDeliveredConfig =
    buildOptionalSixFactorDeliveredConfigMetadata({
      sixFactorShadow,
      decisionCreatedAt: sixFactorDecisionAtIso,
      featuresCutoffAt: sixFactorDecisionAtIso,
      appliedPath: "learning_content",
    });
  const sessionMeta: ChatSessionMeta = {
    subjectId: params.subject.id,
    promptTemplateId: promptTemplate.id,
    llmModel: "gpt-4o-mini",
    promptTemplateKey: promptTemplate.key,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateSnapshot: promptTemplate.template,
    declaredPreferencesJson: declaredPreferences,
    effectivePreferencesJson: effectivePreferences,
    personalizationReady: params.user.personalizationReady,
  };

  const stored = await prisma.$transaction(async (tx) => {
    const session = await createChatSessionWithMessages({
      userId: params.user.id,
      messages: [
        {
          role: "assistant",
          content: renderedContent,
          signalsJson: {
            source: "chat",
            atIso: new Date().toISOString(),
            deliveryMode: "episode_learning_content",
            personalizationMode: params.plan.personalizationMode,
            policyMode: params.plan.policyMode,
            policyId: params.plan.policyId,
            uxPreset: {
              tone: params.plan.renderingDecision.tone,
              explanation_style: params.plan.renderingDecision.explanation_style,
            },
            pedagogicalDecision: params.plan.pedagogicalDecision,
            rulesLayer: params.plan.renderingRules,
            generationSource,
            generationPackage,
            learningContentCard: card,
            evaluationSignal: {
              quality: "secondary_chat_support",
              role: "supporting_secondary",
              testsRemainPrimary: true,
            },
            evaluation,
            ...(sixFactorShadow ? { sixFactorShadow } : {}),
            ...(sixFactorDeliveredConfig ? { sixFactorDeliveredConfig } : {}),
            messageStats: {
              userChars: 0,
              assistantChars: renderedContent.length,
              turnLatencyMs: 0,
            },
            learning: {
              uxUpdated: false,
              skipReason: "EPISODE_CONTENT_STEP",
              uxRewardChat: null,
            },
          },
        },
      ],
      evaluationEpisodeId: resolvedEpisode.episode.id,
      sessionMeta,
      prismaClient: tx,
    });

    await registerEvaluationEpisodeItem({
      prisma: tx,
      item: evaluation,
      contentId: session.sessionId,
      decisionRuntimeSupplement: sixFactorDeliveredConfig
        ? { sixFactorDeliveredConfig }
        : null,
    });

    return session;
  });

  return {
    sessionId: stored.sessionId,
    evaluationEpisodeId: resolvedEpisode.episode.id,
    evaluation,
    generationSource,
    generationPackage,
    card,
    renderedContent,
  };
}
