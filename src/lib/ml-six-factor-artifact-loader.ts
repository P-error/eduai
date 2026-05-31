import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const SIX_FACTOR_ARTIFACT_PATH_ENV =
  "EDUAI_SIX_FACTOR_ARTIFACT_PATH" as const;

const DEFAULT_CANDIDATE_SCORER_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json" as const;
const LEGACY_EXAMPLE_CANDIDATE_SCORER_ARTIFACT_PATH =
  "ml/examples/candidate_scorer_artifact.example.json" as const;

export const LINEAR_CANDIDATE_SCORER_MODEL_FAMILY =
  "linear_candidate_scorer_v1" as const;
export const CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY =
  "catboost_candidate_scorer_v1" as const;
export const LINEAR_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION =
  "linear_candidate_scorer_payload.v1" as const;
export const CATBOOST_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION =
  "catboost_candidate_scorer_payload.v1" as const;

export type SixFactorRuntimeModelFamily =
  | typeof LINEAR_CANDIDATE_SCORER_MODEL_FAMILY
  | typeof CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;

export type LinearCandidateScorerPayloadV1 = {
  payload_schema_version: typeof LINEAR_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION;
  feature_names: string[];
  target_names: string[];
  weights: {
    expected_learning_gain_proxy: number[];
    expected_learning_gain_signed?: number[];
    expected_next_step_success_logit: number[];
    combined_outcome_score: number[];
  };
  parameters: Record<string, unknown>;
};

export type LinearSixFactorCandidateScorerArtifactV1 = {
  artifact_kind: "eduai_native_pedagogy_artifact";
  model_version: string;
  artifact_schema_version: string;
  factor_space_version: string;
  feature_schema: Record<string, unknown>;
  candidate_schema: Record<string, unknown>;
  model: {
    model_family: typeof LINEAR_CANDIDATE_SCORER_MODEL_FAMILY;
    parameters: Record<string, unknown>;
    weights_or_serialized_payload: LinearCandidateScorerPayloadV1;
  };
};

export type CatBoostCandidateScorerArtifactV1 = {
  model_family: typeof CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;
  artifact_schema_version: typeof CATBOOST_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION;
  thesis_policy_id: "policy_v2";
  source_dataset: string;
  model_file: string;
  model_file_sha256?: string;
  feature_schema_file: string;
  metrics_file: string;
  target_schema_version: string;
  trained_at: string;
  seed: number;
  split_strategy?: string;
  target_names: string[];
  primary_target: string;
  runtime_status?: string;
  runtime_compatible_with_current_typescript_loader?: boolean;
  leakage_guard: {
    uses_only_pre_decision_data: true;
    outcome_fields_in_features: false;
  };
};

export type SixFactorCandidateScorerArtifactV1 =
  | LinearSixFactorCandidateScorerArtifactV1
  | CatBoostCandidateScorerArtifactV1;

export type SixFactorArtifactLoadSuccess = {
  ok: true;
  artifact: SixFactorCandidateScorerArtifactV1;
  artifactPath: string;
  warnings: string[];
};

export type SixFactorArtifactLoadError = {
  ok: false;
  error: string;
  errorKind:
    | "artifact_path_missing"
    | "artifact_file_missing"
    | "artifact_read_error"
    | "artifact_parse_error"
    | "artifact_unsupported_model_family"
    | "artifact_invalid";
  artifactPath: string | null;
  warnings: string[];
};

export type SixFactorArtifactLoadResult =
  | SixFactorArtifactLoadSuccess
  | SixFactorArtifactLoadError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveArtifactPath(env: Record<string, string | undefined>) {
  const explicitPath = readString(env[SIX_FACTOR_ARTIFACT_PATH_ENV]);
  if (explicitPath != null) {
    return isAbsolute(explicitPath) ? explicitPath : resolve(process.cwd(), explicitPath);
  }

  const defaultPath = resolve(process.cwd(), DEFAULT_CANDIDATE_SCORER_ARTIFACT_PATH);
  if (existsSync(defaultPath)) return defaultPath;
  const legacyExamplePath = resolve(
    process.cwd(),
    LEGACY_EXAMPLE_CANDIDATE_SCORER_ARTIFACT_PATH,
  );
  return existsSync(legacyExamplePath) ? legacyExamplePath : null;
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const numbers = value.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : null,
  );
  return numbers.every((entry) => entry != null) ? (numbers as number[]) : null;
}

function validateArtifactShape(
  value: unknown,
): value is LinearSixFactorCandidateScorerArtifactV1 {
  if (!isRecord(value)) return false;
  if (value.artifact_kind !== "eduai_native_pedagogy_artifact") return false;
  if (readString(value.model_version) == null) return false;
  if (!isRecord(value.feature_schema)) return false;
  if (!isRecord(value.candidate_schema)) return false;

  const model = value.model;
  if (!isRecord(model)) return false;
  if (model.model_family !== LINEAR_CANDIDATE_SCORER_MODEL_FAMILY) return false;
  if (!isRecord(model.weights_or_serialized_payload)) return false;

  const payload = model.weights_or_serialized_payload;
  if (
    payload.payload_schema_version !==
    LINEAR_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION
  ) {
    return false;
  }
  if (!Array.isArray(payload.feature_names)) return false;
  if (!payload.feature_names.every((entry) => readString(entry) != null)) {
    return false;
  }
  if (!isRecord(payload.weights)) return false;

  const expectedWidth = payload.feature_names.length + 1;
  const gainWeights = readNumberArray(payload.weights.expected_learning_gain_proxy);
  const successWeights = readNumberArray(
    payload.weights.expected_next_step_success_logit,
  );
  const combinedWeights = readNumberArray(payload.weights.combined_outcome_score);
  const signedGainWeights =
    payload.weights.expected_learning_gain_signed === undefined
      ? undefined
      : readNumberArray(payload.weights.expected_learning_gain_signed);

  return (
    gainWeights?.length === expectedWidth &&
    successWeights?.length === expectedWidth &&
    combinedWeights?.length === expectedWidth &&
    (signedGainWeights === undefined || signedGainWeights?.length === expectedWidth)
  );
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const strings = value.map(readString);
  return strings.every((entry) => entry != null) ? (strings as string[]) : null;
}

