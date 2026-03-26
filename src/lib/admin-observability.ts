import { PrismaClient } from "@prisma/client";

export type AdminFilters = {
  window: "7d" | "30d" | "all";
  policyMode:
    | "any"
    | "personalization_on"
    | "personalization_off"
    | "manual_delivery_override";
  subjectId?: string | null;
  includeExcluded: boolean;
};

type AttemptMeta = {
  learning?: { eligible?: boolean; skipReason?: string | null };
  policy?: { policyMode?: string | null };
  ux?: { reward?: number | null };
  pedagogy?: { changed?: boolean };
  recommendation?: { explorationUsed?: boolean };
  prediction?: {
    expectedAccuracy?: number | null;
    actualAccuracy?: number | null;
    expectedTotalDurationMs?: number | null;
    actualTotalDurationMs?: number | null;
  };
};

type ValidationMeta = {
  policyMode?: string;
  taggingSource?: string;
  deliveryComplianceFailed?: boolean;
  hadRetry?: boolean;
  attempts?: number;
  taggingWarnings?: unknown[];
  appliedDelivery?: {
    tone?: string;
    explanation_style?: string;
  };
};

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseWindow(window: "7d" | "30d" | "all") {
  if (window === "all") return null;
  const days = window === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toCountRows(counter: Map<string, number>) {
  return [...counter.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function extractAttemptMeta(byTagJson: unknown): AttemptMeta {
  if (!byTagJson || typeof byTagJson !== "object") return {};
  const root = byTagJson as Record<string, unknown>;
  if (!root._meta || typeof root._meta !== "object") return {};
  return root._meta as AttemptMeta;
}

function extractValidationMeta(value: unknown): ValidationMeta {
  if (!value || typeof value !== "object") return {};
  return value as ValidationMeta;
}

function attemptMatchesFilters(
  policyMode: string,
  learningEligible: boolean | null | undefined,
  filters: AdminFilters,
) {
  if (filters.policyMode !== "any" && policyMode !== filters.policyMode) return false;
  if (!filters.includeExcluded && learningEligible === false) return false;
  return true;
}

function extractDifficultyFromByTag(byTagJson: unknown): string | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const root = byTagJson as Record<string, unknown>;
  const buckets = root.difficulty_target;
  if (!buckets || typeof buckets !== "object") return null;
  const entries = Object.entries(buckets as Record<string, unknown>)
    .map(([tagKey, payload]) => {
      const total =
        payload && typeof payload === "object"
          ? Number((payload as Record<string, unknown>).total ?? 0)
          : 0;
      return { tagKey, total: Number.isFinite(total) ? total : 0 };
    })
    .sort((a, b) => b.total - a.total);
  return entries[0]?.tagKey ?? null;
}

export async function getAdminDataQualityMetrics(
  prisma: PrismaClient,
  filters: AdminFilters,
) {
  const since = parseWindow(filters.window);
  const attempts = await prisma.testAttempt.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(filters.subjectId ? { test: { subjectId: filters.subjectId } } : {}),
    },
    select: {
      createdAt: true,
      byTagJson: true,
      test: {
        select: {
          validationMetaJson: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 4000,
  });

  const stackByDay = new Map<string, { total: number; eligible: number; excluded: number }>();
  const excludedReasons = new Map<string, number>();
  const taggingSource = new Map<string, number>();
  const complianceByDay = new Map<string, { pass: number; fail: number }>();
  const retryByDay = new Map<string, { total: number; retry: number }>();
  const warningsByDay = new Map<string, { total: number; warningSum: number }>();

  for (const attempt of attempts) {
    const day = dayKey(attempt.createdAt);
    const meta = extractAttemptMeta(attempt.byTagJson);
    const validation = extractValidationMeta(attempt.test.validationMetaJson);
    const policyMode = meta.policy?.policyMode ?? validation.policyMode ?? "unknown";
    const learningEligible = meta.learning?.eligible;

    if (!attemptMatchesFilters(policyMode, learningEligible, filters)) continue;

    const stack = stackByDay.get(day) ?? { total: 0, eligible: 0, excluded: 0 };
    stack.total += 1;
    if (learningEligible === false) {
      stack.excluded += 1;
      const reason = meta.learning?.skipReason ?? "UNKNOWN";
      excludedReasons.set(reason, (excludedReasons.get(reason) ?? 0) + 1);
    } else {
      stack.eligible += 1;
    }
    stackByDay.set(day, stack);

    const tagSource = validation.taggingSource ?? "unknown";
    taggingSource.set(tagSource, (taggingSource.get(tagSource) ?? 0) + 1);

    const comp = complianceByDay.get(day) ?? { pass: 0, fail: 0 };
    if (validation.deliveryComplianceFailed) comp.fail += 1;
    else comp.pass += 1;
    complianceByDay.set(day, comp);

    const retry = retryByDay.get(day) ?? { total: 0, retry: 0 };
    retry.total += 1;
    if (validation.hadRetry || (validation.attempts ?? 1) > 1) retry.retry += 1;
    retryByDay.set(day, retry);

    const warnings = warningsByDay.get(day) ?? { total: 0, warningSum: 0 };
    warnings.total += 1;
    warnings.warningSum += Array.isArray(validation.taggingWarnings)
      ? validation.taggingWarnings.length
      : 0;
    warningsByDay.set(day, warnings);
  }

  return {
    attemptsStack: [...stackByDay.entries()].map(([date, row]) => ({
      date,
      ...row,
    })),
    excludedReasonsTop: toCountRows(excludedReasons).slice(0, 8),
    taggingSourceDistribution: toCountRows(taggingSource),
    complianceTrend: [...complianceByDay.entries()].map(([date, row]) => ({
      date,
      ...row,
      passRate: row.pass + row.fail > 0 ? row.pass / (row.pass + row.fail) : 0,
    })),
    retryTrend: [...retryByDay.entries()].map(([date, row]) => ({
      date,
      ...row,
      retryRate: row.total > 0 ? row.retry / row.total : 0,
    })),
    avgWarningsTrend: [...warningsByDay.entries()].map(([date, row]) => ({
      date,
      avgWarnings: row.total > 0 ? row.warningSum / row.total : 0,
    })),
  };
}

export async function getAdminPersonalizationMetrics(
  prisma: PrismaClient,
  filters: AdminFilters,
) {
  const since = parseWindow(filters.window);
  const [tests, attempts, userStats] = await Promise.all([
    prisma.generatedTest.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      },
      select: {
        createdAt: true,
        validationMetaJson: true,
      },
      orderBy: { createdAt: "asc" },
      take: 4000,
    }),
    prisma.testAttempt.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filters.subjectId ? { test: { subjectId: filters.subjectId } } : {}),
      },
      select: {
        createdAt: true,
        byTagJson: true,
      },
      orderBy: { createdAt: "asc" },
      take: 4000,
    }),
    prisma.userTagStat.findMany({
      include: {
        axis: true,
      },
    }),
  ]);

  const uxPresetToneByDay = new Map<string, Map<string, number>>();
  const uxPresetStyleByDay = new Map<string, Map<string, number>>();
  const difficultyTransitionsByDay = new Map<string, number>();
  const explorationByDay = new Map<string, { total: number; explored: number }>();
  const abUsage = new Map<string, number>();

  for (const test of tests) {
    const day = dayKey(test.createdAt);
    const validation = extractValidationMeta(test.validationMetaJson);
    const mode = validation.policyMode ?? "unknown";
    if (filters.policyMode !== "any" && mode !== filters.policyMode) continue;

    abUsage.set(mode, (abUsage.get(mode) ?? 0) + 1);
    const tone = validation.appliedDelivery?.tone ?? "unknown";
    const style = validation.appliedDelivery?.explanation_style ?? "unknown";

    const toneMap = uxPresetToneByDay.get(day) ?? new Map<string, number>();
    toneMap.set(tone, (toneMap.get(tone) ?? 0) + 1);
    uxPresetToneByDay.set(day, toneMap);

    const styleMap = uxPresetStyleByDay.get(day) ?? new Map<string, number>();
    styleMap.set(style, (styleMap.get(style) ?? 0) + 1);
    uxPresetStyleByDay.set(day, styleMap);
  }

  for (const attempt of attempts) {
    const meta = extractAttemptMeta(attempt.byTagJson);
    const policyMode = meta.policy?.policyMode ?? "unknown";
    const learningEligible = meta.learning?.eligible;
    if (!attemptMatchesFilters(policyMode, learningEligible, filters)) continue;

    const day = dayKey(attempt.createdAt);

    if (meta.pedagogy?.changed) {
      difficultyTransitionsByDay.set(day, (difficultyTransitionsByDay.get(day) ?? 0) + 1);
    }
    const exp = explorationByDay.get(day) ?? { total: 0, explored: 0 };
    exp.total += 1;
    if (meta.recommendation?.explorationUsed) exp.explored += 1;
    explorationByDay.set(day, exp);
  }

  const confidenceBins = {
    low: 0,
    medium: 0,
    high: 0,
  };
  for (const stat of userStats) {
    if (stat.axis.key !== "tone" && stat.axis.key !== "explanation_style") continue;
    const confidence = Math.max(0, Math.min(1, stat.totalCount / 20));
    if (confidence < 0.33) confidenceBins.low += 1;
    else if (confidence < 0.66) confidenceBins.medium += 1;
    else confidenceBins.high += 1;
  }

  return {
    uxPresetToneTrend: [...uxPresetToneByDay.entries()].map(([date, rows]) => ({
      date,
      distribution: toCountRows(rows),
    })),
    uxPresetStyleTrend: [...uxPresetStyleByDay.entries()].map(([date, rows]) => ({
      date,
      distribution: toCountRows(rows),
    })),
    uxConfidenceDistribution: [
      { bucket: "low", value: confidenceBins.low },
      { bucket: "medium", value: confidenceBins.medium },
      { bucket: "high", value: confidenceBins.high },
    ],
    difficultyTransitionsTrend: [...difficultyTransitionsByDay.entries()].map(
      ([date, transitions]) => ({ date, transitions }),
    ),
    explorationTrend: [...explorationByDay.entries()].map(([date, row]) => ({
      date,
      total: row.total,
      explored: row.explored,
      explorationRate: row.total > 0 ? row.explored / row.total : 0,
    })),
    abUsageShare: toCountRows(abUsage),
  };
}

