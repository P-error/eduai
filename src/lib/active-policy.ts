import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ACCURACY_ML_FEATURE_SCHEMA_VERSION,
  DEFAULT_PREDICTION_RUNTIME_CONFIG,
  PREDICTION_FEATURE_PAYLOAD_VERSION,
  PREDICTION_RUNTIME_CONFIG_VERSION,
  PREDICTION_RUNTIME_POLICY_ID,
  type PredictionHeuristicPolicyId,
  type PredictionRuntimeConfig,
  type PredictionRuntimeBackendConfig,
} from "@/lib/prediction-contract";

export const PREDICTION_POLICY_V1 = "v1_accuracy_raw_duration_baseline" as const;
export const PREDICTION_POLICY_V2 = "v2_accuracy_beta_duration_unified" as const;
export const PREDICTION_POLICY_V3 =
  "v3_accuracy_logistic_regression_duration_unified" as const;

export const ALL_PREDICTION_POLICY_IDS = [
  PREDICTION_POLICY_V1,
  PREDICTION_POLICY_V2,
  PREDICTION_POLICY_V3,
] as const;

export type ActivePredictionPolicyId = (typeof ALL_PREDICTION_POLICY_IDS)[number];

export type ActivePredictionRuntimeSnapshot = {
  source: "config" | "default";
  path: string;
  warning: string | null;
  config: PredictionRuntimeConfig;
  raw: unknown | null;
  featurePayloadVersion: typeof PREDICTION_FEATURE_PAYLOAD_VERSION;
  accuracyFeatureSchemaVersion: typeof ACCURACY_ML_FEATURE_SCHEMA_VERSION;
};

const ACTIVE_POLICY_CONFIG_PATH = path.join(
  process.cwd(),
  "configs",
  "active_policy.json",
);

function isKnownPolicyId(value: unknown): value is ActivePredictionPolicyId {
  return ALL_PREDICTION_POLICY_IDS.some((policyId) => policyId === value);
}

function isHeuristicPolicyId(value: unknown): value is PredictionHeuristicPolicyId {
  return value === PREDICTION_POLICY_V1 || value === PREDICTION_POLICY_V2;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function createRuntimeConfig(
  backend: PredictionRuntimeBackendConfig,
): PredictionRuntimeConfig {
  return {
    version: PREDICTION_RUNTIME_CONFIG_VERSION,
    policyId: PREDICTION_RUNTIME_POLICY_ID,
    backend,
  };
}

function normalizeRuntimeConfig(
  payload: unknown,
): Pick<ActivePredictionRuntimeSnapshot, "source" | "warning" | "config" | "raw"> {
  const root = asRecord(payload);
  if (!root) {
    return {
      source: "default",
      warning: "active_prediction_config_invalid_root",
      config: DEFAULT_PREDICTION_RUNTIME_CONFIG,
      raw: payload ?? null,
    };
  }

  const backend = asRecord(root.backend);
  const backendKind = backend?.kind;
  const version =
    typeof root.version === "string" ? root.version : PREDICTION_RUNTIME_CONFIG_VERSION;

  if (
    version === PREDICTION_RUNTIME_CONFIG_VERSION &&
    backendKind === "heuristic_baseline" &&
    isHeuristicPolicyId(backend?.heuristicPolicyId)
  ) {
    return {
      source: "config",
      warning: null,
      config: createRuntimeConfig({
        kind: "heuristic_baseline",
        heuristicPolicyId: backend.heuristicPolicyId,
      }),
      raw: payload,
    };
  }

  if (
    version === PREDICTION_RUNTIME_CONFIG_VERSION &&
    backendKind === "stub_model"
  ) {
    return {
      source: "config",
      warning: null,
      config: createRuntimeConfig({
        kind: "stub_model",
      }),
      raw: payload,
    };
  }

  if (
    version === PREDICTION_RUNTIME_CONFIG_VERSION &&
    backendKind === "artifact_ml"
  ) {
    return {
      source: "config",
      warning: null,
      config: createRuntimeConfig({
        kind: "artifact_ml",
        artifactPath:
          typeof backend?.artifactPath === "string" ? backend.artifactPath : null,
      }),
      raw: payload,
    };
  }

  if (isKnownPolicyId(root.policyId)) {
    if (root.policyId === PREDICTION_POLICY_V3) {
      return {
        source: "config",
        warning: "legacy_prediction_policy_v3_mapped_to_artifact_backend",
        config: createRuntimeConfig({
          kind: "artifact_ml",
          artifactPath: null,
        }),
        raw: payload,
      };
    }

    return {
      source: "config",
      warning: `legacy_prediction_policy_${root.policyId}_mapped_to_heuristic_backend`,
      config: createRuntimeConfig({
        kind: "heuristic_baseline",
        heuristicPolicyId: root.policyId,
      }),
      raw: payload,
    };
  }

  return {
    source: "default",
    warning: "active_prediction_config_invalid_default_used",
    config: DEFAULT_PREDICTION_RUNTIME_CONFIG,
    raw: payload,
  };
}

export async function getActivePredictionRuntimeConfig(): Promise<ActivePredictionRuntimeSnapshot> {
  try {
    const raw = await readFile(ACTIVE_POLICY_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeRuntimeConfig(parsed);
    return {
      ...normalized,
      path: ACTIVE_POLICY_CONFIG_PATH,
      featurePayloadVersion: PREDICTION_FEATURE_PAYLOAD_VERSION,
      accuracyFeatureSchemaVersion: ACCURACY_ML_FEATURE_SCHEMA_VERSION,
    };
  } catch (error) {
    const warning =
      error instanceof Error && "code" in error && error.code === "ENOENT"
        ? null
        : error instanceof Error
          ? `active_prediction_config_read_failed:${error.message}`
          : "active_prediction_config_read_failed";

    return {
      source: "default",
      path: ACTIVE_POLICY_CONFIG_PATH,
      warning,
      config: DEFAULT_PREDICTION_RUNTIME_CONFIG,
      raw: null,
      featurePayloadVersion: PREDICTION_FEATURE_PAYLOAD_VERSION,
      accuracyFeatureSchemaVersion: ACCURACY_ML_FEATURE_SCHEMA_VERSION,
    };
  }
}

export async function getActivePredictionPolicyId() {
  return (await getActivePredictionRuntimeConfig()).config.policyId;
}