function validateCatBoostArtifactShape(
  value: unknown,
  artifactPath: string,
): value is CatBoostCandidateScorerArtifactV1 {
  if (!isRecord(value)) return false;
  if (value.model_family !== CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) return false;
  if (
    value.artifact_schema_version !==
    CATBOOST_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION
  ) {
    return false;
  }
  if (value.thesis_policy_id !== "policy_v2") return false;
  const modelFile = readString(value.model_file);
  const featureSchemaFile = readString(value.feature_schema_file);
  const metricsFile = readString(value.metrics_file);
  if (modelFile == null || featureSchemaFile == null || metricsFile == null) {
    return false;
  }
  if (readString(value.source_dataset) == null) return false;
  if (readString(value.target_schema_version) == null) return false;
  if (readString(value.trained_at) == null) return false;
  if (typeof value.seed !== "number" || !Number.isInteger(value.seed)) return false;
  const targetNames = readStringArray(value.target_names);
  if (targetNames == null || targetNames.length === 0) return false;
  if (readString(value.primary_target) == null) return false;
  const leakageGuard = value.leakage_guard;
  if (!isRecord(leakageGuard)) return false;
  if (leakageGuard.uses_only_pre_decision_data !== true) return false;
  if (leakageGuard.outcome_fields_in_features !== false) return false;

  const artifactDir = dirname(artifactPath);
  return (
    existsSync(resolve(artifactDir, modelFile)) &&
    existsSync(resolve(artifactDir, featureSchemaFile)) &&
    existsSync(resolve(artifactDir, metricsFile))
  );
}

function readParsedModelFamily(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.model_family === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) {
    return CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY;
  }
  const model = value.model;
  if (!isRecord(model)) return null;
  return readString(model.model_family);
}

export function getSixFactorArtifactModelFamily(
  artifact: SixFactorCandidateScorerArtifactV1,
): SixFactorRuntimeModelFamily {
  return "model" in artifact
    ? artifact.model.model_family
    : artifact.model_family;
}

export function getSixFactorArtifactModelVersion(
  artifact: SixFactorCandidateScorerArtifactV1,
): string {
  return "model_version" in artifact
    ? artifact.model_version
    : `${artifact.model_family}_seed_${artifact.seed}`;
}

export function getSixFactorArtifactPayloadSchemaVersion(
  artifact: SixFactorCandidateScorerArtifactV1,
): string {
  return "model" in artifact
    ? artifact.model.weights_or_serialized_payload.payload_schema_version
    : artifact.artifact_schema_version;
}

export function loadSixFactorPolicyArtifact(
  env: Record<string, string | undefined> = process.env,
): SixFactorArtifactLoadResult {
  const artifactPath = resolveArtifactPath(env);
  if (artifactPath == null) {
    return {
      ok: false,
      error: "No six-factor artifact path configured and safe default artifact is missing.",
      errorKind: "artifact_path_missing",
      artifactPath: null,
      warnings: [],
    };
  }

  if (!existsSync(artifactPath)) {
    return {
      ok: false,
      error: `Six-factor artifact file does not exist: ${artifactPath}`,
      errorKind: "artifact_file_missing",
      artifactPath,
      warnings: [],
    };
  }

  let raw: string;
  try {
    raw = readFileSync(artifactPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read artifact file.",
      errorKind: "artifact_read_error",
      artifactPath,
      warnings: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse artifact JSON.",
      errorKind: "artifact_parse_error",
      artifactPath,
      warnings: [],
    };
  }

  const parsedModelFamily = readParsedModelFamily(parsed);
  if (
    parsedModelFamily != null &&
    parsedModelFamily !== LINEAR_CANDIDATE_SCORER_MODEL_FAMILY &&
    parsedModelFamily !== CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY
  ) {
    return {
      ok: false,
      error: `Six-factor runtime supports only linear_candidate_scorer_v1 and catboost_candidate_scorer_v1 artifacts; got ${parsedModelFamily}.`,
      errorKind: "artifact_unsupported_model_family",
      artifactPath,
      warnings: [
        "tree_candidate_scorer_v1 artifacts remain offline-only for this TypeScript runtime.",
      ],
    };
  }

  let artifact: SixFactorCandidateScorerArtifactV1 | null = null;
  if (validateArtifactShape(parsed)) {
    artifact = parsed;
  } else if (validateCatBoostArtifactShape(parsed, artifactPath)) {
    artifact = parsed;
  }

  if (artifact == null) {
    return {
      ok: false,
      error: "Six-factor artifact does not match the required runtime scorer shape.",
      errorKind: "artifact_invalid",
      artifactPath,
      warnings: [],
    };
  }

  return {
    ok: true,
    artifact,
    artifactPath,
    warnings: [
      `runtime_compatible_artifact:model_family=${getSixFactorArtifactModelFamily(artifact)}`,
      "Runtime scorer can read the JSON artifact, but current artifacts may be synthetic-trained and are not evidence of real educational effect.",
    ],
  };
}
