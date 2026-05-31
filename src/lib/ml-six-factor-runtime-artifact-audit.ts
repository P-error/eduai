import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
  CATBOOST_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION,
  LINEAR_CANDIDATE_SCORER_MODEL_FAMILY,
  LINEAR_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION,
} from "@/lib/ml-six-factor-artifact-loader";
import { getFinalThesisPolicy } from "@/lib/research-policy-registry";

const ARTIFACT_PATH_ENV = "EDUAI_SIX_FACTOR_ARTIFACT_PATH" as const;
const DEFAULT_LINEAR_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json" as const;
const SUPPORTED_RUNTIME_MODEL_FAMILIES = [
  LINEAR_CANDIDATE_SCORER_MODEL_FAMILY,
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
] as const;
const CATBOOST_PYTHON_SCORER_SCRIPT =
  "ml/scripts/score_catboost_candidate_scorer.py" as const;
const CATBOOST_TYPESCRIPT_BRIDGE =
  "src/lib/ml-six-factor-catboost-python-scorer.ts" as const;
const CATBOOST_PARITY_SCRIPT =
  "scripts/catboost-runtime-parity-self-check.sh" as const;
const CATBOOST_PARITY_MODULE =
  "src/lib/ml-six-factor-catboost-runtime-parity-self-check.ts" as const;

type SupportedRuntimeModelFamily = (typeof SUPPORTED_RUNTIME_MODEL_FAMILIES)[number];
type AuditStatus = "OK" | "WARNING" | "BLOCKED";

type DiscoveredArtifact = {
  readonly path: string;
  readonly kind: "json_model_artifact" | "joblib_model" | "catboost_model";
  readonly modelFamily: string | null;
  readonly modelVersion: string | null;
  readonly payloadSchemaVersion: string | null;
  readonly runtimeSupported: boolean;
  readonly executableByTypeScriptRuntime: boolean;
};

type RuntimeArtifactAuditResult = {
  readonly ok: true;
  readonly status: AuditStatus;
  readonly supportedRuntimeModelFamilies: readonly SupportedRuntimeModelFamily[];
  readonly configuredArtifactPath: string;
  readonly configuredArtifactPathSource: "env" | "default_linear";
  readonly defaultLinearArtifact: {
    readonly path: string;
    readonly exists: boolean;
    readonly modelFamily: string | null;
    readonly payloadSchemaVersion: string | null;
  };
  readonly policyV2: {
    readonly id: string;
    readonly modelFamily: string;
    readonly runtimeStatus: string;
    readonly artifactPath: string | null;
    readonly artifactPathExists: boolean;
    readonly modelFamilyRuntimeSupported: boolean;
    readonly remainsRuntimePending: boolean;
    readonly directRuntimeReady: boolean;
    readonly fakeCatBoostRisk: boolean;
  };
  readonly catBoostRuntimeBridge: {
    readonly pythonScorerScriptExists: boolean;
    readonly typeScriptBridgeExists: boolean;
    readonly paritySelfCheckScriptExists: boolean;
    readonly paritySelfCheckModuleExists: boolean;
  };
  readonly discoveredArtifacts: readonly DiscoveredArtifact[];
  readonly catBoostArtifacts: readonly DiscoveredArtifact[];
  readonly treeCandidateArtifacts: readonly DiscoveredArtifact[];
  readonly sklearnOrHistGradientArtifacts: readonly DiscoveredArtifact[];
  readonly directCatBoostRuntimeReady: boolean;
  readonly fakeCatBoostRisk: boolean;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
};

type ArtifactMetadata = {
  readonly modelFamily: string | null;
  readonly modelVersion: string | null;
  readonly payloadSchemaVersion: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}

function toAbsolutePath(path: string) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function toRepoPath(path: string) {
  return normalizePath(path.startsWith(process.cwd())
    ? path.slice(process.cwd().length + 1)
    : path);
}

