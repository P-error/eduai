import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  getDatasetExportRecords,
  type DatasetExportRecord,
} from "@/lib/dataset-export";
import {
  clampQuestionCount,
  difficultyAccuracyAdjust,
} from "@/lib/prediction-baselines";
import {
  accuracyMlFeatureVectorToArray,
  buildAccuracyMlFeatureVectorFromInput,
} from "@/lib/prediction-feature-layer";
export { buildAccuracyMlFeatureInputFromHistory } from "@/lib/prediction-feature-layer";
import {
  ACCURACY_ML_FEATURE_SCHEMA,
  ACCURACY_ML_FEATURE_SCHEMA_VERSION,
  ARTIFACT_ML_BACKEND_ID,
  PREDICTION_MODEL_ARTIFACT_KIND,
  PREDICTION_MODEL_ARTIFACT_SCHEMA_VERSION,
  PREDICTION_RUNTIME_POLICY_ID,
  type AccuracyMlFeatureDescriptor,
  type AccuracyMlFeatureInput,
  type AccuracyMlFeatureName,
} from "@/lib/prediction-contract";

const DEFAULT_TIME_RANGE_DAYS = 30;
const DEFAULT_MAX_ATTEMPTS = 5000;
const MAX_MAX_ATTEMPTS = 10_000;
const DEFAULT_TRAIN_SPLIT = 0.8;
const MIN_TRAIN_ROWS = 12;
const MIN_EVAL_ROWS = 4;
const DEFAULT_ITERATIONS = 2500;
const DEFAULT_LEARNING_RATE = 0.15;
const DEFAULT_L2_LAMBDA = 0.001;
const EPSILON = 1e-6;

export const ML_ACCURACY_MODEL_VERSION = "ml_accuracy_logreg_v1_2026_03";
export const ML_ACCURACY_ARTIFACT_RELATIVE_PATH =
  "configs/ml_accuracy_logreg_artifact.local.json";
export const ML_ACCURACY_ARTIFACT_KIND = PREDICTION_MODEL_ARTIFACT_KIND;

const FEATURE_SCHEMA = ACCURACY_ML_FEATURE_SCHEMA;

export type AccuracyMlDatasetRecord = {
  datasetVersion: string;
  generatedAtIso: string;
  difficultyTarget: string | null;
  responseFormat: string | null;
  questionCount: number;
  userHistory_totalQuestionsBefore: number;
  userHistory_recentAccuracy: number | null;
  userHistory_betaPosteriorMean: number | null;
  userHistory_recentDurationPerQuestion: number | null;
  timeSinceLastAttemptSec: number | null;
  actualAccuracy: number | null;
  actualTotalDurationMs: number | null;
};

export type AccuracyMlHistoryAttempt = {
  createdAt: Date;
  questionCount: number;
  score: number;
  learningEligible: boolean | null;
};

type AccuracyMlTrainingExample = {
  features: number[];
  questionCount: number;
  successes: number;
  actualAccuracy: number;
};

type AccuracyMetricSummary = {
  sampleCount: number;
  questionEvidence: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  logLoss: number | null;
  calibrationBuckets: Array<{
    bucket: string;
    n: number;
    avgPredicted: number | null;
    avgActual: number | null;
    bias: number | null;
  }>;
};

export type AccuracyMlArtifact = {
  artifactKind: typeof ML_ACCURACY_ARTIFACT_KIND;
  artifactSchemaVersion: typeof PREDICTION_MODEL_ARTIFACT_SCHEMA_VERSION;
  runtimePolicyId: typeof PREDICTION_RUNTIME_POLICY_ID;
  backendKind: "artifact_ml";
  backendId: typeof ARTIFACT_ML_BACKEND_ID;
  modelFamily: "logistic_regression_binomial";
  predictionTargets: ["expected_accuracy"];
  modelVersion: string;
  trainedAt: string;
  featureSchemaVersion: typeof ACCURACY_ML_FEATURE_SCHEMA_VERSION;
  featureSchema: AccuracyMlFeatureDescriptor[];
  source: {
    mode: "db" | "file" | "synthetic";
    datasetVersion: string | null;
    generatedAtIso: string | null;
    inputPath: string | null;
    timeRangeDays: number | null;
    maxAttempts: number | null;
    eligibleOnly: boolean;
    consentOnly: boolean;
  };
  training: {
    algorithm: "logistic_regression_binomial";
    splitStrategy: "chronological_holdout_split";
    trainRatio: number;
    iterations: number;
    learningRate: number;
    l2Lambda: number;
    trainSampleCount: number;
    evalSampleCount: number;
    totalSampleCount: number;
  };
  model: {
    intercept: number;
    coefficients: Record<AccuracyMlFeatureName, number>;
  };
  evaluation: {
    ml: {
      train: AccuracyMetricSummary;
      eval: AccuracyMetricSummary | null;
    };
    heuristicV2Proxy: {
      train: AccuracyMetricSummary;
      eval: AccuracyMetricSummary | null;
    };
  };
  assumptions: string[];
};

export type AccuracyMlArtifactSnapshot =
  | {
      status: "ready";
      path: string;
      warning: null;
      artifact: AccuracyMlArtifact;
    }
  | {
      status: "missing" | "invalid";
      path: string;
      warning: string;
      artifact: null;
    };

