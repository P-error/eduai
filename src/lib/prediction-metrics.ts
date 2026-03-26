import { PrismaClient } from "@prisma/client";

type WindowKey = "all" | "7d" | "30d";
type PolicyFilter =
  | "any"
  | "personalization_on"
  | "personalization_off"
  | "manual_delivery_override";

type MetricSample = {
  predicted: number;
  actual: number;
  policyMode: string;
};

type ParsedAttempt = {
  policyMode: string;
  learningEligible: boolean | null;
  predictedAccuracy: number | null;
  predictedDurationMs: number | null;
  durationConfidence: number;
  durationBasis: string;
  predictorVersion: string | null;
  actualAccuracy: number | null;
  actualDurationMs: number | null;
};

type Filters = {
  window: WindowKey;
  policyMode: PolicyFilter;
  subjectId?: string | null;
  userId?: string | null;
  includeExcluded?: boolean;
};

const MAX_ATTEMPTS = 2000;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parsePredictionMeta(byTagJson: unknown): ParsedAttempt {
  const root =
    byTagJson && typeof byTagJson === "object"
      ? (byTagJson as Record<string, unknown>)
      : {};
  const meta =
    root._meta && typeof root._meta === "object"
      ? (root._meta as Record<string, unknown>)
      : {};
  const policy =
    meta.policy && typeof meta.policy === "object"
      ? (meta.policy as Record<string, unknown>)
      : {};
  const learning =
    meta.learning && typeof meta.learning === "object"
      ? (meta.learning as Record<string, unknown>)
      : {};
  const prediction =
    meta.prediction && typeof meta.prediction === "object"
      ? (meta.prediction as Record<string, unknown>)
      : {};

  const predictedAccuracy = parseNumber(prediction.expectedAccuracy);
  const predictedDurationMs = parseNumber(prediction.expectedTotalDurationMs);
  const durationConfidenceRaw = parseNumber(prediction.durationConfidence);
  const durationConfidence =
    durationConfidenceRaw == null ? 0 : clamp01(durationConfidenceRaw);
  const durationBasis =
    typeof prediction.durationBasis === "string"
      ? prediction.durationBasis
      : "baseline_only";
  const predictorVersion =
    typeof prediction.predictorVersion === "string"
      ? prediction.predictorVersion
      : null;
  const actualAccuracy = parseNumber(prediction.actualAccuracy);
  const actualDurationMs = parseNumber(prediction.actualTotalDurationMs);

  const policyMode =
    typeof prediction.policyMode === "string"
      ? prediction.policyMode
      : typeof policy.policyMode === "string"
        ? policy.policyMode
        : "unknown";

  const learningEligible =
    typeof learning.eligible === "boolean" ? learning.eligible : null;

  return {
    policyMode,
    learningEligible,
    predictedAccuracy,
    predictedDurationMs,
    durationConfidence,
    durationBasis,
    predictorVersion,
    actualAccuracy,
    actualDurationMs,
  };
}

function computeErrorStats(samples: MetricSample[]) {
  if (samples.length === 0) {
    return { mae: null, rmse: null, bias: null };
  }
  const diffs = samples.map((sample) => sample.predicted - sample.actual);
  const mae = diffs.reduce((sum, diff) => sum + Math.abs(diff), 0) / diffs.length;
  const mse = diffs.reduce((sum, diff) => sum + diff * diff, 0) / diffs.length;
  const bias = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
  return {
    mae,
    rmse: Math.sqrt(mse),
    bias,
  };
}

