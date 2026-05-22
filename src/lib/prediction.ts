import { Prisma, PrismaClient } from "@prisma/client";
import {
  getActivePredictionRuntimeConfig,
  type ActivePredictionRuntimeSnapshot,
} from "@/lib/active-policy";
import { buildUserProfile } from "@/lib/profile";
import { DURATION_HISTORY_WINDOW_ATTEMPTS } from "@/lib/prediction-duration";
import {
  clampDifficulty,
  type DifficultyTarget,
} from "@/lib/prediction-baselines";
import {
  type PredictionCell,
  type PredictionRuntimeDescriptor,
} from "@/lib/prediction-contract";
import {
  buildPersonalizationPlan,
  type ExplanationDepth,
} from "@/lib/personalization-runtime";
import { TARGET_SCORE_BAND } from "@/lib/tags";

type Difficulty = DifficultyTarget;

type ProxyPredictionCell = {
  value: number | null;
  confidence: number;
  basis: string;
};

export type UserPredictionsResponse = {
  forTests: {
    predictionPolicyId: string;
    predictionRuntime: PredictionRuntimeDescriptor;
    recommendedDecision: {
      difficulty: Difficulty;
      depth: ExplanationDepth;
    };
    materializedRendering: {
      tone: string;
      explanation_style: string;
      response_format: "mcq";
    };
    recommendedPreset: {
      policyMode: string;
      policyId: string;
      pedagogicalDecision: {
        difficulty: Difficulty;
        depth: ExplanationDepth;
      };
      renderingDecision: {
        tone: string;
        explanation_style: string;
        response_format: "mcq";
      };
      uxPreset: {
        tone: string;
        explanation_style: string;
        response_format: "mcq";
      };
      pedagogyPreset: {
        difficulty_target: Difficulty;
        depth: ExplanationDepth;
      };
    };
    predicted: {
      expectedAccuracy: PredictionCell;
      expectedTotalDurationMs: PredictionCell;
    };
    nextDifficultySuggestion: { value: Difficulty | null; reason: string };
  };
  forChat: {
    pedagogicalDecision: {
      difficulty: Difficulty;
      depth: ExplanationDepth;
    };
    recommendedUxPreset: { tone: string; explanation_style: string };
    materializedRendering: { tone: string; explanation_style: string };
    predictedEngagement: ProxyPredictionCell;
  };
  notes: {
    disclaimer: string[];
    limitations: string[];
  };
};

const PREDICTION_HISTORY_SCAN_LIMIT = 200;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stepDifficulty(current: Difficulty, direction: "easier" | "harder") {
  if (direction === "harder") {
    if (current === "easy") return "medium";
    if (current === "medium") return "hard";
    return "hard";
  }
  if (current === "hard") return "medium";
  if (current === "medium") return "easy";
  return "easy";
}

export function suggestNextDifficulty(params: {
  current: Difficulty | null;
  recentAccuracy: number | null;
  low: number;
  high: number;
}): { value: Difficulty | null; reason: string } {
  const current = params.current;
  if (!current || params.recentAccuracy == null) {
    return {
      value: current,
      reason: "insufficient_data_keep_current",
    };
  }

  if (params.recentAccuracy > params.high) {
    return {
      value: stepDifficulty(current, "harder"),
      reason: `recentAccuracy>${params.high.toFixed(2)} => suggest harder`,
    };
  }
  if (params.recentAccuracy < params.low) {
    return {
      value: stepDifficulty(current, "easier"),
      reason: `recentAccuracy<${params.low.toFixed(2)} => suggest easier`,
    };
  }
  return {
    value: current,
    reason: "recentAccuracy_within_band_keep_current",
  };
}

export function predictChatEngagement(params: {
  recentChatRewards: number[];
  uxConfidence: number;
}): ProxyPredictionCell {
  const chatCount = params.recentChatRewards.length;
  const engagement = average(params.recentChatRewards);
  if (engagement == null) {
    return {
      value: null,
      confidence: clamp01(params.uxConfidence * 0.4),
      basis: "insufficient_chat_signal_count",
    };
  }
  const confidence = clamp01((chatCount / 20) * 0.6 + params.uxConfidence * 0.4);
  return {
    value: clamp01(engagement),
    confidence,
    basis: "recentChatUxReward(last20)+uxPreferenceConfidence",
  };
}

