import { PrismaClient } from "@prisma/client";
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
    recentAccuracy: number | null;
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
  }>;
  notes: {
    whatThisMeans: string[];
    limitations: string[];
  };
};

type ByTagBucket = {
  total?: unknown;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidenceFromSampleSize(sampleSize: number) {
  return clamp01(sampleSize / 20);
}

function normalizeDifficulty(value: unknown): "easy" | "medium" | "hard" | null {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return null;
}

function extractMeta(
  byTagJson: unknown,
): {
  learningEligible: boolean | null;
  learningSkipReason: string | null;
} {
  if (!byTagJson || typeof byTagJson !== "object") {
    return { learningEligible: null, learningSkipReason: null };
  }
  const root = byTagJson as Record<string, unknown>;
  const meta =
    root._meta && typeof root._meta === "object"
      ? (root._meta as Record<string, unknown>)
      : null;
  const learning =
    meta?.learning && typeof meta.learning === "object"
      ? (meta.learning as Record<string, unknown>)
      : null;
  const eligible =
    typeof learning?.eligible === "boolean" ? learning.eligible : null;
  const skipReason =
    typeof learning?.skipReason === "string" ? learning.skipReason : null;
  return { learningEligible: eligible, learningSkipReason: skipReason };
}

function inferDifficultyFromByTag(byTagJson: unknown) {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const root = byTagJson as Record<string, unknown>;
  const difficulty = root.difficulty_target;
  if (!difficulty || typeof difficulty !== "object") return null;
  const buckets = Object.entries(difficulty as Record<string, unknown>)
    .map(([tagKey, value]) => {
      const total =
        value && typeof value === "object"
          ? Number((value as ByTagBucket).total ?? 0)
          : 0;
      return { tagKey, total: Number.isFinite(total) ? total : 0 };
    })
    .sort((a, b) => b.total - a.total);
  return normalizeDifficulty(buckets[0]?.tagKey ?? null);
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
  const [user, stats, attempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        effectivePreferencesJson: true,
      },
    }),
    prisma.userTagStat.findMany({
      where: { userId },
      include: { axis: true, tag: true },
    }),
    prisma.testAttempt.findMany({
      where: { userId },
      select: {
        score: true,
        createdAt: true,
        byTagJson: true,
        totalDurationMs: true,
        answerChangeCount: true,
        perQuestionFirstAnswerMsJson: true,
        test: {
          select: {
            subjectId: true,
            subject: { select: { title: true } },
            validationMetaJson: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const attemptsTotal = attempts.length;
  const reasonCounter = new Map<string, number>();
  let attemptsLearningEligible = 0;
  let attemptsExcluded = 0;

  for (const attempt of attempts) {
    const meta = extractMeta(attempt.byTagJson);
    const testMeta =
      attempt.test.validationMetaJson &&
      typeof attempt.test.validationMetaJson === "object"
        ? (attempt.test.validationMetaJson as Record<string, unknown>)
        : {};
    const fallbackReason =
      typeof testMeta.learningExcludedReason === "string"
        ? testMeta.learningExcludedReason
        : "UNKNOWN";

    if (meta.learningEligible === true) {
      attemptsLearningEligible += 1;
      continue;
    }

    if (meta.learningEligible === false) {
      attemptsExcluded += 1;
      const reason = meta.learningSkipReason ?? fallbackReason;
      reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1);
      continue;
    }

    const inferredEligible =
      testMeta.learningEligible === false ? false : true;
    if (inferredEligible) {
      attemptsLearningEligible += 1;
    } else {
      attemptsExcluded += 1;
      reasonCounter.set(fallbackReason, (reasonCounter.get(fallbackReason) ?? 0) + 1);
    }
  }

  const excludedReasonsTop = [...reasonCounter.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const lastUpdatedAt = attempts[0]?.createdAt?.toISOString() ?? null;

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

  const recentAttempts = attempts.slice(0, 10);
  const recentAccuracyValue = average(recentAttempts.map((attempt) => attempt.score));
  const recentAccuracy = {
    value: recentAttempts.length > 0 ? recentAccuracyValue : null,
    sampleSize: recentAttempts.length,
  };

  const effectivePrefs =
    user.effectivePreferencesJson && typeof user.effectivePreferencesJson === "object"
      ? (user.effectivePreferencesJson as Record<string, unknown>)
      : {};
  const currentDifficultyTarget =
    normalizeDifficulty(effectivePrefs.difficulty_target) ??
    inferDifficultyFromByTag(attempts[0]?.byTagJson);

  const subjectsMap = new Map<
    string,
    {
      subjectTitle: string;
      scores: number[];
      latestDifficulty: "easy" | "medium" | "hard" | null;
    }
  >();
  for (const attempt of attempts) {
    const subjectId = attempt.test.subjectId;
    const current = subjectsMap.get(subjectId) ?? {
      subjectTitle: attempt.test.subject.title,
      scores: [],
      latestDifficulty: null,
    };
    current.scores.push(attempt.score);
    if (!current.latestDifficulty) {
      current.latestDifficulty = inferDifficultyFromByTag(attempt.byTagJson);
    }
    subjectsMap.set(subjectId, current);
  }

  const subjects = [...subjectsMap.entries()].map(([subjectId, value]) => {
    const recent = value.scores.slice(0, 10);
    return {
      subjectId,
      subjectTitle: value.subjectTitle,
      attempts: value.scores.length,
      recentAccuracy: recent.length > 0 ? average(recent) : null,
      currentDifficultyTarget: value.latestDifficulty,
    };
  });

  subjects.sort((a, b) => b.attempts - a.attempts);

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