export async function getAdminChatMetrics(
  prisma: PrismaClient,
  filters: AdminFilters,
) {
  const since = parseWindow(filters.window);
  const messages = await prisma.chatMessage.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      role: "assistant",
      session: {
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      },
    },
    select: {
      createdAt: true,
      signalsJson: true,
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  const eventsByDay = new Map<string, number>();
  const styleLength = new Map<string, { count: number; sumChars: number }>();
  const modeUsage = new Map<string, number>();
  const latencyBuckets = new Map<string, number>();

  for (const msg of messages) {
    const day = dayKey(msg.createdAt);
    eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);

    if (!msg.signalsJson || typeof msg.signalsJson !== "object") continue;
    const signal = msg.signalsJson as Record<string, unknown>;
    const mode =
      typeof signal.personalizationMode === "string"
        ? signal.personalizationMode
        : "unknown";
    if (filters.policyMode !== "any") {
      if (
        (filters.policyMode === "personalization_on" && mode !== "on") ||
        (filters.policyMode === "personalization_off" && mode !== "off")
      ) {
        continue;
      }
    }

    modeUsage.set(mode, (modeUsage.get(mode) ?? 0) + 1);

    const uxPreset =
      signal.uxPreset && typeof signal.uxPreset === "object"
        ? (signal.uxPreset as Record<string, unknown>)
        : {};
    const style =
      typeof uxPreset.explanation_style === "string"
        ? uxPreset.explanation_style
        : "unknown";
    const stats =
      signal.messageStats && typeof signal.messageStats === "object"
        ? (signal.messageStats as Record<string, unknown>)
        : {};
    const assistantChars = Number(stats.assistantChars ?? 0);
    const latency = Number(stats.turnLatencyMs ?? 0);

    const styleAgg = styleLength.get(style) ?? { count: 0, sumChars: 0 };
    styleAgg.count += 1;
    styleAgg.sumChars += Number.isFinite(assistantChars) ? assistantChars : 0;
    styleLength.set(style, styleAgg);

    const latencyBucket =
      latency < 2000
        ? "<2s"
        : latency < 5000
          ? "2-5s"
          : latency < 10_000
            ? "5-10s"
            : "10s+";
    latencyBuckets.set(latencyBucket, (latencyBuckets.get(latencyBucket) ?? 0) + 1);
  }

  return {
    chatEventsPerDay: [...eventsByDay.entries()].map(([date, total]) => ({
      date,
      total,
    })),
    assistantLengthByStyle: [...styleLength.entries()].map(([style, row]) => ({
      style,
      avgAssistantChars: row.count > 0 ? row.sumChars / row.count : 0,
      n: row.count,
    })),
    personalizationModeUsage: toCountRows(modeUsage),
    latencyDistribution: toCountRows(latencyBuckets),
  };
}