function topReasons(counter: Map<string, number>) {
  return [...counter.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function bucketAccuracy(predicted: number) {
  if (predicted < 0.2) return "0.0–0.2";
  if (predicted < 0.4) return "0.2–0.4";
  if (predicted < 0.6) return "0.4–0.6";
  if (predicted < 0.8) return "0.6–0.8";
  return "0.8–1.0";
}

function bucketDuration(predictedMs: number) {
  if (predictedMs < 30_000) return "<30s";
  if (predictedMs < 60_000) return "30–60s";
  if (predictedMs < 120_000) return "60–120s";
  if (predictedMs < 240_000) return "120–240s";
  return "240s+";
}

function bucketRows(
  labels: string[],
  samples: MetricSample[],
  bucketFn: (predicted: number) => string,
) {
  const grouped = new Map<string, MetricSample[]>();
  labels.forEach((label) => grouped.set(label, []));
  for (const sample of samples) {
    const bucket = bucketFn(sample.predicted);
    const current = grouped.get(bucket) ?? [];
    current.push(sample);
    grouped.set(bucket, current);
  }

  return labels.map((bucket) => {
    const entries = grouped.get(bucket) ?? [];
    if (entries.length === 0) {
      return {
        bucket,
        n: 0,
        predAvg: null,
        actualAvg: null,
        bias: null,
      };
    }
    const predAvg =
      entries.reduce((sum, entry) => sum + entry.predicted, 0) / entries.length;
    const actualAvg =
      entries.reduce((sum, entry) => sum + entry.actual, 0) / entries.length;
    return {
      bucket,
      n: entries.length,
      predAvg,
      actualAvg,
      bias: predAvg - actualAvg,
    };
  });
}

export async function getPredictionMetrics(
  prisma: PrismaClient,
  filters: Filters,
) {
  const now = new Date();
  const since =
    filters.window === "7d"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : filters.window === "30d"
        ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        : null;

  const attempts = await prisma.testAttempt.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(filters.subjectId ? { test: { subjectId: filters.subjectId } } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    select: {
      byTagJson: true,
      testId: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ATTEMPTS,
  });

  const accuracySamples: MetricSample[] = [];
  const durationSamples: MetricSample[] = [];
  const accuracyExcluded = new Map<string, number>();
  const durationExcluded = new Map<string, number>();
  const durationBasisCounter = new Map<string, number>();
  const durationPredictorVersions = new Map<string, number>();

  const byPolicy = new Map<
    string,
    { accuracy: MetricSample[]; duration: MetricSample[] }
  >();

  for (const attempt of attempts) {
    const parsed = parsePredictionMeta(attempt.byTagJson);
    durationBasisCounter.set(
      parsed.durationBasis,
      (durationBasisCounter.get(parsed.durationBasis) ?? 0) + 1,
    );
    const predictorVersionLabel = parsed.predictorVersion ?? "legacy_unversioned";
    durationPredictorVersions.set(
      predictorVersionLabel,
      (durationPredictorVersions.get(predictorVersionLabel) ?? 0) + 1,
    );

    if (
      filters.policyMode !== "any" &&
      parsed.policyMode !== filters.policyMode
    ) {
      accuracyExcluded.set("FILTERED_OUT", (accuracyExcluded.get("FILTERED_OUT") ?? 0) + 1);
      durationExcluded.set("FILTERED_OUT", (durationExcluded.get("FILTERED_OUT") ?? 0) + 1);
      continue;
    }

    if (!filters.includeExcluded && parsed.learningEligible === false) {
      accuracyExcluded.set("FILTERED_OUT", (accuracyExcluded.get("FILTERED_OUT") ?? 0) + 1);
      durationExcluded.set("FILTERED_OUT", (durationExcluded.get("FILTERED_OUT") ?? 0) + 1);
      continue;
    }

    const policySlot = byPolicy.get(parsed.policyMode) ?? {
      accuracy: [],
      duration: [],
    };

    if (parsed.predictedAccuracy == null) {
      accuracyExcluded.set(
        "MISSING_PREDICTION",
        (accuracyExcluded.get("MISSING_PREDICTION") ?? 0) + 1,
      );
    } else if (parsed.actualAccuracy == null) {
      accuracyExcluded.set(
        "MISSING_ACTUAL",
        (accuracyExcluded.get("MISSING_ACTUAL") ?? 0) + 1,
      );
    } else if (
      parsed.predictedAccuracy < 0 ||
      parsed.predictedAccuracy > 1 ||
      parsed.actualAccuracy < 0 ||
      parsed.actualAccuracy > 1
    ) {
      accuracyExcluded.set("OUT_OF_RANGE", (accuracyExcluded.get("OUT_OF_RANGE") ?? 0) + 1);
    } else {
      const sample = {
        predicted: clamp01(parsed.predictedAccuracy),
        actual: clamp01(parsed.actualAccuracy),
        policyMode: parsed.policyMode,
      };
      accuracySamples.push(sample);
      policySlot.accuracy.push(sample);
    }

    if (parsed.predictedDurationMs == null) {
      durationExcluded.set(
        "MISSING_PREDICTION",
        (durationExcluded.get("MISSING_PREDICTION") ?? 0) + 1,
      );
    } else if (parsed.actualDurationMs == null) {
      durationExcluded.set(
        "MISSING_TELEMETRY",
        (durationExcluded.get("MISSING_TELEMETRY") ?? 0) + 1,
      );
    } else if (parsed.predictedDurationMs < 0 || parsed.actualDurationMs < 0) {
      durationExcluded.set("OUT_OF_RANGE", (durationExcluded.get("OUT_OF_RANGE") ?? 0) + 1);
    } else {
      const sample = {
        predicted: parsed.predictedDurationMs,
        actual: parsed.actualDurationMs,
        policyMode: parsed.policyMode,
      };
      durationSamples.push(sample);
      policySlot.duration.push(sample);
    }

    byPolicy.set(parsed.policyMode, policySlot);
  }

  const accuracyStats = computeErrorStats(accuracySamples);
  const durationStats = computeErrorStats(durationSamples);

  const accuracyDiffs = accuracySamples.map((sample) => sample.predicted - sample.actual);
  const overRate =
    accuracyDiffs.length > 0
      ? accuracyDiffs.filter((value) => value > 0).length / accuracyDiffs.length
      : null;
  const underRate =
    accuracyDiffs.length > 0
      ? accuracyDiffs.filter((value) => value < 0).length / accuracyDiffs.length
      : null;

  const accuracyBuckets = bucketRows(
    ["0.0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1.0"],
    accuracySamples,
    bucketAccuracy,
  );

  const durationBuckets = bucketRows(
    ["<30s", "30–60s", "60–120s", "120–240s", "240s+"],
    durationSamples,
    bucketDuration,
  );

  const byPolicyMode = [...byPolicy.entries()].map(([policyMode, samples]) => {
    const a = computeErrorStats(samples.accuracy);
    const d = computeErrorStats(samples.duration);
    return {
      policyMode,
      accuracy: {
        n: samples.accuracy.length,
        mae: a.mae,
        bias: a.bias,
      },
      durationMs: {
        n: samples.duration.length,
        mae: d.mae,
        bias: d.bias,
      },
    };
  });

  byPolicyMode.sort((a, b) => b.accuracy.n - a.accuracy.n);

  return {
    window: filters.window,
    filters: {
      policyMode: filters.policyMode,
      subjectId: filters.subjectId ?? null,
      userId: filters.userId ?? null,
      includeExcluded: Boolean(filters.includeExcluded),
      maxAttemptsScanned: MAX_ATTEMPTS,
      eligibility: filters.includeExcluded
        ? "all_samples"
        : "learningEligible!=false",
    },
    samples: {
      accuracy: {
        n: accuracySamples.length,
        excluded: [...accuracyExcluded.values()].reduce((sum, count) => sum + count, 0),
        reasonsTop: topReasons(accuracyExcluded),
      },
      duration: {
        n: durationSamples.length,
        excluded: [...durationExcluded.values()].reduce((sum, count) => sum + count, 0),
        reasonsTop: topReasons(durationExcluded),
        basisTop: topReasons(durationBasisCounter),
        predictorVersions: topReasons(durationPredictorVersions),
      },
    },
    accuracy: {
      mae: accuracyStats.mae,
      rmse: accuracyStats.rmse,
      bias: accuracyStats.bias,
      overRate,
      underRate,
      byBucket: accuracyBuckets,
    },
    durationMs: {
      mae: durationStats.mae,
      rmse: durationStats.rmse,
      bias: durationStats.bias,
      byBucket: durationBuckets,
    },
    byPolicyMode,
    notes: {
      interpretation: [
        "Lower MAE/RMSE indicates better calibration between predicted and actual outcomes.",
        "Positive bias means systematic overprediction; negative bias means underprediction.",
        "Always interpret metrics alongside sample size and exclusion reasons.",
      ],
      limitations: [
        "Predictions are heuristic proxies, not causal estimates of learning gain.",
        "Duration metrics depend on telemetry availability and can be sparse.",
        "Metrics are computed on up to 2000 recent attempts per request window.",
      ],
    },
  };
}