function buildPredictionNotes(runtime: PredictionRuntimeDescriptor) {
  const disclaimer = [
    "Prediction values are bounded proxies, not guarantees of learning outcomes.",
    "Expected duration currently remains a transparent heuristic predictor.",
  ];
  const limitations = [
    "Sparse activity reduces confidence and may return null estimates.",
    "Chat and test signals are behavior proxies, not causal evidence.",
    `Difficulty suggestion follows policy band ${TARGET_SCORE_BAND.low}-${TARGET_SCORE_BAND.high}.`,
  ];

  if (runtime.selectionWarning) {
    limitations.push(`Prediction config warning: ${runtime.selectionWarning}.`);
  }

  if (runtime.backendKind === "stub_model") {
    disclaimer.unshift(
      "Expected accuracy currently uses an explicit stub backend over the runtime feature payload, not a trained ML artifact.",
    );
  } else if (runtime.backendKind === "heuristic_baseline") {
    disclaimer.unshift(
      "Expected accuracy currently uses a heuristic baseline backend, not a trained ML artifact.",
    );
  } else if (runtime.backendStatus === "ready") {
    disclaimer.unshift(
      "Expected accuracy currently uses an accuracy artifact-backed offline ML backend.",
    );
  } else {
    disclaimer.unshift(
      "Accuracy artifact-backed ML backend is configured, but the runtime artifact slot is not ready.",
    );
    limitations.push(
      `Configured artifact state: ${runtime.artifact.status}${runtime.artifact.warning ? ` (${runtime.artifact.warning})` : ""}.`,
    );
  }

  return { disclaimer, limitations };
}

