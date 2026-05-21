import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeLayeredPreferences, isPersonalizationReady } from "@/lib/statistics";
import { TAGS_BY_AXIS } from "@/lib/tags";
import { type EduAISixFactorMlConfigV1 } from "@/lib/ml-six-factor-policy-contract";

export const CHAT_MAX_MESSAGES = 20;
export const LEARNING_DIALOGUE_MAX_LEARNER_TURNS = 4;
export const LEARNING_DIALOGUE_MAX_MESSAGE_CHARS = 600;

const REDACTED_USER_MESSAGE = "[redacted_user_message]";
const REDACTED_ASSISTANT_MESSAGE = "[redacted_assistant_message]";

export type ChatInputMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatPolicy = {
  personalizationMode: "on" | "off";
  policyMode: string | null;
  policyId: string | null;
  uxPreset: {
    tone: string;
    explanation_style: string;
    response_format: string;
  };
  pedagogyPreset: {
    difficulty_target: string;
    depth: string;
  };
  pedagogicalDecision?: {
    difficulty: string;
    depth: string;
  };
};

export type ChatEventMeta = {
  source: "chat";
  atIso: string;
  deliveryMode?:
    | "user_chat"
    | "episode_learning_content"
    | "episode_learning_dialogue";
  personalizationMode: "on" | "off";
  policyMode: string | null;
  policyId: string | null;
  uxPreset: { tone: string; explanation_style: string };
  pedagogicalDecision?: {
    difficulty: string;
    depth: string;
    compatibilityRole?: string;
    derivedFrom?: string;
    sixFactorConfig?: EduAISixFactorMlConfigV1;
  };
  rulesLayer?: { id: string; basis: string };
  generationSource?: "llm" | "llm_repaired" | "fallback";
  generationPackage?: Record<string, unknown> | null;
  learningContentCard?: Record<string, unknown> | null;
  evaluationSignal?: {
    quality: string;
    role: string;
    testsRemainPrimary?: boolean;
  };
  evaluation?: Record<string, unknown> | null;
  messageStats: {
    userChars: number;
    assistantChars: number;
    turnLatencyMs: number;
  };
  learning: {
    uxUpdated: boolean;
    skipReason: string | null;
    uxRewardChat: number | null;
  };
};

type StoredChatMessageInput = {
  role: "user" | "assistant";
  content: string;
  signalsJson?: Record<string, unknown> | null;
};

function toChatSignalsJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type ChatSessionMeta = {
  subjectId?: string | null;
  promptTemplateId?: string | null;
  llmModel?: string | null;
  promptTemplateKey?: string | null;
  promptTemplateVersion?: number | null;
  promptTemplateSnapshot?: string | null;
  declaredPreferencesJson?: Record<string, unknown> | null;
  effectivePreferencesJson?: Record<string, unknown> | null;
  personalizationReady?: boolean;
};

function ensureAllowed(axis: "tone" | "explanation_style", value: string) {
  const allowed = TAGS_BY_AXIS[axis].map((tag) => tag.key);
  if (allowed.includes(value)) return value;
  return TAGS_BY_AXIS[axis][0].key;
}

// v1 chat reward is intentionally weak and conservative.
// It is a proxy engagement signal, not a learning outcome metric.
export function computeChatUxReward(assistantChars: number) {
  if (!Number.isFinite(assistantChars) || assistantChars <= 0) return null;
  if (assistantChars < 80) return 0.35;
  if (assistantChars > 1600) return 0.35;
  return 0.5;
}

