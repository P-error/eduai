import { PrismaClient } from "@prisma/client";
import { buildLearnerTruthOverview } from "@/lib/learner-truth";
import { TARGET_SCORE_BAND } from "@/lib/tags";

type ConfidenceCell = {
  bestTag: string | null;
  confidence: number;
  sampleSize: number;
};

export type UserProfileResponse = {
  user: { id: string; createdAt: string };
  dataQuality: {
    attemptsTotal: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    excludedReasonsTop: Array<{ reason: string; count: number }>;
    lastUpdatedAt: string | null;
  };
  ux: {
    effectivePreferences: {
      tone: ConfidenceCell;
      explanation_style: ConfidenceCell;
      response_format: ConfidenceCell & { bestTag: "mcq" | null };
    };
    engagement: {
      avgTotalDurationMs: number | null;
      avgPerQuestionFirstAnswerMs: number | null;
      avgAnswerChangeCount: number | null;
    };
  };
  pedagogy: {
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
    band: { low: number; high: number };
    recentAccuracy: { value: number | null; sampleSize: number };
    effectivePreferences: {
      cognitive_process: ConfidenceCell;
      task_family: ConfidenceCell;
      context: ConfidenceCell;
    };
  };
  subjects: Array<{
    subjectId: string;
    subjectTitle: string;
    attempts: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    recentAccuracy: number | null;
    recentEvidenceCount: number;
    isDefaultCollection: boolean;
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
  }>;
  notes: {
    whatThisMeans: string[];
    limitations: string[];
  };
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidenceFromSampleSize(sampleSize: number) {
  return clamp01(sampleSize / 20);
}

function collectScoresFromByTagAxis(byTagJson: unknown, axisKey: string) {
  if (!byTagJson || typeof byTagJson !== "object") return [];
  const root = byTagJson as Record<string, unknown>;
  const axis = root[axisKey];
  if (!axis || typeof axis !== "object") return [];

  return Object.entries(axis as Record<string, unknown>)
    .map(([tagKey, value]) => {
      const payload =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const correct = Number(payload.correct ?? 0);
      const total = Number(payload.total ?? 0);
      return {
        tagKey,
        correct: Number.isFinite(correct) ? correct : 0,
        total: Number.isFinite(total) ? total : 0,
      };
    })
    .filter((entry) => entry.total > 0);
}

function pickBestFromUserStats(
  axisKey: string,
  stats: Array<{
    axis: { key: string };
    tag: { key: string };
    correctCount: number;
    totalCount: number;
  }>,
): ConfidenceCell {
  const entries = stats
    .filter((row) => row.axis.key === axisKey)
    .map((row) => ({
      tagKey: row.tag.key,
      correct: row.correctCount,
      total: row.totalCount,
      accuracy: row.totalCount > 0 ? row.correctCount / row.totalCount : 0,
    }))
    .filter((row) => row.total > 0);

  if (entries.length === 0) {
    return { bestTag: null, confidence: 0, sampleSize: 0 };
  }

  const best = [...entries].sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return b.total - a.total;
  })[0];

  return {
    bestTag: best.tagKey,
    sampleSize: best.total,
    confidence: confidenceFromSampleSize(best.total),
  };
}

function pickBestFromAttemptsFallback(
  axisKey: string,
  attempts: Array<{ byTagJson: unknown }>,
): ConfidenceCell {
  const aggregate = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    const buckets = collectScoresFromByTagAxis(attempt.byTagJson, axisKey);
    for (const bucket of buckets) {
      const current = aggregate.get(bucket.tagKey) ?? { correct: 0, total: 0 };
      current.correct += bucket.correct;
      current.total += bucket.total;
      aggregate.set(bucket.tagKey, current);
    }
  }

  const entries = [...aggregate.entries()]
    .map(([tagKey, value]) => ({
      tagKey,
      correct: value.correct,
      total: value.total,
      accuracy: value.total > 0 ? value.correct / value.total : 0,
    }))
    .filter((entry) => entry.total > 0);

  if (entries.length === 0) {
    return { bestTag: null, confidence: 0, sampleSize: 0 };
  }

  const best = [...entries].sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return b.total - a.total;
  })[0];

  return {
    bestTag: best.tagKey,
    sampleSize: best.total,
    confidence: confidenceFromSampleSize(best.total),
  };
}