export async function buildUserPredictionRuntime(params: {
  prisma: PrismaClient;
  userId: string;
  subjectId?: string | null;
  predictionRuntimeSnapshot?: ActivePredictionRuntimeSnapshot;
}) {
  const snapshot =
    params.predictionRuntimeSnapshot ?? (await getActivePredictionRuntimeConfig());
  const profile = await buildUserProfile(params.prisma, params.userId);
  const selectedSubjectId = params.subjectId ?? profile.subjects[0]?.subjectId ?? null;

  const [user, subject, telemetryAttempts, historyAttempts, chatSignals] =
    await Promise.all([
      params.prisma.user.findUnique({
        where: { id: params.userId },
        select: {
          effectivePreferencesJson: true,
        },
      }),
      selectedSubjectId
        ? params.prisma.subject.findFirst({
            where: { id: selectedSubjectId, userId: params.userId },
            select: {
              id: true,
              title: true,
            },
          })
        : Promise.resolve(null),
      params.prisma.testAttempt.findMany({
        where: {
          userId: params.userId,
          perQuestionFirstAnswerMsJson: { not: Prisma.DbNull },
        },
        select: {
          createdAt: true,
          perQuestionFirstAnswerMsJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: DURATION_HISTORY_WINDOW_ATTEMPTS,
      }),
      params.prisma.testAttempt.findMany({
        where: { userId: params.userId },
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
      params.prisma.chatMessage.findMany({
        where: {
          role: "assistant",
          session: { userId: params.userId },
        },
        select: {
          signalsJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const effectivePreferences =
    (user?.effectivePreferencesJson ?? {}) as Record<string, unknown>;
  const subjectAttemptCount = selectedSubjectId
    ? historyAttempts.filter((attempt) => attempt.test.subjectId === selectedSubjectId)
        .length
    : 0;
  const recommendedQuestionCount =
    selectedSubjectId && subjectAttemptCount > 0 ? 8 : 5;

  const testPlan = buildPersonalizationPlan({
    snapshot,
    historyAttempts,
    durationAttempts: telemetryAttempts,
    effectivePreferences,
    surface: "test",
    mode: "practice",
    subjectId: selectedSubjectId,
    subjectTitle: subject?.title ?? null,
    topic: subject?.title ?? null,
    questionCount: recommendedQuestionCount,
    currentDifficulty: profile.pedagogy.currentDifficultyTarget,
  });
  const chatPlan = buildPersonalizationPlan({
    snapshot,
    historyAttempts,
    durationAttempts: telemetryAttempts,
    effectivePreferences,
    surface: "chat",
    mode: "chat",
    questionCount: 1,
    currentDifficulty: profile.pedagogy.currentDifficultyTarget,
  });

  const uxConfidence =
    (profile.ux.effectivePreferences.tone.confidence +
      profile.ux.effectivePreferences.explanation_style.confidence) /
    2;
  const recentChatRewards = chatSignals
    .map((message) => {
      if (!message.signalsJson || typeof message.signalsJson !== "object") return null;
      const root = message.signalsJson as Record<string, unknown>;
      const learning =
        root.learning && typeof root.learning === "object"
          ? (root.learning as Record<string, unknown>)
          : null;
      const reward = learning?.uxRewardChat;
      return typeof reward === "number" ? reward : null;
    })
    .filter((value): value is number => value != null);

  return {
    profile,
    selectedSubjectId,
    testPlan,
    chatPlan,
    predictedEngagement: predictChatEngagement({
      recentChatRewards,
      uxConfidence,
    }),
  };
}

export async function buildUserPredictions(params: {
  prisma: PrismaClient;
  userId: string;
  subjectId?: string | null;
  predictionRuntimeSnapshot?: ActivePredictionRuntimeSnapshot;
}): Promise<UserPredictionsResponse> {
  const runtimeContext = await buildUserPredictionRuntime(params);
  const nextDifficultySuggestion = suggestNextDifficulty({
    current: runtimeContext.profile.pedagogy.currentDifficultyTarget,
    recentAccuracy: runtimeContext.profile.pedagogy.recentAccuracy.value,
    low: runtimeContext.profile.pedagogy.band.low,
    high: runtimeContext.profile.pedagogy.band.high,
  });

  return {
    forTests: {
      predictionPolicyId: runtimeContext.testPlan.runtime.policyId,
      predictionRuntime: runtimeContext.testPlan.runtime,
      recommendedDecision: {
        difficulty: clampDifficulty(
          runtimeContext.testPlan.pedagogicalDecision.difficulty,
        ),
        depth: runtimeContext.testPlan.pedagogicalDecision.depth,
      },
      materializedRendering: {
        tone: runtimeContext.testPlan.materialization.uxPreset.tone,
        explanation_style:
          runtimeContext.testPlan.materialization.uxPreset.explanation_style,
        response_format:
          runtimeContext.testPlan.materialization.uxPreset.response_format,
      },
      recommendedPreset: {
        policyMode: "personalization_on",
        policyId: "v2_personalized",
        pedagogicalDecision: {
          difficulty: clampDifficulty(
            runtimeContext.testPlan.pedagogicalDecision.difficulty,
          ),
          depth: runtimeContext.testPlan.pedagogicalDecision.depth,
        },
        renderingDecision: {
          tone: runtimeContext.testPlan.materialization.uxPreset.tone,
          explanation_style:
            runtimeContext.testPlan.materialization.uxPreset.explanation_style,
          response_format:
            runtimeContext.testPlan.materialization.uxPreset.response_format,
        },
        uxPreset: runtimeContext.testPlan.materialization.uxPreset,
        pedagogyPreset: runtimeContext.testPlan.materialization.pedagogyPreset,
      },
      predicted: runtimeContext.testPlan.selectedPrediction,
      nextDifficultySuggestion,
    },
    forChat: {
      pedagogicalDecision: {
        difficulty: clampDifficulty(
          runtimeContext.chatPlan.pedagogicalDecision.difficulty,
        ),
        depth: runtimeContext.chatPlan.pedagogicalDecision.depth,
      },
      recommendedUxPreset: {
        tone: runtimeContext.chatPlan.materialization.uxPreset.tone,
        explanation_style:
          runtimeContext.chatPlan.materialization.uxPreset.explanation_style,
      },
      materializedRendering: {
        tone: runtimeContext.chatPlan.materialization.uxPreset.tone,
        explanation_style:
          runtimeContext.chatPlan.materialization.uxPreset.explanation_style,
      },
      predictedEngagement: runtimeContext.predictedEngagement,
    },
    notes: buildPredictionNotes(runtimeContext.testPlan.runtime),
  };
}
