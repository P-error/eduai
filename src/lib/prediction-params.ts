import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PredictionModelParams = {
  diffAdjustMag: number;
  betaA: number;
  betaB: number;
  durationPriorQuestions: number;
  durationFullEvidenceQuestions: number;
};

export type PredictionModelParamsSource = "defaults" | "config";

export const PREDICTION_MODEL_PARAMS_VERSION = "prediction_calibration_v1_2026_02";
export const CALIBRATED_PARAMS_FILE_RELATIVE_PATH = "configs/calibrated_params.json";

export const DEFAULT_PREDICTION_MODEL_PARAMS: PredictionModelParams = {
  diffAdjustMag: 0.07,
  betaA: 1,
  betaB: 1,
  durationPriorQuestions: 20,
  durationFullEvidenceQuestions: 100,
};

type PredictionModelParamsFilePayload = {
  version: string;
  appliedAtIso: string;
  params: PredictionModelParams;
};

type PredictionModelParamsSnapshot = {
  source: PredictionModelParamsSource;
  path: string;
  exists: boolean;
  warning: string | null;
  params: PredictionModelParams;
  raw: unknown | null;
};

type CacheEntry = {
  cacheKey: string;
  snapshot: PredictionModelParamsSnapshot;
};

let cache: CacheEntry | null = null;

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMagnitude(value: unknown, fallback: number) {
  const parsed = parseNumber(value);
  if (parsed == null) return fallback;
  return clamp(parsed, 0, 0.3);
}

function normalizeBeta(value: unknown, fallback: number) {
  const parsed = parseNumber(value);
  if (parsed == null) return fallback;
  return clamp(parsed, 0.01, 100);
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = parseNumber(value);
  if (parsed == null) return fallback;
  return clamp(Math.floor(parsed), min, max);
}

export function normalizePredictionModelParams(
  input: Partial<PredictionModelParams> | null | undefined,
  fallback: PredictionModelParams = DEFAULT_PREDICTION_MODEL_PARAMS,
): PredictionModelParams {
  const source = input ?? {};
  return {
    diffAdjustMag: normalizeMagnitude(source.diffAdjustMag, fallback.diffAdjustMag),
    betaA: normalizeBeta(source.betaA, fallback.betaA),
    betaB: normalizeBeta(source.betaB, fallback.betaB),
    durationPriorQuestions: normalizeInt(
      source.durationPriorQuestions,
      fallback.durationPriorQuestions,
      1,
      5000,
    ),
    durationFullEvidenceQuestions: normalizeInt(
      source.durationFullEvidenceQuestions,
      fallback.durationFullEvidenceQuestions,
      1,
      5000,
    ),
  };
}

function absoluteConfigPath() {
  return path.join(process.cwd(), CALIBRATED_PARAMS_FILE_RELATIVE_PATH);
}

function computeCacheKey(configPath: string) {
  if (!existsSync(configPath)) return "missing";
  try {
    const stat = statSync(configPath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function loadSnapshot(configPath: string): PredictionModelParamsSnapshot {
  if (!existsSync(configPath)) {
    return {
      source: "defaults",
      path: CALIBRATED_PARAMS_FILE_RELATIVE_PATH,
      exists: false,
      warning: null,
      params: { ...DEFAULT_PREDICTION_MODEL_PARAMS },
      raw: null,
    };
  }

  try {
    const text = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(text) as {
      params?: Partial<PredictionModelParams>;
    };
    const normalized = normalizePredictionModelParams(parsed?.params);
    return {
      source: "config",
      path: CALIBRATED_PARAMS_FILE_RELATIVE_PATH,
      exists: true,
      warning: null,
      params: normalized,
      raw: parsed ?? null,
    };
  } catch (error) {
    return {
      source: "defaults",
      path: CALIBRATED_PARAMS_FILE_RELATIVE_PATH,
      exists: true,
      warning:
        error instanceof Error
          ? `invalid_config_fallback_to_defaults: ${error.message}`
          : "invalid_config_fallback_to_defaults",
      params: { ...DEFAULT_PREDICTION_MODEL_PARAMS },
      raw: null,
    };
  }
}

export function clearPredictionModelParamsCache() {
  cache = null;
}

export function getPredictionModelParamsSnapshot(): PredictionModelParamsSnapshot {
  const configPath = absoluteConfigPath();
  const cacheKey = computeCacheKey(configPath);
  if (cache && cache.cacheKey === cacheKey) {
    return cache.snapshot;
  }
  const snapshot = loadSnapshot(configPath);
  cache = { cacheKey, snapshot };
  return snapshot;
}

export function getActivePredictionModelParams() {
  return getPredictionModelParamsSnapshot().params;
}

export function writeCalibratedPredictionParamsConfig(params: PredictionModelParams) {
  const normalized = normalizePredictionModelParams(params);
  const payload: PredictionModelParamsFilePayload = {
    version: PREDICTION_MODEL_PARAMS_VERSION,
    appliedAtIso: new Date().toISOString(),
    params: normalized,
  };
  const absolutePath = absoluteConfigPath();
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  clearPredictionModelParamsCache();
  return {
    path: CALIBRATED_PARAMS_FILE_RELATIVE_PATH,
    absolutePath,
    payload,
  };
}