export type AccuracyMlFirstEligibility = {
  ok: boolean;
  reason: string | null;
  details: {
    sourceMode: AccuracyMlArtifact["source"]["mode"] | null;
    eligibleOnly: boolean | null;
    consentOnly: boolean | null;
    trainSampleCount: number | null;
    evalSampleCount: number | null;
    evalMetricSampleCount: number | null;
  };
};

export type AccuracyMlArtifactEvidence = {
  artifactProvenance: string | null;
  productionEligible: boolean;
  researchEvidence: boolean;
  reason: string | null;
};

type AccuracyMlTrainOptions = {
  artifactPath?: string | null;
  datasetFilePath?: string | null;
  timeRangeDays?: number;
  maxAttempts?: number;
  eligibleOnly?: boolean;
  consentOnly?: boolean;
  splitRatio?: number;
  iterations?: number;
  learningRate?: number;
  l2Lambda?: number;
  sourceMode?: "db" | "file" | "synthetic";
  syntheticRecords?: AccuracyMlDatasetRecord[] | null;
};

type AccuracyMlTrainResult = {
  status: "ok" | "insufficient_data";
  artifactPath: string | null;
  artifact: AccuracyMlArtifact | null;
  source: AccuracyMlArtifact["source"];
  counts: {
    total: number;
    train: number;
    eval: number;
  };
  message?: string;
};

type AccuracyMlEvalOptions = {
  artifactPath?: string | null;
  datasetFilePath?: string | null;
  timeRangeDays?: number;
  maxAttempts?: number;
  eligibleOnly?: boolean;
  consentOnly?: boolean;
  splitRatio?: number;
  sourceMode?: "db" | "file" | "synthetic";
  syntheticRecords?: AccuracyMlDatasetRecord[] | null;
};

let artifactCache:
  | {
      cacheKey: string;
      snapshot: AccuracyMlArtifactSnapshot;
    }
  | null = null;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function clipProbability(value: number) {
  return Math.max(EPSILON, Math.min(1 - EPSILON, value));
}

function parsePositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseNullableString(value: unknown) {
  if (value === undefined) return undefined;
  return typeof value === "string" || value === null ? value : undefined;
}

function parseNullableNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseNumber(value) ?? undefined;
}

