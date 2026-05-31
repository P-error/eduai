import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
  SIX_FACTOR_ARTIFACT_PATH_ENV,
  getSixFactorArtifactModelFamily,
  loadSixFactorPolicyArtifact,
  type CatBoostCandidateScorerArtifactV1,
} from "@/lib/ml-six-factor-artifact-loader";
import {
  CATBOOST_SCORER_URL_ENV,
  requestCatBoostFeatureRowsWithHttp,
} from "@/lib/ml-six-factor-catboost-python-scorer";

const DEFAULT_RUNTIME_CATBOOST_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json";
const PARITY_TOLERANCE = 1e-9;
const REQUIRED_RUNTIME_FILES = [
  "model.cbm",
  "artifact.json",
  "feature_schema.json",
  "metrics.json",
  "prediction_parity_sample.jsonl",
] as const;

type ParitySampleRow = {
  readonly features: Record<string, number>;
  readonly python_prediction: Record<string, number>;
};

type CatBoostHttpParitySelfCheckResult = {
  readonly ok: true;
  readonly modelFamily: typeof CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;
  readonly artifactPath: string;
  readonly scorerUrlConfigured: true;
  readonly scorerUrlKind: "absolute" | "relative";
  readonly featureCount: number;
  readonly parityRows: number;
  readonly maxAbsDiff: number;
  readonly tolerance: number;
  readonly checks: readonly string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
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
    assert(actual != null, `missing HTTP prediction for row ${rowIndex}`);
    for (const [targetName, expectedValue] of Object.entries(
      expectedRow.python_prediction,
    )) {
      const actualValue = readNumber(
        actual[targetName],
        `HTTP prediction row ${rowIndex}.${targetName}`,
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
  return loadResult as {
    ok: true;
    artifact: CatBoostCandidateScorerArtifactV1;
    artifactPath: string;
    warnings: string[];
  };
}

function readFeatureCount(featureSchemaPath: string) {
  const parsed: unknown = JSON.parse(readFileSync(featureSchemaPath, "utf8"));
  assert(isRecord(parsed), "feature_schema must be a JSON object");
  const featureColumns = parsed.feature_columns;
  assert(
    Array.isArray(featureColumns) &&
      featureColumns.every((entry) => typeof entry === "string" && entry.length > 0),
    "feature_schema.feature_columns must be a string list",
  );
  return featureColumns.length;
}

function assertStaticHttpContract() {
  assert(existsSync(resolve(process.cwd(), "api/catboost-score.py")), "api/catboost-score.py is missing");
  const requirementsPath = resolve(process.cwd(), "requirements.txt");
  assert(existsSync(requirementsPath), "requirements.txt is missing");
  assert(
    readFileSync(requirementsPath, "utf8").split(/\r?\n/).includes("catboost==1.2.10"),
    "requirements.txt must pin catboost==1.2.10",
  );

  const vercelConfigPath = resolve(process.cwd(), "vercel.json");
  assert(existsSync(vercelConfigPath), "vercel.json is missing");
  const parsed: unknown = JSON.parse(readFileSync(vercelConfigPath, "utf8"));
  assert(isRecord(parsed) && isRecord(parsed.functions), "vercel.json functions config is missing");
  const pythonFunctionConfig = parsed.functions["api/**/*.py"];
  assert(isRecord(pythonFunctionConfig), "vercel.json must configure api/**/*.py");
  assert(Array.isArray(pythonFunctionConfig.includeFiles), "vercel.json includeFiles must be a list");
  assert(Array.isArray(pythonFunctionConfig.excludeFiles), "vercel.json excludeFiles must be a list");
  for (const fileName of REQUIRED_RUNTIME_FILES) {
    const artifactPath = `artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/${fileName}`;
    assert(
      pythonFunctionConfig.includeFiles.includes(artifactPath),
      `vercel.json includeFiles must keep ${fileName}`,
    );
    assert(
      !pythonFunctionConfig.excludeFiles.includes(artifactPath),
      `vercel.json excludeFiles must not exclude ${fileName}`,
    );
  }
}

function readConfiguredUrl(env: Record<string, string | undefined>) {
  const configuredUrl = env[CATBOOST_SCORER_URL_ENV]?.trim();
  assert(
    configuredUrl != null && configuredUrl.length > 0,
    "EDUAI_CATBOOST_SCORER_URL is required for HTTP parity; use a running dev server or deployment URL.",
  );
  return configuredUrl;
}

export async function runMlSixFactorCatBoostHttpParitySelfCheck(
  env: Record<string, string | undefined> = process.env,
): Promise<CatBoostHttpParitySelfCheckResult> {
  assertStaticHttpContract();
  const configuredUrl = readConfiguredUrl(env);
  const artifactPath =
    env[SIX_FACTOR_ARTIFACT_PATH_ENV]?.trim() ||
    DEFAULT_RUNTIME_CATBOOST_ARTIFACT_PATH;
  const artifactLoad = loadRuntimeCatBoostArtifact(artifactPath);
  const artifactDir = dirname(artifactLoad.artifactPath);
  const featureCount = readFeatureCount(
    resolve(artifactDir, artifactLoad.artifact.feature_schema_file),
  );
  const paritySamplePath = resolve(artifactDir, "prediction_parity_sample.jsonl");
  assert(existsSync(paritySamplePath), `missing parity sample: ${paritySamplePath}`);
  const parityRows = parseParitySample(paritySamplePath);
  assert(parityRows.length >= 50, `expected at least 50 parity rows, got ${parityRows.length}`);

  const response = await requestCatBoostFeatureRowsWithHttp(
    artifactLoad.artifact,
    artifactLoad.artifactPath,
    parityRows.map((row) => ({ features: row.features })),
    env,
  );
  assert(
    response.model_family === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    "HTTP scorer model_family mismatch",
  );
  assert(response.feature_count === featureCount, "HTTP scorer feature_count mismatch");
  const maxAbsDiff = maxPredictionDiff(
    parityRows,
    response.predictions as readonly Record<string, number>[],
  );
  assert(
    maxAbsDiff <= PARITY_TOLERANCE,
    `CatBoost HTTP runtime parity exceeded tolerance: ${maxAbsDiff} > ${PARITY_TOLERANCE}`,
  );

  return {
    ok: true,
    modelFamily: CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    artifactPath: artifactLoad.artifactPath,
    scorerUrlConfigured: true,
    scorerUrlKind: /^https?:\/\//i.test(configuredUrl) ? "absolute" : "relative",
    featureCount,
    parityRows: parityRows.length,
    maxAbsDiff,
    tolerance: PARITY_TOLERANCE,
    checks: [
      "static_http_contract_ok",
      "catboost_artifact_loads",
      "prediction_parity_sample_loads",
      "http_scorer_scores_rows",
      "model_family_catboost",
      "feature_count_matches_schema",
      "max_abs_diff_within_tolerance",
    ],
  };
}
