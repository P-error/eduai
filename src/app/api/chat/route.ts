import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { llmChatText } from "@/lib/llm/provider";
import { getActivePromptTemplate, renderPrompt } from "@/lib/prompts";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import { buildChatSystemPrompt } from "@/lib/llm-prompt-builders";
import {
  applyChatUxStats,
  clampAndTrimMessages,
  computeChatUxReward,
  storeChatTurn,
} from "@/lib/chat";
import {
  EVALUATION_HOLDOUT_STRATEGIES,
  EVALUATION_ITEM_ROLES,
  EVALUATION_ITEM_VARIANTS,
  EVALUATION_LINKAGE_KINDS,
  EVALUATION_POLICY_ARMS,
  EVALUATION_SEQUENCE_ROLES,
  EVALUATION_TOUCHPOINT_TYPES,
  buildEvaluationAssignment,
  buildEvaluationItemMeta,
  registerEvaluationEpisodeItem,
  resolveOrCreateEvaluationEpisode,
  resolveEvaluationPolicySelection,
  type EvaluationRequestInput,
} from "@/lib/evaluation";
import {
  getUserPresetForChat,
  V2_BASELINE_PEDAGOGY_PRESET,
  V2_BASELINE_UX_PRESET,
} from "@/lib/recommendation";
import {
  createDeclaredPreferenceMaterialization,
} from "@/lib/personalization-runtime";
import {
  buildOptionalSixFactorShadowMetadata,
  isSixFactorShadowEnabled,
} from "@/lib/ml-six-factor-shadow";
import { buildOptionalSixFactorDeliveredConfigMetadata } from "@/lib/ml-six-factor-decision-metadata";
import { buildLearnerStateAggregatesForSixFactorPolicy } from "@/lib/ml-six-factor-learner-state-features";
import { buildMlPersonalizationView } from "@/lib/ml-personalization-view";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";
import { sanitizePreferenceMap } from "@/lib/tags";

export const runtime = "nodejs";
export const maxDuration = 30;

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const ChatSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  personalizationMode: z.enum(["on", "off"]).optional(),
  context: z
    .object({
      subjectId: z.string().min(1).optional().nullable(),
      subjectTitle: z.string().min(1).optional().nullable(),
      sectionId: z.string().min(1).optional().nullable(),
      sectionPath: z.string().min(1).optional().nullable(),
      topic: z.string().min(1).optional().nullable(),
      conceptKey: z.string().min(1).optional().nullable(),
      skillKey: z.string().min(1).optional().nullable(),
      familyKey: z.string().min(1).optional().nullable(),
    })
    .optional(),
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
});

type ChatContextInput = NonNullable<z.infer<typeof ChatSchema>["context"]>;