function resolveArtifactPath(pathOverride?: string | null) {
  const raw =
    pathOverride?.trim() ||
    process.env.EDUAI_ML_ARTIFACT_PATH?.trim() ||
    ML_ACCURACY_ARTIFACT_RELATIVE_PATH;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function resolveDatasetFilePath(pathOverride?: string | null) {
  const raw = pathOverride?.trim() || process.env.EDUAI_ML_DATASET_FILE?.trim() || "";
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function computeCacheKey(filePath: string) {
  if (!existsSync(filePath)) return "missing";
  try {
    const stat = statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function toRecordWithStringValues(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function hasMetricSummary(value: unknown) {
  const metric = toRecordWithStringValues(value);
  if (!metric) return false;
  const sampleCount = parseNumber(metric.sampleCount);
  const questionEvidence = parseNumber(metric.questionEvidence);
  const calibrationBuckets = metric.calibrationBuckets;
  if (
    sampleCount == null ||
    questionEvidence == null ||
    !Array.isArray(calibrationBuckets)
  ) {
    return false;
  }

  for (const field of ["mae", "rmse", "bias", "logLoss"] as const) {
    if (parseNullableNumber(metric[field]) === undefined) return false;
  }

  return true;
}

function hasArtifactSource(value: unknown) {
  const source = toRecordWithStringValues(value);
  if (!source) return false;
  const mode = source.mode;
  return (
    (mode === "db" || mode === "file" || mode === "synthetic") &&
    parseNullableString(source.datasetVersion) !== undefined &&
    parseNullableString(source.generatedAtIso) !== undefined &&
    parseNullableString(source.inputPath) !== undefined &&
    parseNullableNumber(source.timeRangeDays) !== undefined &&
    parseNullableNumber(source.maxAttempts) !== undefined &&
    parseBoolean(source.eligibleOnly) != null &&
    parseBoolean(source.consentOnly) != null
  );
}

function hasArtifactTraining(value: unknown) {
  const training = toRecordWithStringValues(value);
  if (!training) return false;
  return (
    training.algorithm === "logistic_regression_binomial" &&
    training.splitStrategy === "chronological_holdout_split" &&
    parseNumber(training.trainRatio) != null &&
    parseNumber(training.iterations) != null &&
    parseNumber(training.learningRate) != null &&
    parseNumber(training.l2Lambda) != null &&
    parseNumber(training.trainSampleCount) != null &&
    parseNumber(training.evalSampleCount) != null &&
    parseNumber(training.totalSampleCount) != null
  );
}

function hasArtifactEvaluation(value: unknown) {
  const evaluation = toRecordWithStringValues(value);
  const ml = toRecordWithStringValues(evaluation?.ml);
  const heuristic = toRecordWithStringValues(evaluation?.heuristicV2Proxy);
  if (!evaluation || !ml || !heuristic) return false;
  const mlEval = ml.eval == null ? null : ml.eval;
  const heuristicEval = heuristic.eval == null ? null : heuristic.eval;
  return (
    hasMetricSummary(ml.train) &&
    (mlEval == null || hasMetricSummary(mlEval)) &&
    hasMetricSummary(heuristic.train) &&
    (heuristicEval == null || hasMetricSummary(heuristicEval))
  );
}

function parseArtifact(payload: unknown): AccuracyMlArtifactSnapshot {
  const root = toRecordWithStringValues(payload);
  if (!root) {
    return {
      status: "invalid",
      path: "",
      warning: "artifact payload is not an object",
      artifact: null,
    };
  }

  const featureSchema = Array.isArray(root.featureSchema)
    ? root.featureSchema
    : null;
  const model = toRecordWithStringValues(root.model);
  const coefficients = toRecordWithStringValues(model?.coefficients);
  const intercept = parseNumber(model?.intercept);

  const hasSchema =
    featureSchema != null &&
    FEATURE_SCHEMA.every(
      (expected, index) =>
        toRecordWithStringValues(featureSchema[index])?.name === expected.name,
    );
  const hasCoefficients =
    coefficients != null &&
    FEATURE_SCHEMA.every(
      (feature) => typeof coefficients[feature.name] === "number",
    );

  if (
    root.artifactKind !== ML_ACCURACY_ARTIFACT_KIND ||
    root.artifactSchemaVersion !== PREDICTION_MODEL_ARTIFACT_SCHEMA_VERSION ||
    root.runtimePolicyId !== PREDICTION_RUNTIME_POLICY_ID ||
    root.backendKind !== "artifact_ml" ||
    root.backendId !== ARTIFACT_ML_BACKEND_ID ||
    root.modelFamily !== "logistic_regression_binomial" ||
    !Array.isArray(root.predictionTargets) ||
    root.predictionTargets.length !== 1 ||
    root.predictionTargets[0] !== "expected_accuracy" ||
    typeof root.modelVersion !== "string" ||
    typeof root.trainedAt !== "string" ||
    root.featureSchemaVersion !== ACCURACY_ML_FEATURE_SCHEMA_VERSION ||
    !hasSchema ||
    intercept == null ||
    !hasCoefficients ||
    !hasArtifactSource(root.source) ||
    !hasArtifactTraining(root.training) ||
    !hasArtifactEvaluation(root.evaluation)
  ) {
    return {
      status: "invalid",
      path: "",
      warning: "artifact is missing required fields",
      artifact: null,
    };
  }

  return {
    status: "ready",
    path: "",
    warning: null,
    artifact: root as unknown as AccuracyMlArtifact,
  };
}

export function getAccuracyMlArtifactMlFirstEligibility(
  artifact: AccuracyMlArtifact | null | undefined,
): AccuracyMlFirstEligibility {
  const details = {
    sourceMode: artifact?.source.mode ?? null,
    eligibleOnly: artifact?.source.eligibleOnly ?? null,
    consentOnly: artifact?.source.consentOnly ?? null,
    trainSampleCount: artifact?.training.trainSampleCount ?? null,
    evalSampleCount: artifact?.training.evalSampleCount ?? null,
    evalMetricSampleCount: artifact?.evaluation.ml.eval?.sampleCount ?? null,
  };

  if (!artifact) {
    return {
      ok: false,
      reason: "artifact_not_loaded",
      details,
    };
  }

  if (artifact.source.mode === "synthetic") {
    return {
      ok: false,
      reason: "synthetic_artifact_not_ml_first_eligible",
      details,
    };
  }

  if (artifact.source.eligibleOnly !== true) {
    return {
      ok: false,
      reason: "training_source_not_learning_eligible_only",
      details,
    };
  }

  if (artifact.source.consentOnly !== true) {
    return {
      ok: false,
      reason: "training_source_not_consent_only",
      details,
    };
  }

  if (
    artifact.training.trainSampleCount < MIN_TRAIN_ROWS ||
    artifact.training.evalSampleCount < MIN_EVAL_ROWS ||
    artifact.evaluation.ml.eval == null ||
    artifact.evaluation.ml.eval.sampleCount < MIN_EVAL_ROWS
  ) {
    return {
      ok: false,
      reason: "insufficient_train_eval_evidence",
      details,
    };
  }

  return {
    ok: true,
    reason: null,
    details,
  };
}

export function getAccuracyMlArtifactEvidence(
  artifact: AccuracyMlArtifact | null | undefined,
): AccuracyMlArtifactEvidence {
  if (!artifact) {
    return {
      artifactProvenance: null,
      productionEligible: false,
      researchEvidence: false,
      reason: "artifact_not_loaded",
    };
  }

  const eligibility = getAccuracyMlArtifactMlFirstEligibility(artifact);
  const artifactProvenance = eligibility.ok
    ? "production_eligible"
    : artifact.source.mode === "synthetic"
      ? "dev_synthetic"
      : artifact.source.mode === "db" &&
          (artifact.source.eligibleOnly !== true ||
            artifact.source.consentOnly !== true)
        ? "dev_unfiltered_db"
        : artifact.source.mode === "file" &&
            (artifact.source.eligibleOnly !== true ||
              artifact.source.consentOnly !== true)
          ? "dev_unfiltered_file"
          : "dev_not_production_eligible";

  return {
    artifactProvenance,
    productionEligible: eligibility.ok,
    researchEvidence: eligibility.ok,
    reason: eligibility.reason,
  };
}

export function loadAccuracyMlArtifactSnapshot(
  pathOverride?: string | null,
): AccuracyMlArtifactSnapshot {
  const artifactPath = resolveArtifactPath(pathOverride);
  const cacheKey = computeCacheKey(artifactPath);
  if (artifactCache && artifactCache.cacheKey === `${artifactPath}:${cacheKey}`) {
    return artifactCache.snapshot;
  }

  if (!existsSync(artifactPath)) {
    const snapshot: AccuracyMlArtifactSnapshot = {
      status: "missing",
      path: artifactPath,
      warning: "artifact_missing",
      artifact: null,
    };
    artifactCache = {
      cacheKey: `${artifactPath}:${cacheKey}`,
      snapshot,
    };
    return snapshot;
  }

  try {
    const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
    const loaded = parseArtifact(parsed);
    const snapshot: AccuracyMlArtifactSnapshot =
      loaded.status === "ready"
        ? { ...loaded, path: artifactPath }
        : {
            status: "invalid",
            path: artifactPath,
            warning: loaded.warning,
            artifact: null,
          };
    artifactCache = {
      cacheKey: `${artifactPath}:${cacheKey}`,
      snapshot,
    };
    return snapshot;
  } catch (error) {
    const snapshot: AccuracyMlArtifactSnapshot = {
      status: "invalid",
      path: artifactPath,
      warning:
        error instanceof Error ? `artifact_invalid:${error.message}` : "artifact_invalid",
      artifact: null,
    };
    artifactCache = {
      cacheKey: `${artifactPath}:${cacheKey}`,
      snapshot,
    };
    return snapshot;
  }
}

export function clearAccuracyMlArtifactCache() {
  artifactCache = null;
}

function predictProbability(
  artifact: AccuracyMlArtifact,
  features: number[],
) {
  const coefficients = artifact.model.coefficients;
  let logit = artifact.model.intercept;
  FEATURE_SCHEMA.forEach((feature, index) => {
    logit += coefficients[feature.name] * features[index];
  });
  return clamp01(sigmoid(logit));
}

function createCalibrationBuckets() {
  return Array.from({ length: 10 }, (_, index) => ({
    bucket: `${(index / 10).toFixed(1)}-${((index + 1) / 10).toFixed(1)}`,
    n: 0,
    predSum: 0,
    actualSum: 0,
  }));
}

function summarizeMetrics(
  rows: Array<{ predicted: number | null; actualAccuracy: number }>,
  questionEvidence: number,
  logLossWeighted: number,
  logLossWeightTotal: number,
) {
  const buckets = createCalibrationBuckets();
  let sampleCount = 0;
  let absSum = 0;
  let sqSum = 0;
  let diffSum = 0;

  for (const row of rows) {
    if (row.predicted == null) continue;
    sampleCount += 1;
    const diff = row.predicted - row.actualAccuracy;
    absSum += Math.abs(diff);
    sqSum += diff * diff;
    diffSum += diff;

    const bucketIndex = Math.min(
      9,
      Math.max(0, Math.floor(clamp01(row.predicted) * 10)),
    );
    const bucket = buckets[bucketIndex];
    bucket.n += 1;
    bucket.predSum += row.predicted;
    bucket.actualSum += row.actualAccuracy;
  }

  return {
    sampleCount,
    questionEvidence,
    mae: sampleCount > 0 ? absSum / sampleCount : null,
    rmse: sampleCount > 0 ? Math.sqrt(sqSum / sampleCount) : null,
    bias: sampleCount > 0 ? diffSum / sampleCount : null,
    logLoss: logLossWeightTotal > 0 ? logLossWeighted / logLossWeightTotal : null,
    calibrationBuckets: buckets.map((bucket) => ({
      bucket: bucket.bucket,
      n: bucket.n,
      avgPredicted: bucket.n > 0 ? bucket.predSum / bucket.n : null,
      avgActual: bucket.n > 0 ? bucket.actualSum / bucket.n : null,
      bias: bucket.n > 0 ? (bucket.predSum - bucket.actualSum) / bucket.n : null,
    })),
  } satisfies AccuracyMetricSummary;
}

function evaluateExamples(
  examples: AccuracyMlTrainingExample[],
  predictor: (features: number[]) => number | null,
) {
  const rows: Array<{ predicted: number | null; actualAccuracy: number }> = [];
  let questionEvidence = 0;
  let logLossWeighted = 0;
  let logLossWeightTotal = 0;

  for (const example of examples) {
    const predicted = predictor(example.features);
    rows.push({
      predicted,
      actualAccuracy: example.actualAccuracy,
    });

    if (predicted != null) {
      const clipped = clipProbability(predicted);
      logLossWeighted += -(
        example.successes * Math.log(clipped) +
        (example.questionCount - example.successes) * Math.log(1 - clipped)
      );
      logLossWeightTotal += example.questionCount;
      questionEvidence += example.questionCount;
    }
  }

  return summarizeMetrics(rows, questionEvidence, logLossWeighted, logLossWeightTotal);
}

function trainLogisticRegression(
  examples: AccuracyMlTrainingExample[],
  params: {
    iterations: number;
    learningRate: number;
    l2Lambda: number;
  },
) {
  const featureCount = FEATURE_SCHEMA.length;
  const weights = Array.from({ length: featureCount }, () => 0);
  let intercept = 0;
  const totalQuestionEvidence = Math.max(
    1,
    examples.reduce((sum, example) => sum + example.questionCount, 0),
  );

  for (let iteration = 0; iteration < params.iterations; iteration += 1) {
    const grad = Array.from({ length: featureCount }, () => 0);
    let gradIntercept = 0;

    for (const example of examples) {
      let logit = intercept;
      for (let index = 0; index < featureCount; index += 1) {
        logit += weights[index] * example.features[index];
      }
      const predicted = sigmoid(logit);
      const error = example.questionCount * predicted - example.successes;
      gradIntercept += error;
      for (let index = 0; index < featureCount; index += 1) {
        grad[index] += error * example.features[index];
      }
    }

    const step =
      params.learningRate / Math.sqrt(1 + iteration / 200);
    intercept -= step * (gradIntercept / totalQuestionEvidence);
    for (let index = 0; index < featureCount; index += 1) {
      const regularized =
        grad[index] / totalQuestionEvidence + params.l2Lambda * weights[index];
      weights[index] -= step * regularized;
    }
  }

  return {
    intercept,
    weights,
  };
}

function normalizeSplitRatio(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TRAIN_SPLIT;
  }
  return Math.max(0.5, Math.min(0.95, value));
}

function splitChronologically<T>(rows: T[], trainRatio: number) {
  if (rows.length <= 1) {
    return {
      train: rows,
      eval: [] as T[],
    };
  }
  const splitIndex = Math.max(
    1,
    Math.min(rows.length - 1, Math.floor(rows.length * trainRatio)),
  );
  return {
    train: rows.slice(0, splitIndex),
    eval: rows.slice(splitIndex),
  };
}

function recordToExample(record: AccuracyMlDatasetRecord): AccuracyMlTrainingExample | null {
  const actualAccuracy = parseNumber(record.actualAccuracy);
  if (actualAccuracy == null) return null;
  const questionCount = clampQuestionCount(record.questionCount);
  const successes = Math.max(
    0,
    Math.min(questionCount, Math.round(actualAccuracy * questionCount)),
  );
  const features = accuracyMlFeatureVectorToArray(
    buildAccuracyMlFeatureVectorFromInput({
      difficultyTarget: record.difficultyTarget,
      questionCount: record.questionCount,
      totalQuestionsBefore: record.userHistory_totalQuestionsBefore,
      recentAccuracy: record.userHistory_recentAccuracy,
      timeSinceLastAttemptSec: record.timeSinceLastAttemptSec,
    }),
  );

  return {
    features,
    questionCount,
    successes,
    actualAccuracy,
  };
}

function heuristicPredictionFromRecord(record: AccuracyMlDatasetRecord) {
  const betaPosterior = parseNumber(record.userHistory_betaPosteriorMean);
  if (betaPosterior == null) {
    return null;
  }
  return clamp01(
    betaPosterior + difficultyAccuracyAdjust(record.difficultyTarget),
  );
}

function parseJsonlRecords(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AccuracyMlDatasetRecord);
}

export function serializeAccuracyMlDatasetRecordsToJsonl(
  records: AccuracyMlDatasetRecord[],
) {
  if (records.length === 0) return "";
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function parseDatasetRecord(value: unknown): AccuracyMlDatasetRecord | null {
  const record = toRecordWithStringValues(value);
  if (!record) return null;

  const datasetVersion =
    typeof record.datasetVersion === "string" ? record.datasetVersion : null;
  const generatedAtIso =
    typeof record.generatedAtIso === "string" ? record.generatedAtIso : null;
  const questionCount = parseNumber(record.questionCount);
  const totalQuestionsBefore = parseNumber(record.userHistory_totalQuestionsBefore);

  if (
    datasetVersion == null ||
    generatedAtIso == null ||
    questionCount == null ||
    totalQuestionsBefore == null
  ) {
    return null;
  }

  return {
    datasetVersion,
    generatedAtIso,
    difficultyTarget:
      typeof record.difficultyTarget === "string" ? record.difficultyTarget : null,
    responseFormat:
      typeof record.responseFormat === "string" ? record.responseFormat : null,
    questionCount,
    userHistory_totalQuestionsBefore: totalQuestionsBefore,
    userHistory_recentAccuracy: parseNumber(record.userHistory_recentAccuracy),
    userHistory_betaPosteriorMean: parseNumber(
      record.userHistory_betaPosteriorMean,
    ),
    userHistory_recentDurationPerQuestion: parseNumber(
      record.userHistory_recentDurationPerQuestion,
    ),
    timeSinceLastAttemptSec: parseNumber(record.timeSinceLastAttemptSec),
    actualAccuracy: parseNumber(record.actualAccuracy),
    actualTotalDurationMs: parseNumber(record.actualTotalDurationMs),
  };
}

function mapDatasetExportRecord(
  record: DatasetExportRecord,
): AccuracyMlDatasetRecord {
  return {
    datasetVersion: record.datasetVersion,
    generatedAtIso: record.generatedAtIso,
    difficultyTarget: record.difficultyTarget,
    responseFormat: record.responseFormat,
    questionCount: record.questionCount,
    userHistory_totalQuestionsBefore: record.userHistory_totalQuestionsBefore,
    userHistory_recentAccuracy: record.userHistory_recentAccuracy,
    userHistory_betaPosteriorMean: record.userHistory_betaPosteriorMean,
    userHistory_recentDurationPerQuestion:
      record.userHistory_recentDurationPerQuestion,
    timeSinceLastAttemptSec: record.timeSinceLastAttemptSec,
    actualAccuracy: record.actualAccuracy,
    actualTotalDurationMs: record.actualTotalDurationMs,
  };
}

async function loadDatasetRecordsFromDb(
  prisma: PrismaClient,
  options: AccuracyMlTrainOptions | AccuracyMlEvalOptions,
) {
  const timeRangeDays = parsePositiveInt(
    options.timeRangeDays,
    DEFAULT_TIME_RANGE_DAYS,
    1,
    365,
  );
  const maxAttempts = parsePositiveInt(
    options.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_MAX_ATTEMPTS,
  );
  const eligibleOnly = options.eligibleOnly !== false;
  const consentOnly = options.consentOnly !== false;
  const exported = await getDatasetExportRecords(prisma, {
    timeRangeDays,
    maxAttempts,
    eligibleOnly,
    consentOnly,
    format: "jsonl",
  });

  return {
    records: exported.records.map((record) => mapDatasetExportRecord(record)),
    source: {
      mode: "db" as const,
      datasetVersion: exported.datasetVersion,
      generatedAtIso: exported.generatedAtIso,
      inputPath: null,
      timeRangeDays: exported.filters.timeRangeDays,
      maxAttempts: exported.filters.maxAttempts,
      eligibleOnly: exported.filters.eligibleOnly,
      consentOnly: exported.filters.consentOnly,
    },
  };
}

function loadDatasetRecordsFromFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const parsed = parseJsonlRecords(content)
    .map((record) => parseDatasetRecord(record))
    .filter((record): record is AccuracyMlDatasetRecord => record != null);

  const first = parsed[0] ?? null;
  return {
    records: parsed,
    source: {
      mode: "file" as const,
      datasetVersion: first?.datasetVersion ?? null,
      generatedAtIso: first?.generatedAtIso ?? null,
      inputPath: filePath,
      timeRangeDays: null,
      maxAttempts: null,
      eligibleOnly: true,
      consentOnly: true,
    },
  };
}

async function loadDatasetRecords(
  prisma: PrismaClient | null,
  options: AccuracyMlTrainOptions | AccuracyMlEvalOptions,
) {
  if (options.sourceMode === "synthetic" && options.syntheticRecords) {
    return {
      records: options.syntheticRecords,
      source: {
        mode: "synthetic" as const,
        datasetVersion: options.syntheticRecords[0]?.datasetVersion ?? "synthetic",
        generatedAtIso:
          options.syntheticRecords[0]?.generatedAtIso ?? new Date().toISOString(),
        inputPath: null,
        timeRangeDays: null,
        maxAttempts: null,
        eligibleOnly: true,
        consentOnly: true,
      },
    };
  }

  const datasetFilePath = resolveDatasetFilePath(options.datasetFilePath);
  if (datasetFilePath) {
    return loadDatasetRecordsFromFile(datasetFilePath);
  }

  if (!prisma) {
    throw new Error("DB source requested but Prisma client is missing.");
  }

  return loadDatasetRecordsFromDb(prisma, options);
}

function buildArtifact(params: {
  source: AccuracyMlArtifact["source"];
  trainExamples: AccuracyMlTrainingExample[];
  evalExamples: AccuracyMlTrainingExample[];
  fitted: { intercept: number; weights: number[] };
  learningRate: number;
  l2Lambda: number;
  iterations: number;
  trainMetrics: AccuracyMetricSummary;
  evalMetrics: AccuracyMetricSummary | null;
  heuristicTrainMetrics: AccuracyMetricSummary;
  heuristicEvalMetrics: AccuracyMetricSummary | null;
  totalSampleCount: number;
  trainRatio: number;
}) {
  const coefficients = FEATURE_SCHEMA.reduce(
    (acc, feature, index) => {
      acc[feature.name] = params.fitted.weights[index];
      return acc;
    },
    {} as Record<AccuracyMlFeatureName, number>,
  );

  return {
    artifactKind: ML_ACCURACY_ARTIFACT_KIND,
    artifactSchemaVersion: PREDICTION_MODEL_ARTIFACT_SCHEMA_VERSION,
    runtimePolicyId: PREDICTION_RUNTIME_POLICY_ID,
    backendKind: "artifact_ml",
    backendId: ARTIFACT_ML_BACKEND_ID,
    modelFamily: "logistic_regression_binomial",
    predictionTargets: ["expected_accuracy"],
    modelVersion: ML_ACCURACY_MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    featureSchemaVersion: ACCURACY_ML_FEATURE_SCHEMA_VERSION,
    featureSchema: [...FEATURE_SCHEMA],
    source: params.source,
    training: {
      algorithm: "logistic_regression_binomial",
      splitStrategy: "chronological_holdout_split",
      trainRatio: params.trainRatio,
      iterations: params.iterations,
      learningRate: params.learningRate,
      l2Lambda: params.l2Lambda,
      trainSampleCount: params.trainExamples.length,
      evalSampleCount: params.evalExamples.length,
      totalSampleCount: params.totalSampleCount,
    },
    model: {
      intercept: params.fitted.intercept,
      coefficients,
    },
    evaluation: {
      ml: {
        train: params.trainMetrics,
        eval: params.evalMetrics,
      },
      heuristicV2Proxy: {
        train: params.heuristicTrainMetrics,
        eval: params.heuristicEvalMetrics,
      },
    },
    assumptions: [
      "This model predicts expectedAccuracy only; duration prediction remains the existing unified heuristic path.",
      "Features are restricted to replay-safe pre-attempt information.",
      "response_format is normalized to the current runtime surface (mcq only) and is not used as a learned feature.",
      "The model is a simple offline logistic regression trained on question-level aggregated outcomes.",
    ],
  } satisfies AccuracyMlArtifact;
}

export function predictExpectedAccuracyFromMlArtifact(params: {
  artifact: AccuracyMlArtifact;
  featureInput: AccuracyMlFeatureInput;
}) {
  const features = accuracyMlFeatureVectorToArray(
    buildAccuracyMlFeatureVectorFromInput(params.featureInput),
  );
  const value = predictProbability(params.artifact, features);
  return {
    value,
    confidence: clamp01(params.featureInput.totalQuestionsBefore / 100),
    basis: `${params.artifact.modelVersion}|logistic_regression_offline_artifact`,
  };
}

export async function trainAccuracyMlArtifact(
  prisma: PrismaClient | null,
  options: AccuracyMlTrainOptions = {},
): Promise<AccuracyMlTrainResult> {
  const loaded = await loadDatasetRecords(prisma, options);
  const labeledRecords = loaded.records.filter(
    (record) => parseNumber(record.actualAccuracy) != null,
  );
  const examples = labeledRecords
    .map((record) => recordToExample(record))
    .filter((record): record is AccuracyMlTrainingExample => record != null);
  const splitRatio = normalizeSplitRatio(options.splitRatio);
  const split = splitChronologically(examples, splitRatio);

  if (split.train.length < MIN_TRAIN_ROWS || split.eval.length < MIN_EVAL_ROWS) {
    return {
      status: "insufficient_data",
      artifactPath: null,
      artifact: null,
      source: loaded.source,
      counts: {
        total: examples.length,
        train: split.train.length,
        eval: split.eval.length,
      },
      message:
        "Not enough dataset-export rows for a stable chronological train/eval split.",
    };
  }

  const iterations = parsePositiveInt(
    options.iterations,
    DEFAULT_ITERATIONS,
    100,
    20_000,
  );
  const learningRate =
    typeof options.learningRate === "number" && Number.isFinite(options.learningRate)
      ? Math.max(0.0001, Math.min(2, options.learningRate))
      : DEFAULT_LEARNING_RATE;
  const l2Lambda =
    typeof options.l2Lambda === "number" && Number.isFinite(options.l2Lambda)
      ? Math.max(0, Math.min(1, options.l2Lambda))
      : DEFAULT_L2_LAMBDA;

  const fitted = trainLogisticRegression(split.train, {
    iterations,
    learningRate,
    l2Lambda,
  });

  const predictor = (features: number[]) =>
    clamp01(sigmoid(
      fitted.intercept +
        features.reduce(
          (sum, value, index) => sum + value * fitted.weights[index],
          0,
        ),
    ));
  const heuristicPredictor = (
    record: AccuracyMlDatasetRecord,
  ) => heuristicPredictionFromRecord(record);

  const trainMetrics = evaluateExamples(split.train, predictor);
  const evalMetrics =
    split.eval.length > 0 ? evaluateExamples(split.eval, predictor) : null;
  const heuristicTrainMetrics = summarizeMetrics(
    labeledRecords
      .slice(0, split.train.length)
      .map((record) => ({
        predicted: heuristicPredictor(record),
        actualAccuracy: record.actualAccuracy ?? 0,
      })),
    split.train.reduce((sum, example) => sum + example.questionCount, 0),
    0,
    0,
  );
  const heuristicEvalMetrics =
    split.eval.length > 0
      ? summarizeMetrics(
          labeledRecords
            .slice(split.train.length)
            .map((record) => ({
              predicted: heuristicPredictor(record),
              actualAccuracy: record.actualAccuracy ?? 0,
            })),
          split.eval.reduce((sum, example) => sum + example.questionCount, 0),
          0,
          0,
        )
      : null;

  const artifact = buildArtifact({
    source: loaded.source,
    trainExamples: split.train,
    evalExamples: split.eval,
    fitted,
    learningRate,
    l2Lambda,
    iterations,
    trainMetrics,
    evalMetrics,
    heuristicTrainMetrics,
    heuristicEvalMetrics,
    totalSampleCount: examples.length,
    trainRatio: splitRatio,
  });

  const artifactPath = resolveArtifactPath(options.artifactPath);
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  clearAccuracyMlArtifactCache();

  return {
    status: "ok",
    artifactPath,
    artifact,
    source: loaded.source,
    counts: {
      total: examples.length,
      train: split.train.length,
      eval: split.eval.length,
    },
  };
}

export async function evaluateAccuracyMlPolicies(
  prisma: PrismaClient | null,
  options: AccuracyMlEvalOptions = {},
) {
  const loaded = await loadDatasetRecords(prisma, options);
  const labeledRecords = loaded.records.filter(
    (record) => parseNumber(record.actualAccuracy) != null,
  );
  const splitRatio = normalizeSplitRatio(options.splitRatio);
  const split = splitChronologically(labeledRecords, splitRatio);

  if (split.eval.length < MIN_EVAL_ROWS) {
    return {
      status: "insufficient_data" as const,
      source: loaded.source,
      counts: {
        total: labeledRecords.length,
        eval: split.eval.length,
      },
      message:
        "Not enough dataset-export rows for a stable chronological holdout evaluation.",
    };
  }

  const snapshot = loadAccuracyMlArtifactSnapshot(options.artifactPath);
  if (snapshot.status !== "ready") {
    return {
      status: "missing_artifact" as const,
      artifactPath: snapshot.path,
      warning: snapshot.warning,
      source: loaded.source,
      counts: {
        total: labeledRecords.length,
        eval: split.eval.length,
      },
    };
  }

  const mlEvalRows = split.eval
    .map((record) => recordToExample(record))
    .filter((record): record is AccuracyMlTrainingExample => record != null);

  const mlMetrics = evaluateExamples(mlEvalRows, (features) =>
    predictProbability(snapshot.artifact, features),
  );
  const heuristicMetrics = summarizeMetrics(
    split.eval.map((record) => ({
      predicted: heuristicPredictionFromRecord(record),
      actualAccuracy: record.actualAccuracy ?? 0,
    })),
    mlEvalRows.reduce((sum, record) => sum + record.questionCount, 0),
    0,
    0,
  );

  return {
    status: "ok" as const,
    artifactPath: snapshot.path,
    artifactModelVersion: snapshot.artifact.modelVersion,
    source: loaded.source,
    holdout: {
      rowCount: split.eval.length,
      heuristicV2Proxy: heuristicMetrics,
      mlPolicyV3: mlMetrics,
    },
  };
}

export function buildSyntheticAccuracyMlDatasetRecords() {
  const records: AccuracyMlDatasetRecord[] = [];

  for (let index = 0; index < 72; index += 1) {
    const difficultyTarget =
      index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard";
    const questionCount = 4 + (index % 4);
    const totalQuestionsBefore = index === 0 ? 0 : Math.max(0, (index - 1) * 4);
    const recentAccuracy =
      index < 3
        ? null
        : clamp01(0.55 + Math.sin(index / 4) * 0.18 + (difficultyTarget === "easy" ? 0.1 : difficultyTarget === "hard" ? -0.1 : 0));
    const timeSinceLastAttemptSec =
      index < 2 ? null : 14_400 + (index % 6) * 18_000;

    const logit =
      -0.2 +
      (difficultyTarget === "easy" ? 0.55 : 0) +
      (difficultyTarget === "hard" ? -0.6 : 0) +
      ((questionCount - 5) / 5) * -0.2 +
      (Math.log1p(totalQuestionsBefore) / 5) * 0.5 +
      (((recentAccuracy ?? 0.5) - 0.5) * 2) * 1.1 +
      (timeSinceLastAttemptSec == null
        ? -0.1
        : Math.log1p(timeSinceLastAttemptSec / 86_400) * -0.18);
    const probability = clamp01(sigmoid(logit));
    const successes = Math.max(
      0,
      Math.min(questionCount, Math.round(probability * questionCount)),
    );
    const actualAccuracy = successes / questionCount;
    const betaPosteriorMean =
      totalQuestionsBefore > 0
        ? clamp01(
            recentAccuracy == null
              ? 0.5
              : recentAccuracy * 0.75 + 0.125,
          )
        : null;

    records.push({
      datasetVersion: "synthetic_accuracy_dataset_v1",
      generatedAtIso: "2026-03-27T00:00:00.000Z",
      difficultyTarget,
      responseFormat: "mcq",
      questionCount,
      userHistory_totalQuestionsBefore: totalQuestionsBefore,
      userHistory_recentAccuracy: recentAccuracy,
      userHistory_betaPosteriorMean: betaPosteriorMean,
      userHistory_recentDurationPerQuestion: null,
      timeSinceLastAttemptSec,
      actualAccuracy,
      actualTotalDurationMs: null,
    });
  }

  return records;
}

export function writeSyntheticAccuracyMlDatasetFixture(filePath: string) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    serializeAccuracyMlDatasetRecordsToJsonl(
      buildSyntheticAccuracyMlDatasetRecords(),
    ),
    "utf8",
  );
  return {
    path: absolutePath,
    recordCount: buildSyntheticAccuracyMlDatasetRecords().length,
  };
}

export async function runAccuracyMlSyntheticSelfCheck() {
  const datasetPath = path.join(
    process.env.TMPDIR || "/tmp",
    "eduai-ml-accuracy-self-check-dataset.jsonl",
  );
  const artifactPath = path.join(
    process.env.TMPDIR || "/tmp",
    "eduai-ml-accuracy-self-check-artifact.json",
  );
  writeSyntheticAccuracyMlDatasetFixture(datasetPath);
  const trained = await trainAccuracyMlArtifact(null, {
    datasetFilePath: datasetPath,
    artifactPath,
  });

  if (trained.status !== "ok" || !trained.artifact) {
    throw new Error("ml accuracy self-check failed: training did not produce an artifact");
  }

  const evalResult = await evaluateAccuracyMlPolicies(null, {
    datasetFilePath: datasetPath,
    artifactPath,
  });

  if (evalResult.status !== "ok") {
    throw new Error("ml accuracy self-check failed: evaluation did not run");
  }

  const mlRmse = evalResult.holdout.mlPolicyV3.rmse;
  const heuristicRmse = evalResult.holdout.heuristicV2Proxy.rmse;

  if (mlRmse == null || heuristicRmse == null) {
    throw new Error("ml accuracy self-check failed: missing holdout RMSE");
  }

  if (mlRmse >= heuristicRmse) {
    throw new Error(
      `ml accuracy self-check failed: expected ML RMSE < heuristic RMSE (${mlRmse} >= ${heuristicRmse})`,
    );
  }

  const snapshot = loadAccuracyMlArtifactSnapshot(artifactPath);
  if (snapshot.status !== "ready") {
    throw new Error("ml accuracy self-check failed: saved artifact could not be reloaded");
  }

  return {
    ok: true,
    datasetPath,
    artifactPath,
    modelVersion: snapshot.artifact.modelVersion,
    trainRows: trained.counts.train,
    evalRows: trained.counts.eval,
    heuristicEvalRmse: heuristicRmse,
    mlEvalRmse: mlRmse,
    note: "Synthetic logistic-pattern dataset is learned better by the offline ML baseline than by the heuristic proxy.",
  };
}
