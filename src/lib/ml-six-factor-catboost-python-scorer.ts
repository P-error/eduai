import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
  type CatBoostCandidateScorerArtifactV1,
} from "@/lib/ml-six-factor-artifact-loader";

export const CATBOOST_PYTHON_BIN_ENV = "EDUAI_CATBOOST_PYTHON_BIN" as const;
export const CATBOOST_SCORER_SCRIPT_ENV =
  "EDUAI_CATBOOST_SCORER_SCRIPT" as const;
export const CATBOOST_SCORER_TIMEOUT_MS_ENV =
  "EDUAI_CATBOOST_SCORER_TIMEOUT_MS" as const;

const DEFAULT_SCORER_SCRIPT = "ml/scripts/score_catboost_candidate_scorer.py";
const DEFAULT_TIMEOUT_MS = 10_000;

export type CatBoostRuntimePrediction = {
  expected_learning_gain_signed?: number;
  expected_learning_gain_proxy?: number;
  expected_next_step_success?: number;
  combined_outcome_score?: number;
};

export type CatBoostFeatureRow = {
  readonly features: Record<string, number>;
};

type CatBoostScorerResponse = {
  readonly ok: true;
  readonly model_family: typeof CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;
  readonly feature_count: number;
  readonly prediction_count: number;
  readonly predictions: readonly CatBoostRuntimePrediction[];
};

export class CatBoostPythonScorerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "catboost_python_spawn_failed"
      | "catboost_python_timeout"
      | "catboost_python_exit_error"
      | "catboost_python_invalid_response",
  ) {
    super(message);
    this.name = "CatBoostPythonScorerError";
  }
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value == null || value.trim().length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePath(value: string) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function defaultPythonBin() {
  const localPython = resolve(process.cwd(), "ml/.venv/bin/python");
  return existsSync(localPython) ? localPython : "python3";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isPrediction(value: unknown): value is CatBoostRuntimePrediction {
  if (!isRecord(value)) return false;
  const allowedKeys = [
    "expected_learning_gain_signed",
    "expected_learning_gain_proxy",
    "expected_next_step_success",
    "combined_outcome_score",
  ];
  return allowedKeys.every((key) => {
    const entry = value[key];
    return entry === undefined || (typeof entry === "number" && Number.isFinite(entry));
  });
}

function parseScorerResponse(stdout: string): CatBoostScorerResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new CatBoostPythonScorerError(
      `CatBoost scorer returned invalid JSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
      "catboost_python_invalid_response",
    );
  }

  if (!isRecord(parsed)) {
    throw new CatBoostPythonScorerError(
      "CatBoost scorer response must be a JSON object.",
      "catboost_python_invalid_response",
    );
  }
  if (parsed.ok !== true) {
    throw new CatBoostPythonScorerError(
      "CatBoost scorer response did not report ok=true.",
      "catboost_python_invalid_response",
    );
  }
  if (parsed.model_family !== CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) {
    throw new CatBoostPythonScorerError(
      "CatBoost scorer response model_family mismatch.",
      "catboost_python_invalid_response",
    );
  }
  if (!Array.isArray(parsed.predictions) || !parsed.predictions.every(isPrediction)) {
    throw new CatBoostPythonScorerError(
      "CatBoost scorer response predictions are invalid.",
      "catboost_python_invalid_response",
    );
  }
  if (
    typeof parsed.feature_count !== "number" ||
    !Number.isInteger(parsed.feature_count) ||
    typeof parsed.prediction_count !== "number" ||
    !Number.isInteger(parsed.prediction_count)
  ) {
    throw new CatBoostPythonScorerError(
      "CatBoost scorer response count fields are invalid.",
      "catboost_python_invalid_response",
    );
  }

  return {
    ok: true,
    model_family: parsed.model_family,
    feature_count: parsed.feature_count,
    prediction_count: parsed.prediction_count,
    predictions: parsed.predictions,
  };
}

function sanitizeStderr(stderr: string) {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ");
}

export function scoreCatBoostFeatureRowsWithPython(
  artifact: CatBoostCandidateScorerArtifactV1,
  artifactPath: string,
  rows: readonly CatBoostFeatureRow[],
  env: Record<string, string | undefined> = process.env,
): readonly CatBoostRuntimePrediction[] {
  if (artifact.model_family !== CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) {
    throw new CatBoostPythonScorerError(
      "Artifact is not catboost_candidate_scorer_v1.",
      "catboost_python_invalid_response",
    );
  }

  const pythonBin = readString(env[CATBOOST_PYTHON_BIN_ENV]) ?? defaultPythonBin();
  const scorerScript = resolvePath(
    readString(env[CATBOOST_SCORER_SCRIPT_ENV]) ?? DEFAULT_SCORER_SCRIPT,
  );
  const timeoutMs = readPositiveInteger(
    env[CATBOOST_SCORER_TIMEOUT_MS_ENV],
    DEFAULT_TIMEOUT_MS,
  );
  const input = JSON.stringify({ rows });

  const result = spawnSync(
    pythonBin,
    [scorerScript, "--artifact", artifactPath, "--input", "-"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input,
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      timeout: timeoutMs,
    },
  );

  if (result.error != null) {
    const timedOut =
      "code" in result.error && result.error.code === "ETIMEDOUT";
    throw new CatBoostPythonScorerError(
      timedOut
        ? `CatBoost Python scorer timed out after ${timeoutMs}ms.`
        : `CatBoost Python scorer failed to start: ${result.error.message}`,
      timedOut ? "catboost_python_timeout" : "catboost_python_spawn_failed",
    );
  }

  if (result.status !== 0) {
    const stderr = sanitizeStderr(result.stderr ?? "");
    throw new CatBoostPythonScorerError(
      `CatBoost Python scorer exited with status ${String(result.status)}${
        stderr ? `: ${stderr}` : ""
      }`,
      "catboost_python_exit_error",
    );
  }

  const response = parseScorerResponse(result.stdout.trim());
  if (response.prediction_count !== rows.length) {
    throw new CatBoostPythonScorerError(
      `CatBoost scorer returned ${response.prediction_count} predictions for ${rows.length} rows.`,
      "catboost_python_invalid_response",
    );
  }

  return response.predictions;
}