function readArtifactMetadata(path: string): ArtifactMetadata {
  if (!existsSync(path) || !path.endsWith(".json")) {
    return {
      modelFamily: null,
      modelVersion: null,
      payloadSchemaVersion: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {
      modelFamily: null,
      modelVersion: null,
      payloadSchemaVersion: null,
    };
  }

  if (!isRecord(parsed)) {
    return {
      modelFamily: null,
      modelVersion: null,
      payloadSchemaVersion: null,
    };
  }

  const model = isRecord(parsed.model) ? parsed.model : null;
  const payload =
    model != null && isRecord(model.weights_or_serialized_payload)
      ? model.weights_or_serialized_payload
      : null;
  const topLevelModelFamily = readString(parsed.model_family);
  const topLevelSchemaVersion = readString(parsed.artifact_schema_version);
  const seed = typeof parsed.seed === "number" ? parsed.seed : null;

  return {
    modelFamily: topLevelModelFamily ?? readString(model?.model_family),
    modelVersion:
      readString(parsed.model_version) ??
      (topLevelModelFamily != null && seed != null
        ? `${topLevelModelFamily}_seed_${seed}`
        : null),
    payloadSchemaVersion:
      readString(payload?.payload_schema_version) ?? topLevelSchemaVersion,
  };
}

function isRuntimeSupportedModelFamily(
  modelFamily: string | null,
): modelFamily is SupportedRuntimeModelFamily {
  return SUPPORTED_RUNTIME_MODEL_FAMILIES.includes(
    modelFamily as SupportedRuntimeModelFamily,
  );
}

function catBoostRuntimeBridgeAvailable() {
  return (
    existsSync(toAbsolutePath(CATBOOST_PYTHON_SCORER_SCRIPT)) &&
    existsSync(toAbsolutePath(CATBOOST_TYPESCRIPT_BRIDGE)) &&
    existsSync(toAbsolutePath(CATBOOST_PARITY_SCRIPT)) &&
    existsSync(toAbsolutePath(CATBOOST_PARITY_MODULE))
  );
}

function isTypeScriptExecutableArtifact(metadata: ArtifactMetadata, path: string) {
  if (!path.endsWith("/artifact.json")) return false;
  return (
    (metadata.modelFamily === LINEAR_CANDIDATE_SCORER_MODEL_FAMILY &&
      metadata.payloadSchemaVersion ===
        LINEAR_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION) ||
    (metadata.modelFamily === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY &&
      metadata.payloadSchemaVersion ===
        CATBOOST_CANDIDATE_SCORER_PAYLOAD_SCHEMA_VERSION &&
      catBoostRuntimeBridgeAvailable())
  );
}

function catBoostArtifactPackageComplete(artifactPath: string | null) {
  if (artifactPath == null) return false;
  const absoluteArtifactPath = toAbsolutePath(artifactPath);
  if (!existsSync(absoluteArtifactPath)) return false;
  const artifactDir = dirname(absoluteArtifactPath);
  return (
    existsSync(resolve(artifactDir, "model.cbm")) &&
    existsSync(resolve(artifactDir, "metrics.json")) &&
    existsSync(resolve(artifactDir, "feature_schema.json")) &&
    existsSync(resolve(artifactDir, "prediction_parity_sample.jsonl"))
  );
}

function hasFakeCatBoostRisk(artifactPath: string | null, modelFamily: string) {
  if (modelFamily !== CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) return false;
  return !catBoostArtifactPackageComplete(artifactPath);
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__" || entry.name === ".venv") continue;
      output.push(...walkFiles(path));
      continue;
    }

    if (entry.isFile()) output.push(path);
  }

  return output;
}

function artifactKindForPath(path: string): DiscoveredArtifact["kind"] | null {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".cbm")) return "catboost_model";
  if (lowerPath.endsWith(".joblib")) return "joblib_model";
  if (lowerPath.endsWith(".json")) return "json_model_artifact";
  return null;
}

function shouldInspectPath(path: string) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".joblib") || lowerPath.endsWith(".cbm")) return true;
  if (!lowerPath.endsWith(".json")) return false;
  return (
    lowerPath.endsWith("/artifact.json") ||
    lowerPath.includes("candidate_scorer") ||
    lowerPath.includes("offline_model") ||
    lowerPath.includes("runtime_linear")
  );
}

