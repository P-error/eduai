import { prisma } from "@/lib/prisma";
import { computeLayeredPreferences, isPersonalizationReady } from "@/lib/statistics";
import { TAGS_BY_AXIS } from "@/lib/tags";

export const CHAT_MAX_MESSAGES = 20;

export type ChatInputMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatPolicy = {
  personalizationMode: "on" | "off";
  policyMode: "personalization_on" | "personalization_off";
  policyId: "v2_personalized" | "v2_baseline";
  uxPreset: {
    tone: string;
    explanation_style: string;
    response_format: string;
  };
  pedagogyPreset: {
    difficulty_target: string;
    cognitive_process: string;
    task_family: string;
    context: string;
  };
};

export type ChatEventMeta = {
  source: "chat";
  atIso: string;
  personalizationMode: "on" | "off";
  policyMode: "personalization_on" | "personalization_off";
  policyId: "v2_personalized" | "v2_baseline";
  uxPreset: { tone: string; explanation_style: string };
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

export async function storeChatTurn(params: {
  userId: string;
  userMessage: string;
  assistantReply: string;
  eventMeta: ChatEventMeta;
}) {
  const storeRawContent = process.env.CHAT_STORE_RAW_CONTENT === "1";
  const userContent = storeRawContent ? params.userMessage : "[redacted_user_message]";
  const assistantContent = storeRawContent
    ? params.assistantReply
    : "[redacted_assistant_message]";

  const session = await prisma.chatSession.create({
    data: {
      userId: params.userId,
    },
    select: { id: true },
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: session.id,
        role: "user",
        content: userContent,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          rawStored: storeRawContent,
          role: "user",
        },
      },
      {
        sessionId: session.id,
        role: "assistant",
        content: assistantContent,
        signalsJson: {
          ...params.eventMeta,
          source: "chat",
          rawStored: storeRawContent,
          role: "assistant",
        },
      },
    ],
  });
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