export function clampAndTrimMessages(messages: ChatInputMessage[]) {
  return messages
    .slice(-CHAT_MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function shouldStoreRawContent() {
  return process.env.CHAT_STORE_RAW_CONTENT === "1";
}

function buildStoredChatContent(role: StoredChatMessageInput["role"], content: string) {
  if (shouldStoreRawContent()) {
    return content;
  }
  return role === "user" ? REDACTED_USER_MESSAGE : REDACTED_ASSISTANT_MESSAGE;
}

function buildStoredChatMessageData(messages: StoredChatMessageInput[]) {
  const storeRawContent = shouldStoreRawContent();

  return messages.map((message) => ({
    role: message.role,
    content: buildStoredChatContent(message.role, message.content),
    signalsJson:
      message.signalsJson == null
        ? Prisma.JsonNull
        : toChatSignalsJson({
            ...message.signalsJson,
            rawStored: storeRawContent,
          }),
  }));
}

export async function storeChatTurn(params: {
  userId: string;
  userMessage: string;
  assistantReply: string;
  eventMeta: ChatEventMeta;
  evaluationEpisodeId?: string | null;
  sessionMeta?: ChatSessionMeta;
  prismaClient?: PrismaClient | Prisma.TransactionClient;
  userDisplayContent?: string | null;
  assistantDisplayContent?: string | null;
}) {
  const client = params.prismaClient ?? prisma;
  const session = await client.chatSession.create({
    data: {
      userId: params.userId,
      subjectId: params.sessionMeta?.subjectId ?? null,
      evaluationEpisodeId: params.evaluationEpisodeId ?? null,
      promptTemplateId: params.sessionMeta?.promptTemplateId ?? null,
      llmModel: params.sessionMeta?.llmModel ?? null,
      promptTemplateKey: params.sessionMeta?.promptTemplateKey ?? null,
      promptTemplateVersion: params.sessionMeta?.promptTemplateVersion ?? null,
      promptTemplateSnapshot: params.sessionMeta?.promptTemplateSnapshot ?? null,
      declaredPreferencesJson:
        params.sessionMeta?.declaredPreferencesJson == null
          ? Prisma.JsonNull
          : toChatSignalsJson(params.sessionMeta.declaredPreferencesJson),
      effectivePreferencesJson:
        params.sessionMeta?.effectivePreferencesJson == null
          ? Prisma.JsonNull
          : toChatSignalsJson(params.sessionMeta.effectivePreferencesJson),
      personalizationReady: params.sessionMeta?.personalizationReady ?? false,
    },
    select: { id: true },
  });

  await appendChatMessagesToSession({
    sessionId: session.id,
    messages: [
      {
        role: "user",
        content: params.userMessage,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          role: "user",
          uiThreadText: params.userDisplayContent ?? undefined,
        },
      },
      {
        role: "assistant",
        content: params.assistantReply,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          role: "assistant",
          uiThreadText: params.assistantDisplayContent ?? undefined,
        },
      },
    ],
    prismaClient: client,
  });

  return {
    sessionId: session.id,
  };
}

export async function createChatSessionWithMessages(params: {
  userId: string;
  messages: StoredChatMessageInput[];
  evaluationEpisodeId?: string | null;
  sessionMeta?: ChatSessionMeta;
  prismaClient?: PrismaClient | Prisma.TransactionClient;
}) {
  const client = params.prismaClient ?? prisma;

  const session = await client.chatSession.create({
    data: {
      userId: params.userId,
      subjectId: params.sessionMeta?.subjectId ?? null,
      evaluationEpisodeId: params.evaluationEpisodeId ?? null,
      promptTemplateId: params.sessionMeta?.promptTemplateId ?? null,
      llmModel: params.sessionMeta?.llmModel ?? null,
      promptTemplateKey: params.sessionMeta?.promptTemplateKey ?? null,
      promptTemplateVersion: params.sessionMeta?.promptTemplateVersion ?? null,
      promptTemplateSnapshot: params.sessionMeta?.promptTemplateSnapshot ?? null,
      declaredPreferencesJson:
        params.sessionMeta?.declaredPreferencesJson == null
          ? Prisma.JsonNull
          : toChatSignalsJson(params.sessionMeta.declaredPreferencesJson),
      effectivePreferencesJson:
        params.sessionMeta?.effectivePreferencesJson == null
          ? Prisma.JsonNull
          : toChatSignalsJson(params.sessionMeta.effectivePreferencesJson),
      personalizationReady: params.sessionMeta?.personalizationReady ?? false,
    },
    select: { id: true },
  });

  await appendChatMessagesToSession({
    sessionId: session.id,
    messages: params.messages,
    prismaClient: client,
  });

  return {
    sessionId: session.id,
  };
}

