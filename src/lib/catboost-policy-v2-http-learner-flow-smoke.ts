import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
  SIX_FACTOR_ARTIFACT_PATH_ENV,
  loadSixFactorPolicyArtifact,
} from "@/lib/ml-six-factor-artifact-loader";
import {
  CATBOOST_SCORER_MODE_ENV,
  CATBOOST_SCORER_URL_ENV,
  readCatBoostScorerMode,
} from "@/lib/ml-six-factor-catboost-python-scorer";
import { FORBIDDEN_APP_POLICY_FEATURE_FIELDS } from "@/lib/ml-six-factor-feature-builder";
import {
  SIX_FACTOR_ML_POLICY_ENV,
  resolveSixFactorPolicyDecisionWithFeaturesAsync,
} from "@/lib/ml-six-factor-policy-adapter";
import {
  validateSixFactorCandidateConfig,
  type SixFactorCandidateConfigV1,
} from "@/lib/ml-six-factor-policy-contract";
import { runMlSixFactorRuntimeArtifactAudit } from "@/lib/ml-six-factor-runtime-artifact-audit";
import { getFinalThesisPolicy } from "@/lib/research-policy-registry";

const CATBOOST_RUNTIME_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json";
const DEFAULT_LINEAR_ARTIFACT_PATH =
  "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json";

type CatBoostPolicyV2HttpLearnerFlowSmokeResult = {
  readonly ok: true;
  readonly artifactPath: string;
  readonly scorerMode: "python_http";
  readonly scorerUrlConfigured: true;
  readonly scorerUrlKind: "absolute" | "relative";
  readonly defaultArtifactPathStillLinear: boolean;
  readonly policyV2RuntimeStatus: string;
  readonly runtimeArtifactAuditStatus: string;
  readonly decisionSource: string;
  readonly backendKind: string | null;
  readonly modelVersion: string | null;
  readonly fallbackUsed: boolean;
  readonly candidateCount: number;
  readonly selectedConfig: SixFactorCandidateConfigV1;
  readonly featureCount: number;
  readonly noOutcomeFieldsInPreDecisionFeatures: boolean;
  readonly checks: readonly string[];
};

