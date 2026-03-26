import { Prisma, PrismaClient } from "@prisma/client";
import { buildUserProfile } from "@/lib/profile";
import {
  getSubjectRecommendation,
  getUserPresetForChat,
  V2_BASELINE_PEDAGOGY_PRESET,
} from "@/lib/recommendation";
import { TARGET_SCORE_BAND } from "@/lib/tags";
import {
  clampDifficulty,
  clampQuestionCount,
  difficultyAccuracyAdjust,
  expectedTotalDurationBaselineMs,
  type DifficultyTarget,
} from "@/lib/prediction-baselines";
import {
  assertUnifiedDurationPrediction,
  DURATION_HISTORY_WINDOW_ATTEMPTS,
  predictExpectedTotalDurationMsUnified,
} from "@/lib/prediction-duration";
import {
  DEFAULT_ACTIVE_PREDICTION_POLICY_ID,
  PREDICTION_POLICY_V1,
  type ActivePredictionPolicyId,
} from "@/lib/active-policy";
import { getActivePredictionModelParams } from "@/lib/prediction-params";

type Difficulty = DifficultyTarget;

type PredictionCell = {
  value: number | null;
  confidence: number;
  basis: string;
  components?: {
    baseline: number;
    telemetryAdjustment?: number;
  };
};

export type UserPredictionsResponse = {
  forTests: {
    predictionPolicyId: ActivePredictionPolicyId;
    recommendedPreset: {
      policyMode: string;
      policyId: string;
      uxPreset: { tone: string; explanation_style: string; response_format: "mcq" };
      pedagogyPreset: {
        difficulty_target: Difficulty;
        cognitive_process: string;
        task_family: string;
        context: string;
      };
    };
    predicted: {
      expectedAccuracy: PredictionCell;
      expectedTotalDurationMs: PredictionCell;
    };
    nextDifficultySuggestion: { value: Difficulty | null; reason: string };
  };
  forChat: {
    recommendedUxPreset: { tone: string; explanation_style: string };
    predictedEngagement: PredictionCell;
  };
  notes: {
    disclaimer: string[];
    limitations: string[];
  };
};

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

export type PredictionHistoryAttempt = {
  score: number;
  byTagJson: unknown;
  createdAt: Date;
  test: {
    subjectId: string;
    questionCount: number;
  };
};

const ACCURACY_HISTORY_WINDOW_ATTEMPTS = 10;
const SUBJECT_CLEAN_MIN_ATTEMPTS = 3;
const CONFIDENCE_FULL_EVIDENCE_QUESTIONS = 100;
const PREDICTION_HISTORY_SCAN_LIMIT = 200;

type AccuracyBasisScope =
  | "subject_lastN_clean"
  | "subject_lastN_fallback"
  | "global_lastN_clean";

function parseLearningEligibility(byTagJson: unknown): boolean | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const meta = (byTagJson as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== "object") return null;
  const learning = (meta as Record<string, unknown>).learning;
  if (!learning || typeof learning !== "object") return null;
  const eligible = (learning as Record<string, unknown>).eligible;
  return typeof eligible === "boolean" ? eligible : null;
}

function isCleanAttempt(attempt: PredictionHistoryAttempt) {
  return parseLearningEligibility(attempt.byTagJson) === true;
}

function isFallbackAttempt(attempt: PredictionHistoryAttempt) {
  return parseLearningEligibility(attempt.byTagJson) !== false;
}

function pickAccuracyAttemptSet(params: {
  attempts: PredictionHistoryAttempt[];
  subjectId: string | null | undefined;
  windowAttempts: number;
}): { attempts: PredictionHistoryAttempt[]; scope: AccuracyBasisScope } | null {
  const { attempts, subjectId, windowAttempts } = params;

  if (subjectId) {
    const subjectAttempts = attempts.filter((attempt) => attempt.test.subjectId === subjectId);
    const subjectClean = subjectAttempts.filter(isCleanAttempt).slice(0, windowAttempts);
    if (subjectClean.length >= SUBJECT_CLEAN_MIN_ATTEMPTS) {
      return { attempts: subjectClean, scope: "subject_lastN_clean" };
    }

    const subjectFallback = subjectAttempts
      .filter(isFallbackAttempt)
      .slice(0, windowAttempts);
    if (subjectFallback.length > 0) {
      return { attempts: subjectFallback, scope: "subject_lastN_fallback" };
    }
  }

  const globalClean = attempts.filter(isCleanAttempt).slice(0, windowAttempts);
  if (globalClean.length > 0) {
    return { attempts: globalClean, scope: "global_lastN_clean" };
  }

  return null;
}

