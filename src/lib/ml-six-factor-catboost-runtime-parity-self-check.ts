import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
  LINEAR_CANDIDATE_SCORER_MODEL_FAMILY,
  SIX_FACTOR_ARTIFACT_PATH_ENV,
  getSixFactorArtifactModelFamily,
  loadSixFactorPolicyArtifact,
  type CatBoostCandidateScorerArtifactV1,
} from "@/lib/ml-six-factor-artifact-loader";
import { scoreCatBoostFeatureRowsWithPython } from "@/lib/ml-six-factor-catboost-python-scorer";
import { getFinalThesisPolicy } from "@/lib/research-policy-registry";

const DEFAULT_RUNTIME_CATBOOST_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json";
const PARITY_TOLERANCE = 1e-9;

type ParitySampleRow = {
  readonly features: Record<string, number>;
  readonly python_prediction: Record<string, number>;
  readonly target?: Record<string, number>;
};

type CatBoostRuntimeParitySelfCheckResult = {
  readonly ok: true;
  readonly modelFamily: typeof CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;
  readonly artifactPath: string;
  readonly parityRows: number;
  readonly maxAbsDiff: number;
  readonly tolerance: number;
  readonly registryPolicyV2ArtifactPathExists: boolean;
  readonly checks: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readNumber(value: unknown, label: string) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be finite number`);
  return value;
}

function readFeatureMap(value: unknown, label: string) {
  assert(isRecord(value), `${label} must be an object`);
  const output: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = readNumber(entry, `${label}.${key}`);
  }
  return output;
}

function parseParitySample(path: string): ParitySampleRow[] {
  const rows: ParitySampleRow[] = [];
  const raw = readFileSync(path, "utf8");
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    assert(isRecord(parsed), `parity line ${index + 1} must be an object`);
    rows.push({
      features: readFeatureMap(parsed.features, `parity line ${index + 1}.features`),
      python_prediction: readFeatureMap(
        parsed.python_prediction,
        `parity line ${index + 1}.python_prediction`,
      ),
      target: isRecord(parsed.target)
        ? readFeatureMap(parsed.target, `parity line ${index + 1}.target`)
        : undefined,
    });
  }
  return rows;
}

function maxPredictionDiff(
  expectedRows: readonly ParitySampleRow[],
  actualRows: readonly Record<string, number>[],
) {
  let maxAbsDiff = 0;
  for (const [rowIndex, expectedRow] of expectedRows.entries()) {
    const actual = actualRows[rowIndex];
    assert(actual != null, `missing runtime prediction for row ${rowIndex}`);
    for (const [targetName, expectedValue] of Object.entries(
      expectedRow.python_prediction,
    )) {
      const actualValue = readNumber(
        actual[targetName],
        `runtime prediction row ${rowIndex}.${targetName}`,
      );
      maxAbsDiff = Math.max(maxAbsDiff, Math.abs(actualValue - expectedValue));
    }
  }
  return maxAbsDiff;
}

function loadRuntimeCatBoostArtifact(artifactPath: string) {
  const loadResult = loadSixFactorPolicyArtifact({
    [SIX_FACTOR_ARTIFACT_PATH_ENV]: artifactPath,
  });
  assert(loadResult.ok, `catboost artifact load failed: ${loadResult.ok ? "" : loadResult.error}`);
  assert(
    getSixFactorArtifactModelFamily(loadResult.artifact) ===
      CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    "runtime artifact must be catboost_candidate_scorer_v1",
  );
  assert(
    getSixFactorArtifactModelFamily(loadResult.artifact) !==
      LINEAR_CANDIDATE_SCORER_MODEL_FAMILY,
    "runtime artifact must not be linear_candidate_scorer_v1",
  );
  return loadResult as {
    ok: true;
    artifact: CatBoostCandidateScorerArtifactV1;
    artifactPath: string;
    warnings: string[];
  };
}

export function runMlSixFactorCatBoostRuntimeParitySelfCheck(
  env: Record<string, string | undefined> = process.env,
): CatBoostRuntimeParitySelfCheckResult {
  const artifactPath =
    env[SIX_FACTOR_ARTIFACT_PATH_ENV]?.trim() ||
    DEFAULT_RUNTIME_CATBOOST_ARTIFACT_PATH;
  const artifactLoad = loadRuntimeCatBoostArtifact(artifactPath);
  const paritySamplePath = resolve(
    dirname(artifactLoad.artifactPath),
    "prediction_parity_sample.jsonl",
  );
  assert(existsSync(paritySamplePath), `missing parity sample: ${paritySamplePath}`);
  const parityRows = parseParitySample(paritySamplePath);
  assert(parityRows.length >= 50, `expected at least 50 parity rows, got ${parityRows.length}`);

  const runtimePredictions = scoreCatBoostFeatureRowsWithPython(
    artifactLoad.artifact,
    artifactLoad.artifactPath,
    parityRows.map((row) => ({ features: row.features })),
    env,
  );
  const maxAbsDiff = maxPredictionDiff(
    parityRows,
    runtimePredictions as readonly Record<string, number>[],
  );
  assert(
    maxAbsDiff <= PARITY_TOLERANCE,
    `CatBoost runtime parity exceeded tolerance: ${maxAbsDiff} > ${PARITY_TOLERANCE}`,
  );

  const finalPolicy = getFinalThesisPolicy();
  const registryArtifactPathExists =
    finalPolicy.artifactPath != null && existsSync(resolve(process.cwd(), finalPolicy.artifactPath));
  assert(registryArtifactPathExists, "registry policy_v2 artifact path must exist");

  return {
    ok: true,
    modelFamily: CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    artifactPath: artifactLoad.artifactPath,
    parityRows: parityRows.length,
    maxAbsDiff,
    tolerance: PARITY_TOLERANCE,
    registryPolicyV2ArtifactPathExists: registryArtifactPathExists,
    checks: [
      "runtime_artifact_loads",
      "model_family_catboost",
      "not_linear_candidate_scorer",
      "prediction_parity_sample_loads",
      "python_bridge_scores_rows",
      "max_abs_diff_within_tolerance",
      "registry_policy_v2_artifact_path_exists",
    ],
  };
}