export async function getAdminTestsMetrics(
  prisma: PrismaClient,
  filters: AdminFilters,
) {
  const since = parseWindow(filters.window);
  const [tests, attempts] = await Promise.all([
    prisma.generatedTest.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      },
      select: {
        id: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 4000,
    }),
    prisma.testAttempt.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filters.subjectId ? { test: { subjectId: filters.subjectId } } : {}),
      },
      select: {
        createdAt: true,
        score: true,
        byTagJson: true,
        testId: true,
      },
      orderBy: { createdAt: "asc" },
      take: 4000,
    }),
  ]);

  const generatedByDay = new Map<string, number>();
  const attemptedByDay = new Map<string, number>();
  const scoreByDifficulty = new Map<string, { sum: number; count: number }>();
  const predictionErrorByDay = new Map<string, { sumAbs: number; count: number }>();
  const scatter: Array<{
    predicted: number;
    actual: number;
    diff: number;
  }> = [];

  for (const test of tests) {
    const day = dayKey(test.createdAt);
    generatedByDay.set(day, (generatedByDay.get(day) ?? 0) + 1);
  }

  for (const attempt of attempts) {
    const meta = extractAttemptMeta(attempt.byTagJson);
    const policyMode = meta.policy?.policyMode ?? "unknown";
    const learningEligible = meta.learning?.eligible;
    if (!attemptMatchesFilters(policyMode, learningEligible, filters)) continue;

    const day = dayKey(attempt.createdAt);
    attemptedByDay.set(day, (attemptedByDay.get(day) ?? 0) + 1);

    const difficulty = extractDifficultyFromByTag(attempt.byTagJson) ?? "unknown";
    const diffAgg = scoreByDifficulty.get(difficulty) ?? { sum: 0, count: 0 };
    diffAgg.sum += attempt.score;
    diffAgg.count += 1;
    scoreByDifficulty.set(difficulty, diffAgg);

    const predicted = meta.prediction?.expectedAccuracy;
    const actual = meta.prediction?.actualAccuracy;
    if (typeof predicted === "number" && typeof actual === "number") {
      const err = Math.abs(predicted - actual);
      const trend = predictionErrorByDay.get(day) ?? { sumAbs: 0, count: 0 };
      trend.sumAbs += err;
      trend.count += 1;
      predictionErrorByDay.set(day, trend);

      if (scatter.length < 300) {
        scatter.push({
          predicted,
          actual,
          diff: predicted - actual,
        });
      }
    }
  }

  const completionRows = [...generatedByDay.entries()].map(([date, generated]) => {
    const completed = attemptedByDay.get(date) ?? 0;
    return {
      date,
      generated,
      completed,
      completionRate: generated > 0 ? completed / generated : 0,
    };
  });

  return {
    testsGeneratedPerDay: [...generatedByDay.entries()].map(([date, total]) => ({
      date,
      total,
    })),
    completionTrend: completionRows,
    avgScoreByDifficulty: [...scoreByDifficulty.entries()].map(([difficulty, row]) => ({
      difficulty,
      avgScore: row.count > 0 ? row.sum / row.count : 0,
      n: row.count,
    })),
    predictionErrorTrend: [...predictionErrorByDay.entries()].map(([date, row]) => ({
      date,
      mae: row.count > 0 ? row.sumAbs / row.count : null,
      n: row.count,
    })),
    predictedVsActualScatter: scatter,
  };
}
