import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const SIX_FACTOR_ARTIFACT_PATH_ENV =
  "EDUAI_SIX_FACTOR_ARTIFACT_PATH" as const;

const DEFAULT_CANDIDATE_SCORER_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json" as const;
const LEGACY_EXAMPLE_CANDIDATE_SCORER_ARTIFACT_PATH =
  "ml/examples/candidate_scorer_artifact.example.json" as const;

export type LinearCandidateScorerPayloadV1 = {
  payload_schema_version: "linear_candidate_scorer_payload.v1";
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

export type SixFactorCandidateScorerArtifactV1 = {
  artifact_kind: "eduai_native_pedagogy_artifact";
  model_version: string;
  artifact_schema_version: string;
  factor_space_version: string;
  feature_schema: Record<string, unknown>;
  candidate_schema: Record<string, unknown>;
  model: {
    model_family: string;
    parameters: Record<string, unknown>;
    weights_or_serialized_payload: LinearCandidateScorerPayloadV1;
  };
};

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
): value is SixFactorCandidateScorerArtifactV1 {
  if (!isRecord(value)) return false;
  if (value.artifact_kind !== "eduai_native_pedagogy_artifact") return false;
  if (readString(value.model_version) == null) return false;
  if (!isRecord(value.feature_schema)) return false;
  if (!isRecord(value.candidate_schema)) return false;

  const model = value.model;
  if (!isRecord(model)) return false;
  if (model.model_family !== "linear_candidate_scorer_v1") return false;
  if (!isRecord(model.weights_or_serialized_payload)) return false;

  const payload = model.weights_or_serialized_payload;
  if (payload.payload_schema_version !== "linear_candidate_scorer_payload.v1") {
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

  if (
    isRecord(parsed) &&
    isRecord(parsed.model) &&
    parsed.model.model_family !== "linear_candidate_scorer_v1"
  ) {
    return {
      ok: false,
      error: `Six-factor runtime supports only linear_candidate_scorer_v1 artifacts; got ${String(parsed.model.model_family)}.`,
      errorKind: "artifact_unsupported_model_family",
      artifactPath,
      warnings: [
        "tree_candidate_scorer_v1 artifacts are currently offline-only for this TypeScript runtime.",
      ],
    };
  }

  if (!validateArtifactShape(parsed)) {
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
    artifact: parsed,
    artifactPath,
    warnings: [
      `runtime_compatible_artifact:model_family=${parsed.model.model_family}`,
      "Runtime scorer can read the JSON artifact, but current artifacts may be synthetic-trained and are not evidence of real educational effect.",
    ],
  };
}