export async function appendChatMessagesToSession(params: {
  sessionId: string;
  messages: StoredChatMessageInput[];
  prismaClient?: PrismaClient | Prisma.TransactionClient;
}) {
  const client = params.prismaClient ?? prisma;
  if (params.messages.length === 0) {
    return;
  }

  await client.chatMessage.createMany({
    data: buildStoredChatMessageData(params.messages).map((message) => ({
      sessionId: params.sessionId,
      role: message.role,
      content: message.content,
      signalsJson: message.signalsJson,
    })),
  });

  await client.chatSession.update({
    where: { id: params.sessionId },
    data: { updatedAt: new Date() },
  });
}

export async function appendChatTurnToSession(params: {
  sessionId: string;
  userMessage: string;
  assistantReply: string;
  eventMeta: ChatEventMeta;
  prismaClient?: PrismaClient | Prisma.TransactionClient;
  userDisplayContent?: string | null;
  assistantDisplayContent?: string | null;
}) {
  await appendChatMessagesToSession({
    sessionId: params.sessionId,
    messages: [
      {
        role: "user",
        content: params.userMessage,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          role: "user",
          uiThreadText: params.userDisplayContent ?? undefined,
        },
      },
      {
        role: "assistant",
        content: params.assistantReply,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          role: "assistant",
          uiThreadText: params.assistantDisplayContent ?? undefined,
        },
      },
    ],
    prismaClient: params.prismaClient,
  });
}

export function getChatMessageDisplayContent(message: {
  content: string;
  signalsJson: Prisma.JsonValue | null;
}) {
  if (
    message.content.length > 0 &&
    message.content !== REDACTED_USER_MESSAGE &&
    message.content !== REDACTED_ASSISTANT_MESSAGE
  ) {
    return message.content;
  }

  const signals =
    message.signalsJson && typeof message.signalsJson === "object"
      ? (message.signalsJson as Record<string, unknown>)
      : null;
  return typeof signals?.uiThreadText === "string" ? signals.uiThreadText : null;
}

export async function applyChatUxStats(params: {
  userId: string;
  tone: string;
  explanationStyle: string;
  reward: number | null;
}) {
  if (params.reward == null) {
    return { updated: false, reason: "MISSING_REWARD" as const };
  }

  const toneKey = ensureAllowed("tone", params.tone);
  const styleKey = ensureAllowed("explanation_style", params.explanationStyle);

  const tags = await prisma.tag.findMany({
    where: {
      OR: [
        { axis: { key: "tone" }, key: toneKey },
        { axis: { key: "explanation_style" }, key: styleKey },
      ],
    },
    include: { axis: true },
  });

  const toneTag = tags.find((tag) => tag.axis.key === "tone");
  const styleTag = tags.find((tag) => tag.axis.key === "explanation_style");
  if (!toneTag || !styleTag) {
    return { updated: false, reason: "MISSING_TAGS" as const };
  }

  await prisma.$transaction(async (tx) => {
    for (const tag of [toneTag, styleTag]) {
      await tx.userTagStat.upsert({
        where: {
          userId_axisId_tagId: {
            userId: params.userId,
            axisId: tag.axisId,
            tagId: tag.id,
          },
        },
        update: {
          totalCount: { increment: 1 },
          correctCount: { increment: params.reward ?? 0 },
        },
        create: {
          userId: params.userId,
          axisId: tag.axisId,
          tagId: tag.id,
          totalCount: 1,
          correctCount: params.reward ?? 0,
        },
      });
    }

    const [stats, user] = await Promise.all([
      tx.userTagStat.findMany({
        where: { userId: params.userId },
        include: { axis: true, tag: true },
      }),
      tx.user.findUnique({
        where: { id: params.userId },
        select: {
          effectivePreferencesJson: true,
          testsTaken: true,
        },
      }),
    ]);

    const currentEffective =
      (user?.effectivePreferencesJson ?? {}) as Record<string, string>;
    const { effective, axesReady } = computeLayeredPreferences(
      stats.map((stat) => ({
        axisKey: stat.axis.key,
        tagKey: stat.tag.key,
        correctCount: stat.correctCount,
        totalCount: stat.totalCount,
      })),
      currentEffective,
      Number.NaN,
    );

    await tx.user.update({
      where: { id: params.userId },
      data: {
        effectivePreferencesJson: effective,
        personalizationReady: isPersonalizationReady(
          axesReady,
          user?.testsTaken ?? 0,
        ),
      },
    });
  });

  return { updated: true, reason: null as null };
}