function summarizeQuestionEvidence(attempts: PredictionHistoryAttempt[]) {
  let correctSum = 0;
  let totalSum = 0;

  for (const attempt of attempts) {
    const totalQuestions = clampQuestionCount(attempt.test.questionCount);
    const rawCorrect = Math.round(attempt.score * totalQuestions);
    const correct = Math.max(0, Math.min(totalQuestions, rawCorrect));
    correctSum += correct;
    totalSum += totalQuestions;
  }

  return { correctSum, totalSum };
}

function betaPosteriorMean(
  correctSum: number,
  totalSum: number,
  betaA: number,
  betaB: number,
) {
  return (betaA + correctSum) / (betaA + betaB + totalSum);
}

export function predictExpectedAccuracyBeta(params: {
  attempts: PredictionHistoryAttempt[];
  difficultyTarget: Difficulty;
  subjectId?: string | null;
  windowAttempts?: number;
  modelParams?: {
    betaA?: number;
    betaB?: number;
    diffAdjustMag?: number;
  };
}): PredictionCell {
  const activeParams = getActivePredictionModelParams();
  const betaA = Math.max(0.01, params.modelParams?.betaA ?? activeParams.betaA);
  const betaB = Math.max(0.01, params.modelParams?.betaB ?? activeParams.betaB);
  const diffAdjustMag = Math.max(
    0,
    Math.min(0.3, params.modelParams?.diffAdjustMag ?? activeParams.diffAdjustMag),
  );
  const windowAttempts = clampQuestionCount(
    params.windowAttempts ?? ACCURACY_HISTORY_WINDOW_ATTEMPTS,
  );
  const orderedAttempts = [...params.attempts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const selected = pickAccuracyAttemptSet({
    attempts: orderedAttempts,
    subjectId: params.subjectId,
    windowAttempts,
  });

  if (!selected) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  const { correctSum, totalSum } = summarizeQuestionEvidence(selected.attempts);
  if (totalSum <= 0) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  const posterior = betaPosteriorMean(correctSum, totalSum, betaA, betaB);
  const adjusted = clamp01(
    posterior + difficultyAccuracyAdjust(params.difficultyTarget, diffAdjustMag),
  );
  const confidence = clamp01(totalSum / CONFIDENCE_FULL_EVIDENCE_QUESTIONS);

  return {
    value: adjusted,
    confidence,
    basis: `${selected.scope}|beta_binomial_posterior + difficulty_adjust`,
  };
}

export function predictExpectedAccuracyRawMean(params: {
  attempts: PredictionHistoryAttempt[];
  subjectId?: string | null;
  windowAttempts?: number;
}): PredictionCell {
  const windowAttempts = clampQuestionCount(
    params.windowAttempts ?? ACCURACY_HISTORY_WINDOW_ATTEMPTS,
  );
  const orderedAttempts = [...params.attempts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const selected = pickAccuracyAttemptSet({
    attempts: orderedAttempts,
    subjectId: params.subjectId,
    windowAttempts,
  });

  if (!selected) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  const { correctSum, totalSum } = summarizeQuestionEvidence(selected.attempts);
  if (totalSum <= 0) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  return {
    value: clamp01(correctSum / totalSum),
    confidence: clamp01(totalSum / CONFIDENCE_FULL_EVIDENCE_QUESTIONS),
    basis: `${selected.scope}|raw_mean`,
  };
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
}): PredictionCell {
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

export async function buildUserPredictions(params: {
  prisma: PrismaClient;
  userId: string;
  subjectId?: string | null;
  predictionPolicyId?: ActivePredictionPolicyId;
}): Promise<UserPredictionsResponse> {
  const {
    prisma,
    userId,
    subjectId,
    predictionPolicyId = DEFAULT_ACTIVE_PREDICTION_POLICY_ID,
  } = params;
  const profile = await buildUserProfile(prisma, userId);
  const selectedSubjectId = subjectId ?? profile.subjects[0]?.subjectId ?? null;

  const [chatPreset, recommendation, telemetryAttempts, historyAttempts, chatSignals] =
    await Promise.all([
      getUserPresetForChat(userId),
      selectedSubjectId
        ? getSubjectRecommendation(userId, selectedSubjectId)
        : Promise.resolve(null),
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
      prisma.chatMessage.findMany({
        where: {
          role: "assistant",
          session: { userId },
        },
        select: {
          signalsJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const recUx = recommendation?.ok
    ? recommendation.preset.uxPreset
    : chatPreset.uxPreset;
  const recPed = recommendation?.ok
    ? recommendation.preset.pedagogyPreset
    : { ...V2_BASELINE_PEDAGOGY_PRESET, ...chatPreset.pedagogyPreset };

  const difficultyTarget = clampDifficulty(recPed.difficulty_target);
  const responseFormat = recUx.response_format ?? "mcq";
  const questionCount = recommendation?.ok ? recommendation.preset.questionCount : 5;

  const expectedAccuracy =
    predictionPolicyId === PREDICTION_POLICY_V1
      ? predictExpectedAccuracyRawMean({
          attempts: historyAttempts,
          subjectId: selectedSubjectId,
        })
      : predictExpectedAccuracyBeta({
          attempts: historyAttempts,
          difficultyTarget,
          subjectId: selectedSubjectId,
        });

  const baselineDuration = expectedTotalDurationBaselineMs({
    difficultyTarget,
    responseFormat,
    questionCount,
  });
  const expectedTotalDurationMs =
    predictionPolicyId === PREDICTION_POLICY_V1
      ? {
          value: baselineDuration,
          confidence: 0,
          basis: `${PREDICTION_POLICY_V1}|baseline_only`,
          components: {
            baseline: baselineDuration,
          },
        }
      : predictExpectedTotalDurationMsUnified({
          difficultyTarget,
          responseFormat,
          questionCount,
          historicalAttempts: telemetryAttempts,
        });
  assertUnifiedDurationPrediction(
    expectedTotalDurationMs,
    "buildUserPredictions.expectedTotalDurationMs",
  );

  const nextDifficultySuggestion = suggestNextDifficulty({
    current: profile.pedagogy.currentDifficultyTarget,
    recentAccuracy: profile.pedagogy.recentAccuracy.value,
    low: profile.pedagogy.band.low,
    high: profile.pedagogy.band.high,
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

  const predictedEngagement = predictChatEngagement({
    recentChatRewards,
    uxConfidence,
  });

  return {
    forTests: {
      predictionPolicyId,
      recommendedPreset: {
        policyMode: "personalization_on",
        policyId: "v2_personalized",
        uxPreset: {
          tone: recUx.tone ?? "formal",
          explanation_style: recUx.explanation_style ?? "stepwise",
          response_format: "mcq",
        },
        pedagogyPreset: {
          difficulty_target: difficultyTarget,
          cognitive_process: recPed.cognitive_process ?? "apply",
          task_family: recPed.task_family ?? "problem_solving",
          context: recPed.context ?? "abstract",
        },
      },
      predicted: {
        expectedAccuracy,
        expectedTotalDurationMs,
      },
      nextDifficultySuggestion,
    },
    forChat: {
      recommendedUxPreset: {
        tone: recUx.tone ?? "formal",
        explanation_style: recUx.explanation_style ?? "stepwise",
      },
      predictedEngagement,
    },
    notes: {
      disclaimer: [
        "Predictions are heuristic proxies based on recent activity.",
        "Values are not guarantees of learning outcomes.",
      ],
      limitations: [
        "Sparse activity reduces confidence and may return null estimates.",
        "Chat and test signals are behavior proxies, not causal evidence.",
        `Difficulty suggestion follows policy band ${TARGET_SCORE_BAND.low}-${TARGET_SCORE_BAND.high}.`,
      ],
    },
  };
}