function discoverArtifacts() {
  const roots = [
    "artifacts/runtime/eduai_native_pedagogy",
    "ml/examples",
    "ml/src/eduai_ml/training/THU/artifacts",
    "ml/src/eduai_ml/training/SUN/artifacts/models",
    "ml/src/eduai_ml/training/SUN/artifacts/extended_models",
  ];
  const seen = new Set<string>();
  const artifacts: DiscoveredArtifact[] = [];

  for (const root of roots.map(toAbsolutePath)) {
    for (const path of walkFiles(root)) {
      const repoPath = toRepoPath(path);
      if (seen.has(repoPath) || !shouldInspectPath(repoPath)) continue;
      const kind = artifactKindForPath(repoPath);
      if (kind == null) continue;
      seen.add(repoPath);

      const metadata = readArtifactMetadata(path);
      if (
        kind === "json_model_artifact" &&
        metadata.modelFamily == null &&
        !repoPath.endsWith("/artifact.json")
      ) {
        continue;
      }

      artifacts.push({
        path: repoPath,
        kind,
        modelFamily: metadata.modelFamily,
        modelVersion: metadata.modelVersion,
        payloadSchemaVersion: metadata.payloadSchemaVersion,
        runtimeSupported:
          kind === "json_model_artifact" &&
          repoPath.endsWith("/artifact.json") &&
          isRuntimeSupportedModelFamily(metadata.modelFamily),
        executableByTypeScriptRuntime: isTypeScriptExecutableArtifact(
          metadata,
          repoPath,
        ),
      });
    }
  }

  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

function resolveConfiguredArtifactPath(env: Record<string, string | undefined>) {
  const explicit = env[ARTIFACT_PATH_ENV]?.trim();
  if (explicit) {
    return {
      source: "env" as const,
      path: toRepoPath(toAbsolutePath(explicit)),
    };
  }

  return {
    source: "default_linear" as const,
    path: DEFAULT_LINEAR_ARTIFACT_PATH,
  };
}

function statusFromFindings(params: {
  defaultLinearArtifactExists: boolean;
  policyV2RemainsPending: boolean;
  policyV2DirectRuntimeReady: boolean;
}) {
  if (!params.defaultLinearArtifactExists) return "BLOCKED" as const;
  if (!params.policyV2RemainsPending && !params.policyV2DirectRuntimeReady) {
    return "BLOCKED" as const;
  }
  if (!params.policyV2DirectRuntimeReady) return "WARNING" as const;
  return "OK" as const;
}

export function runMlSixFactorRuntimeArtifactAudit(
  env: Record<string, string | undefined> = process.env,
): RuntimeArtifactAuditResult {
  const configuredArtifactPath = resolveConfiguredArtifactPath(env);
  const defaultLinearAbsolutePath = toAbsolutePath(DEFAULT_LINEAR_ARTIFACT_PATH);
  const defaultLinearMetadata = readArtifactMetadata(defaultLinearAbsolutePath);
  const defaultLinearArtifactExists = existsSync(defaultLinearAbsolutePath);
  const finalPolicy = getFinalThesisPolicy();
  const policyV2ArtifactPath = finalPolicy.artifactPath;
  const policyV2ArtifactPathExists =
    policyV2ArtifactPath != null && existsSync(toAbsolutePath(policyV2ArtifactPath));
  const policyV2ModelFamilyRuntimeSupported = isRuntimeSupportedModelFamily(
    finalPolicy.modelFamily,
  );
  const policyV2RemainsRuntimePending =
    finalPolicy.runtimeStatus === "runtime_pending";
  const policyV2PackageComplete = catBoostArtifactPackageComplete(policyV2ArtifactPath);
  const fakeCatBoostRisk = hasFakeCatBoostRisk(
    policyV2ArtifactPath,
    finalPolicy.modelFamily,
  );
  const policyV2DirectRuntimeReady =
    policyV2ArtifactPathExists &&
    policyV2ModelFamilyRuntimeSupported &&
    !policyV2RemainsRuntimePending &&
    catBoostRuntimeBridgeAvailable() &&
    policyV2PackageComplete &&
    !fakeCatBoostRisk;

  const discoveredArtifacts = discoverArtifacts();
  const catBoostArtifacts = discoveredArtifacts.filter(
    (artifact) =>
      artifact.kind === "catboost_model" ||
      artifact.modelFamily === "catboost_candidate_scorer_v1",
  );
  const treeCandidateArtifacts = discoveredArtifacts.filter(
    (artifact) => artifact.modelFamily === "tree_candidate_scorer_v1",
  );
  const sklearnOrHistGradientArtifacts = discoveredArtifacts.filter(
    (artifact) =>
      artifact.modelFamily === "sklearn_candidate_scorer_v1" ||
      artifact.path.toLowerCase().includes("hist_gradient") ||
      artifact.path.toLowerCase().includes("winner_model.joblib"),
  );

  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!policyV2ArtifactPathExists) {
    warnings.push("policy_v2_artifact_path_missing");
  }
  if (!policyV2ModelFamilyRuntimeSupported) {
    warnings.push("policy_v2_model_family_not_runtime_supported");
  }
  if (policyV2RemainsRuntimePending) {
    warnings.push("policy_v2_runtime_status_is_pending");
  }
  if (finalPolicy.modelFamily === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) {
    if (!policyV2PackageComplete) warnings.push("policy_v2_catboost_package_incomplete");
    if (!catBoostRuntimeBridgeAvailable()) warnings.push("catboost_runtime_bridge_missing");
    if (fakeCatBoostRisk) warnings.push("fake_catboost_artifact_risk");
  }
  if (!defaultLinearArtifactExists) {
    blockers.push("default_linear_artifact_missing");
  }
  if (!policyV2RemainsRuntimePending && !policyV2DirectRuntimeReady) {
    blockers.push("policy_v2_marked_active_without_runtime_ready_artifact");
  }

  return {
    ok: true,
    status: statusFromFindings({
      defaultLinearArtifactExists,
      policyV2RemainsPending: policyV2RemainsRuntimePending,
      policyV2DirectRuntimeReady,
    }),
    supportedRuntimeModelFamilies: SUPPORTED_RUNTIME_MODEL_FAMILIES,
    configuredArtifactPath: configuredArtifactPath.path,
    configuredArtifactPathSource: configuredArtifactPath.source,
    defaultLinearArtifact: {
      path: DEFAULT_LINEAR_ARTIFACT_PATH,
      exists: defaultLinearArtifactExists,
      modelFamily: defaultLinearMetadata.modelFamily,
      payloadSchemaVersion: defaultLinearMetadata.payloadSchemaVersion,
    },
    policyV2: {
      id: finalPolicy.id,
      modelFamily: finalPolicy.modelFamily,
      runtimeStatus: finalPolicy.runtimeStatus,
      artifactPath: policyV2ArtifactPath,
      artifactPathExists: policyV2ArtifactPathExists,
      modelFamilyRuntimeSupported: policyV2ModelFamilyRuntimeSupported,
      remainsRuntimePending: policyV2RemainsRuntimePending,
      directRuntimeReady: policyV2DirectRuntimeReady,
      fakeCatBoostRisk,
    },
    catBoostRuntimeBridge: {
      pythonScorerScriptExists: existsSync(toAbsolutePath(CATBOOST_PYTHON_SCORER_SCRIPT)),
      typeScriptBridgeExists: existsSync(toAbsolutePath(CATBOOST_TYPESCRIPT_BRIDGE)),
      paritySelfCheckScriptExists: existsSync(toAbsolutePath(CATBOOST_PARITY_SCRIPT)),
      paritySelfCheckModuleExists: existsSync(toAbsolutePath(CATBOOST_PARITY_MODULE)),
    },
    discoveredArtifacts,
    catBoostArtifacts,
    treeCandidateArtifacts,
    sklearnOrHistGradientArtifacts,
    directCatBoostRuntimeReady:
      catBoostArtifacts.some((artifact) => artifact.executableByTypeScriptRuntime) &&
      policyV2DirectRuntimeReady,
    fakeCatBoostRisk,
    warnings,
    blockers,
  };
}