async function resolveChatPromptContext(params: {
  userId: string;
  context: ChatContextInput | undefined;
  evaluation: EvaluationRequestInput | null;
  fallbackTopic: string;
}) {
  const requestedSubjectId = params.context?.subjectId ?? null;
  let subjectTitle = params.context?.subjectTitle ?? null;

  if (requestedSubjectId) {
    const subject = await prisma.subject.findFirst({
      where: {
        id: requestedSubjectId,
        userId: params.userId,
        archivedAt: null,
      },
      select: {
        id: true,
        title: true,
      },
    });
    if (!subject) {
      throw new Error("CHAT_SUBJECT_NOT_FOUND");
    }
    subjectTitle = subject.title;
  }

  return {
    subjectId: requestedSubjectId,
    subjectTitle,
    sectionId: params.context?.sectionId ?? null,
    sectionPath: params.context?.sectionPath ?? null,
    topic:
      params.context?.topic ??
      params.evaluation?.conceptKey ??
      params.evaluation?.skillKey ??
      params.evaluation?.familyKey ??
      params.fallbackTopic,
    conceptKey: params.context?.conceptKey ?? params.evaluation?.conceptKey ?? null,
    skillKey: params.context?.skillKey ?? params.evaluation?.skillKey ?? null,
    familyKey: params.context?.familyKey ?? params.evaluation?.familyKey ?? null,
  };
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  try {
    await rateLimitRouteOrThrow({
      routeClass: "chat_turn",
      request,
      userId: user.id,
    });
  } catch (error) {
    const response = buildRateLimitErrorResponse(
      error,
      "Learn generation rate limit reached. Please try again later.",
    );
    if (response) {
      return response;
    }
    throw error;
  }

  let payload: z.infer<typeof ChatSchema>;
  try {
    payload = ChatSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Invalid chat payload." },
      { status: 400 },
    );
  }

  const messages = clampAndTrimMessages(payload.messages);
  const evaluationRequest: EvaluationRequestInput | null =
    payload.evaluation ?? null;
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUserMessage || lastUserMessage.content.length === 0) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Last user message must be non-empty." },
      { status: 400 },
    );
  }

  let promptContext: Awaited<ReturnType<typeof resolveChatPromptContext>>;
  try {
    promptContext = await resolveChatPromptContext({
      userId: user.id,
      context: payload.context,
      evaluation: evaluationRequest,
      fallbackTopic: lastUserMessage.content.slice(0, 160),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CHAT_SUBJECT_NOT_FOUND") {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Subject not found." },
        { status: 400 },
      );
    }
    throw error;
  }

  const personalizationMode = payload.personalizationMode ?? "on";
  const declaredPreferences = sanitizePreferenceMap(
    (user.declaredPreferencesJson ?? {}) as Record<string, unknown>,
  );
  const effectivePreferences = sanitizePreferenceMap(
    (user.effectivePreferencesJson ?? {}) as Record<string, unknown>,
  );

  let policySelection;
  try {
    policySelection = resolveEvaluationPolicySelection({
      surface: "chat",
      requestedArm: evaluationRequest?.assignmentArm ?? null,
      personalizationMode,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("EVALUATION_ASSIGNMENT_")
    ) {
      return NextResponse.json(
        {
          error: "INVALID_EVALUATION_ASSIGNMENT",
          message: "Evaluation arm is invalid for the current chat runtime path.",
          details: { reason: error.message },
        },
        { status: 400 },
      );
    }
    throw error;
  }

  const selfReportMaterialization = createDeclaredPreferenceMaterialization({
    surface: "chat",
    declaredPreferences,
  });
  const baselinePreset = {
    uxPreset: { ...V2_BASELINE_UX_PRESET },
    pedagogyPreset: { ...V2_BASELINE_PEDAGOGY_PRESET },
    runtime: null,
    pedagogicalDecision: {
      difficulty: V2_BASELINE_PEDAGOGY_PRESET.difficulty_target,
      depth: V2_BASELINE_PEDAGOGY_PRESET.depth,
    },
    rulesLayer: {
      id: "rendering_rules_v1_2026_03",
      basis: "chat_baseline_default",
    },
  };
  const selfReportPreset = {
    uxPreset: selfReportMaterialization.materialization.uxPreset,
    pedagogyPreset: selfReportMaterialization.materialization.pedagogyPreset,
    runtime: null,
    pedagogicalDecision: selfReportMaterialization.pedagogicalDecision,
    rulesLayer: {
      id: selfReportMaterialization.materialization.rulesLayerId,
      basis: selfReportMaterialization.materialization.basis,
    },
  };
  const preset =
    policySelection.selectionMode === "self_report_declared"
      ? selfReportPreset
      : policySelection.selectionMode === "predicted_runtime" ||
          (policySelection.selectionMode === "observational_only" &&
            personalizationMode === "on")
        ? await getUserPresetForChat(user.id)
        : baselinePreset;

  const tone = preset.uxPreset.tone ?? V2_BASELINE_UX_PRESET.tone;
  const explanationStyle =
    preset.uxPreset.explanation_style ??
    V2_BASELINE_UX_PRESET.explanation_style;
  const responseFormat =
    preset.uxPreset.response_format ??
    V2_BASELINE_UX_PRESET.response_format;
  const difficulty =
    preset.pedagogicalDecision?.difficulty ??
    preset.pedagogyPreset.difficulty_target ??
    V2_BASELINE_PEDAGOGY_PRESET.difficulty_target;
  const depth =
    preset.pedagogicalDecision?.depth ??
    preset.pedagogyPreset.depth ??
    V2_BASELINE_PEDAGOGY_PRESET.depth;
  const evaluationAssignment = buildEvaluationAssignment({
    selection: policySelection,
    runtimePolicyId: preset.runtime?.policyId ?? null,
    backendKind: preset.runtime?.backendKind ?? null,
    backendId: preset.runtime?.backendId ?? null,
  });
  const resolvedPersonalizationMode =
    evaluationAssignment.personalizationMode ?? personalizationMode;
  const policyMode = evaluationAssignment.policyMode;
  const policyId = evaluationAssignment.policyId;
  const decisionAt = new Date();
  const decisionAtIso = decisionAt.toISOString();
  const sixFactorLearnerStateAggregates = isSixFactorShadowEnabled()
    ? await buildLearnerStateAggregatesForSixFactorPolicy({
        prisma,
        userId: user.id,
        subjectId: promptContext.subjectId,
        topicRef: promptContext.conceptKey ?? promptContext.skillKey ?? null,
        conceptKey: promptContext.conceptKey,
        skillKey: promptContext.skillKey,
        familyKey: promptContext.familyKey,
        topic: promptContext.topic,
        evaluationEpisodeId: evaluationRequest?.episodeId ?? null,
        decisionCreatedAt: decisionAt,
      })
    : null;
  const sixFactorPolicyContext = {
    userRef: user.id,
    subjectRef: promptContext.subjectId,
    topicRef: promptContext.conceptKey ?? promptContext.skillKey ?? null,
    conceptKey: promptContext.conceptKey,
    skillKey: promptContext.skillKey,
    familyKey: promptContext.familyKey,
    topic: promptContext.topic,
    sessionRef: evaluationRequest?.episodeId ?? null,
    ...(sixFactorLearnerStateAggregates ?? {}),
    previousDifficulty: difficulty,
    previousDepth: depth,
    declaredPreferences,
    policyId,
    backendKind: preset.runtime?.backendKind ?? null,
    modelVersion: preset.runtime?.policyVersion ?? null,
  };
  const sixFactorApply = buildAppliedSixFactorPromptInstructions({
    context: sixFactorPolicyContext,
    path: "chat",
  });
  const skipOptionalShadowAfterApplyFailure =
    !sixFactorApply.applied &&
    sixFactorApply.warnings.some((warning) =>
      warning.startsWith("six_factor_apply_error:"),
    );
  const sixFactorShadow =
    sixFactorApply.metadata ??
    (skipOptionalShadowAfterApplyFailure
      ? null
      : buildOptionalSixFactorShadowMetadata(sixFactorPolicyContext));
  const sixFactorDeliveredConfig =
    buildOptionalSixFactorDeliveredConfigMetadata({
      sixFactorShadow,
      decisionCreatedAt: decisionAtIso,
      featuresCutoffAt: decisionAtIso,
      appliedPath: "chat",
    });
  const sixFactorPersonalization =
    buildMlPersonalizationView(sixFactorDeliveredConfig);

  let systemTemplate;
  try {
    systemTemplate = await getActivePromptTemplate("chat_system_v1");
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Chat prompt template unavailable." },
      { status: 500 },
    );
  }

  const baseSystemPrompt = renderPrompt(systemTemplate.template, {
    declared: JSON.stringify(declaredPreferences),
    effective: JSON.stringify(effectivePreferences),
    ready: user.personalizationReady,
  });
  const systemPrompt = buildChatSystemPrompt({
    baseInstruction: baseSystemPrompt,
    profile: {
      userRef: user.id,
      personalizationReady: user.personalizationReady,
      declaredPreferences,
      effectivePreferences,
    },
    subjectTopic: promptContext,
    learnerStateAggregates: sixFactorApply.applied
      ? sixFactorLearnerStateAggregates
      : null,
    sixFactorPromptInstructionBlock: sixFactorApply.promptInstructionBlock,
    tone,
    explanationStyle,
    responseFormat,
    difficulty,
    depth,
  });

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const startedAt = Date.now();
  let reply: string;
  try {
    reply = await llmChatText({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: llmMessages,
    });
  } catch {
    return NextResponse.json(
      { error: "LLM_BAD_RESPONSE", message: "Unable to generate chat reply." },
      { status: 502 },
    );
  }
  const turnLatencyMs = Date.now() - startedAt;

  const uxRewardChat = computeChatUxReward(reply.length);
  const uxUpdate = await applyChatUxStats({
    userId: user.id,
    tone,
    explanationStyle,
    reward: uxRewardChat,
  });
  let chatEvaluation: ReturnType<typeof buildEvaluationItemMeta> | null = null;
  let evaluationEpisodeId: string | null = null;

  if (evaluationRequest) {
    try {
      const episode = await resolveOrCreateEvaluationEpisode({
        prisma,
        userId: user.id,
        requested: evaluationRequest,
        assignment: evaluationAssignment,
        conceptKey: evaluationRequest.conceptKey ?? null,
        skillKey: evaluationRequest.skillKey ?? null,
      });
      evaluationEpisodeId = episode.episode.id;
      chatEvaluation = buildEvaluationItemMeta({
        episodeId: episode.episode.id,
        assignment: evaluationAssignment,
        requested: evaluationRequest,
        contentKind: "chat_session",
        signalQuality: "secondary_chat_support",
        protocolKey: episode.episode.protocolKey,
        pedagogicalDecision: {
          difficulty,
          depth,
        },
        runtimePolicyId: preset.runtime?.policyId ?? null,
        backendKind: preset.runtime?.backendKind ?? null,
        backendId: preset.runtime?.backendId ?? null,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("EVALUATION_EPISODE_")) {
        return NextResponse.json(
          {
            error: "INVALID_EVALUATION_EPISODE",
            message: "Evaluation episode linkage is invalid for this chat request.",
            details: { reason: error.message },
          },
          { status: 400 },
        );
      }
      throw error;
    }
  }

  const eventAtIso = decisionAtIso;
  const eventMeta = {
    source: "chat" as const,
    atIso: eventAtIso,
    deliveryMode: "user_chat" as const,
    personalizationMode: resolvedPersonalizationMode,
    policyMode,
    policyId,
    uxPreset: {
      tone,
      explanation_style: explanationStyle,
    },
    pedagogicalDecision: {
      difficulty,
      depth,
    },
    rulesLayer: preset.rulesLayer,
    evaluationSignal: {
      quality: "secondary_chat_support",
      role: "supporting_secondary",
      testsRemainPrimary: true,
    },
    evaluation: chatEvaluation,
    messageStats: {
      userChars: lastUserMessage.content.length,
      assistantChars: reply.length,
      turnLatencyMs,
    },
    learning: {
      uxUpdated: uxUpdate.updated,
      skipReason: uxUpdate.reason,
      uxRewardChat,
    },
    ...(sixFactorShadow ? { sixFactorShadow } : {}),
    ...(sixFactorDeliveredConfig ? { sixFactorDeliveredConfig } : {}),
  };

  try {
    await prisma.$transaction(async (tx) => {
      const stored = await storeChatTurn({
        userId: user.id,
        userMessage: lastUserMessage.content,
        assistantReply: reply,
        eventMeta,
        evaluationEpisodeId,
        sessionMeta: {
          promptTemplateId: systemTemplate.id,
          llmModel: "gpt-4o-mini",
          promptTemplateKey: systemTemplate.key,
          promptTemplateVersion: systemTemplate.version,
          promptTemplateSnapshot: systemTemplate.template,
          declaredPreferencesJson: declaredPreferences,
          effectivePreferencesJson: effectivePreferences,
          personalizationReady: user.personalizationReady,
        },
        prismaClient: tx,
      });

      if (chatEvaluation) {
        await registerEvaluationEpisodeItem({
          prisma: tx,
          item: chatEvaluation,
          contentId: stored.sessionId,
          decisionRuntimeSupplement: sixFactorDeliveredConfig
            ? { sixFactorDeliveredConfig }
            : null,
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("EVALUATION_EPISODE_")) {
      return NextResponse.json(
        {
          error: "INVALID_EVALUATION_EPISODE",
          message: "Evaluation protocol registration failed for this chat request.",
          details: { reason: error.message },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to store chat signals." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    reply,
    meta: {
      policyMode,
      policyId,
      uxPreset: {
        tone,
        explanation_style: explanationStyle,
        response_format: responseFormat,
      },
      pedagogicalDecision: {
        difficulty,
        depth,
      },
      evaluationSignal: {
        quality: "secondary_chat_support",
        role: "supporting_secondary",
      },
      ...(sixFactorPersonalization
        ? { sixFactorPersonalization }
        : {}),
      signalsStored: true,
    },
  });
}