type FeatureSchema = {
  readonly feature_columns: readonly string[];
  readonly leakage_guard?: {
    readonly uses_only_pre_decision_data?: unknown;
    readonly outcome_fields_in_features?: unknown;
  };
  readonly allowed_source_blocks?: readonly string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function resolveRepoPath(path: string) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function readFeatureSchema(path: string): FeatureSchema {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  assert(isRecord(parsed), "CatBoost feature_schema must be a JSON object.");
  const featureColumns = parsed.feature_columns;
  assert(
    Array.isArray(featureColumns) &&
      featureColumns.every((entry) => typeof entry === "string" && entry.length > 0),
    "CatBoost feature_schema.feature_columns must be a string list.",
  );
  const leakageGuard = isRecord(parsed.leakage_guard)
    ? parsed.leakage_guard
    : undefined;
  const allowedSourceBlocks = Array.isArray(parsed.allowed_source_blocks)
    ? parsed.allowed_source_blocks.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : undefined;

  return {
    feature_columns: featureColumns,
    leakage_guard: leakageGuard,
    allowed_source_blocks: allowedSourceBlocks,
  };
}

function readFeatureSchemaPath(artifactPath: string) {
  const parsed: unknown = JSON.parse(readFileSync(artifactPath, "utf8"));
  assert(isRecord(parsed), "CatBoost artifact must be a JSON object.");
  assert(
    parsed.model_family === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    "CatBoost artifact model_family mismatch.",
  );
  const featureSchemaFile = readString(parsed.feature_schema_file);
  assert(featureSchemaFile != null, "CatBoost artifact feature_schema_file is missing.");
  return resolve(resolveRepoPath(artifactPath), "..", featureSchemaFile);
}

function assertNoOutcomeFields(
  features: Record<string, unknown>,
  featureColumns: readonly string[],
) {
  const forbidden = new Set<string>([
    ...FORBIDDEN_APP_POLICY_FEATURE_FIELDS,
    "postScore",
    "post_score",
    "nextStepSuccess",
    "next_step_success",
    "normalizedLearningGain",
    "normalized_learning_gain",
    "learningGain",
    "learning_gain",
    "target",
  ]);
  const featureKeys = Object.keys(features);
  const leakedFeatureKeys = featureKeys.filter((key) => forbidden.has(key));
  const leakedColumns = featureColumns.filter((key) => forbidden.has(key));

  assert(
    leakedFeatureKeys.length === 0,
    `Pre-decision feature snapshot contains outcome fields: ${leakedFeatureKeys.join(", ")}`,
  );
  assert(
    leakedColumns.length === 0,
    `CatBoost feature schema contains outcome columns: ${leakedColumns.join(", ")}`,
  );
}

function readConfiguredScorerUrl(env: Record<string, string | undefined>) {
  const configuredUrl = readString(env[CATBOOST_SCORER_URL_ENV]);
  assert(
    configuredUrl != null,
    "EDUAI_CATBOOST_SCORER_URL is required for HTTP learner-flow smoke; use /api/catboost-score with a running dev server or deployment URL.",
  );
  return configuredUrl;
}

export async function runCatBoostPolicyV2HttpLearnerFlowSmoke(
  env: Record<string, string | undefined> = process.env,
): Promise<CatBoostPolicyV2HttpLearnerFlowSmokeResult> {
  const configuredScorerUrl = readConfiguredScorerUrl(env);
  const artifactPath =
    env[SIX_FACTOR_ARTIFACT_PATH_ENV]?.trim() || CATBOOST_RUNTIME_ARTIFACT_PATH;
  const absoluteArtifactPath = resolveRepoPath(artifactPath);
  assert(existsSync(absoluteArtifactPath), `CatBoost artifact is missing: ${artifactPath}`);

  const finalPolicy = getFinalThesisPolicy();
  assert(finalPolicy.id === "policy_v2", "Final thesis policy must be policy_v2.");
  assert(
    finalPolicy.runtimeStatus === "runtime_supported",
    "policy_v2 must be runtime_supported before learner-flow smoke.",
  );
  assert(
    finalPolicy.artifactPath === CATBOOST_RUNTIME_ARTIFACT_PATH,
    "policy_v2 artifactPath must point at runtime CatBoost artifact.",
  );

  const defaultAudit = runMlSixFactorRuntimeArtifactAudit({});
  assert(defaultAudit.status === "OK", "Default runtime artifact audit must return OK.");
  assert(
    defaultAudit.configuredArtifactPathSource === "default_linear" &&
      defaultAudit.configuredArtifactPath === DEFAULT_LINEAR_ARTIFACT_PATH,
    "Default artifact path must remain the linear runtime artifact.",
  );

  const catBoostAudit = runMlSixFactorRuntimeArtifactAudit({
    [SIX_FACTOR_ARTIFACT_PATH_ENV]: artifactPath,
  });
  assert(catBoostAudit.status === "OK", "CatBoost runtime artifact audit must return OK.");

  const artifactResult = loadSixFactorPolicyArtifact({
    [SIX_FACTOR_ARTIFACT_PATH_ENV]: artifactPath,
  });
  assert(
    artifactResult.ok,
    `CatBoost artifact loader failed: ${artifactResult.ok ? "" : artifactResult.error}`,
  );
  const featureSchema = readFeatureSchema(
    readFeatureSchemaPath(artifactResult.artifactPath),
  );
  assert(
    featureSchema.leakage_guard?.uses_only_pre_decision_data === true,
    "CatBoost feature_schema must use only pre-decision data.",
  );
  assert(
    featureSchema.leakage_guard?.outcome_fields_in_features === false,
    "CatBoost feature_schema must exclude outcome fields.",
  );
  assert(
    JSON.stringify(featureSchema.allowed_source_blocks) ===
      JSON.stringify(["pre_decision_features", "candidate_config"]),
    "CatBoost feature_schema allowed_source_blocks must remain pre-decision + candidate_config.",
  );

  const smokeEnv = {
    ...env,
    [SIX_FACTOR_ML_POLICY_ENV]: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]: artifactPath,
    [CATBOOST_SCORER_MODE_ENV]: "python_http",
    [CATBOOST_SCORER_URL_ENV]: configuredScorerUrl,
  };
  assert(
    readCatBoostScorerMode(smokeEnv) === "python_http",
    "CatBoost scorer mode must be python_http.",
  );

  const resolved = await resolveSixFactorPolicyDecisionWithFeaturesAsync(
    {
      userRef: "catboost_policy_v2_http_smoke_user",
      subjectRef: "mathematics",
      topicRef: "linear_equations",
      sessionRef: "catboost_policy_v2_http_smoke_session",
      contentEventRef: "catboost_policy_v2_http_smoke_event",
      priorAttemptsCount: 12,
      priorCorrectRate: 0.78,
      recentAttemptsCount: 5,
      recentCorrectRate: 0.8,
      topicSeenCount: 6,
      minutesSinceLastActivity: 35,
      sessionPosition: 3,
      declaredPreferenceDifficulty: "medium",
      declaredPreferenceDepth: "standard",
      declaredPreferenceFormat: "step_by_step",
      previousDifficulty: "medium",
      previousDepth: "standard",
      policyId: "policy_v2",
      postScore: 1,
      nextStepSuccess: true,
      normalizedLearningGain: 0.5,
    },
    { env: smokeEnv, maxCandidates: 30 },
  );
  const { decision, features } = resolved;

  assert(
    decision.decisionSource === "ml_policy",
    `CatBoost decisionSource must be ml_policy; warnings=${decision.warnings.join(" | ")}`,
  );
  assert(
    decision.backendKind === CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY,
    "CatBoost decision backendKind must indicate catboost_candidate_scorer_v1.",
  );
  assert(
    decision.modelVersion?.includes(CATBOOST_CANDIDATE_SCORER_MODEL_FAMILY) === true,
    "CatBoost decision modelVersion must indicate catboost_candidate_scorer_v1.",
  );
  assert(
    decision.fallbackUsed === false,
    `CatBoost learner-flow smoke must not use fallback; warnings=${decision.warnings.join(" | ")}`,
  );
  assert(
    typeof decision.candidateCount === "number" && decision.candidateCount > 1,
    "CatBoost learner-flow smoke must score more than one candidate.",
  );
  assert(
    validateSixFactorCandidateConfig(decision),
    "CatBoost selected config must contain all six factors.",
  );
  assertNoOutcomeFields(
    features as unknown as Record<string, unknown>,
    featureSchema.feature_columns,
  );

  return {
    ok: true,
    artifactPath,
    scorerMode: "python_http",
    scorerUrlConfigured: true,
    scorerUrlKind: /^https?:\/\//i.test(configuredScorerUrl) ? "absolute" : "relative",
    defaultArtifactPathStillLinear: true,
    policyV2RuntimeStatus: finalPolicy.runtimeStatus,
    runtimeArtifactAuditStatus: catBoostAudit.status,
    decisionSource: decision.decisionSource,
    backendKind: decision.backendKind,
    modelVersion: decision.modelVersion,
    fallbackUsed: decision.fallbackUsed,
    candidateCount: decision.candidateCount,
    selectedConfig: {
      difficulty: decision.difficulty,
      depth: decision.depth,
      supportLevel: decision.supportLevel,
      presentationFormat: decision.presentationFormat,
      examplesLevel: decision.examplesLevel,
      terminologyLevel: decision.terminologyLevel,
    },
    featureCount: featureSchema.feature_columns.length,
    noOutcomeFieldsInPreDecisionFeatures: true,
    checks: [
      "catboost_artifact_exists",
      "http_scorer_url_configured",
      "policy_v2_runtime_supported",
      "default_artifact_path_still_linear",
      "runtime_artifact_audit_ok",
      "async_policy_adapter_resolves_catboost_decision",
      "decision_source_ml_policy",
      "backend_metadata_catboost",
      "fallback_not_used",
      "candidate_count_gt_one",
      "selected_config_has_six_factors",
      "no_outcome_fields_in_pre_decision_features",
    ],
  };
}