function pickBestAxis(
  axisKey: string,
  stats: Array<{
    axis: { key: string };
    tag: { key: string };
    correctCount: number;
    totalCount: number;
  }>,
  attempts: Array<{ byTagJson: unknown }>,
) {
  const fromStats = pickBestFromUserStats(axisKey, stats);
  if (fromStats.bestTag) return fromStats;
  return pickBestFromAttemptsFallback(axisKey, attempts);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function buildUserProfile(
  prisma: PrismaClient,
  userId: string,
): Promise<UserProfileResponse> {
  const [user, stats, overview] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
      },
    }),
    prisma.userTagStat.findMany({
      where: { userId },
      include: { axis: true, tag: true },
    }),
    buildLearnerTruthOverview(prisma, userId),
  ]);

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const attempts = overview.attempts;
  const attemptsTotal = overview.global.attemptsRecorded;
  const attemptsLearningEligible = overview.global.attemptsLearningEligible;
  const attemptsExcluded = overview.global.attemptsExcluded;
  const excludedReasonsTop = overview.global.excludedReasonsTop.map((entry) => ({
    reason: entry.reason,
    count: entry.count,
  }));
  const lastUpdatedAt = overview.global.lastRecordedAttemptAt;

  const durationValues = attempts
    .map((attempt) => attempt.totalDurationMs)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const answerChangeValues = attempts
    .map((attempt) => attempt.answerChangeCount)
    .filter((value): value is number => typeof value === "number");
  const perQuestionValues: number[] = [];
  for (const attempt of attempts) {
    if (!Array.isArray(attempt.perQuestionFirstAnswerMsJson)) continue;
    for (const value of attempt.perQuestionFirstAnswerMsJson) {
      if (typeof value === "number" && value >= 0) {
        perQuestionValues.push(value);
      }
    }
  }

  const uxTone = pickBestAxis("tone", stats, attempts);
  const uxExplanationStyle = pickBestAxis("explanation_style", stats, attempts);
  const uxResponseFormatRaw = pickBestAxis("response_format", stats, attempts);
  const uxResponseFormat: ConfidenceCell & { bestTag: "mcq" | null } = {
    bestTag: uxResponseFormatRaw.bestTag === "mcq" ? "mcq" : null,
    confidence: uxResponseFormatRaw.bestTag === "mcq" ? uxResponseFormatRaw.confidence : 0,
    sampleSize: uxResponseFormatRaw.bestTag === "mcq" ? uxResponseFormatRaw.sampleSize : 0,
  };

  const pedCognitiveProcess = pickBestAxis("cognitive_process", stats, attempts);
  const pedTaskFamily = pickBestAxis("task_family", stats, attempts);
  const pedContext = pickBestAxis("context", stats, attempts);

  const recentAccuracy = overview.global.recentAccuracy;
  const currentDifficultyTarget = overview.adaptiveState.currentDifficultyTarget;
  const subjects = overview.subjects.map((subject) => ({
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,
    attempts: subject.attemptsRecorded,
    attemptsLearningEligible: subject.attemptsLearningEligible,
    attemptsExcluded: subject.attemptsExcluded,
    recentAccuracy: subject.recentAccuracy.value,
    recentEvidenceCount: subject.recentEvidence.learningEligible,
    isDefaultCollection: subject.isDefaultCollection,
    currentDifficultyTarget: subject.currentDifficultyTarget,
  }));

  const response: UserProfileResponse = {
    user: {
      id: user.id,
      createdAt: user.createdAt.toISOString(),
    },
    dataQuality: {
      attemptsTotal,
      attemptsLearningEligible,
      attemptsExcluded,
      excludedReasonsTop,
      lastUpdatedAt,
    },
    ux: {
      effectivePreferences: {
        tone: uxTone,
        explanation_style: uxExplanationStyle,
        response_format: uxResponseFormat,
      },
      engagement: {
        avgTotalDurationMs: average(durationValues),
        avgPerQuestionFirstAnswerMs: average(perQuestionValues),
        avgAnswerChangeCount: average(answerChangeValues),
      },
    },
    pedagogy: {
      currentDifficultyTarget,
      band: { low: TARGET_SCORE_BAND.low, high: TARGET_SCORE_BAND.high },
      recentAccuracy,
      effectivePreferences: {
        cognitive_process: pedCognitiveProcess,
        task_family: pedTaskFamily,
        context: pedContext,
      },
    },
    subjects,
    notes: {
      whatThisMeans: [
        "Profile summarizes current behavior of the v2 personalization policy (UX + pedagogy).",
        "Confidence grows only with more observations; low sample size should be treated as weak evidence.",
        "Difficulty target follows a band-based policy and may lag after short streaks.",
      ],
      limitations: [
        "Telemetry can be missing, so UX engagement estimates may be based on fewer attempts.",
        "LLM generation/tagging variability can still affect observed outcomes.",
        "This profile is descriptive and not a causal model of learning.",
      ],
    },
  };

  return response;
}
