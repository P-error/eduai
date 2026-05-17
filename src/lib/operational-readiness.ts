import { optionalEnv } from "@/lib/env";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMIT_BACKEND,
  getRateLimitBackendHealth,
} from "@/lib/rate-limit";
import { getActivePredictionRuntimeConfig } from "@/lib/active-policy";
import {
  getAccuracyMlArtifactEvidence,
  getAccuracyMlArtifactMlFirstEligibility,
  loadAccuracyMlArtifactSnapshot,
} from "@/lib/prediction-ml";
import { loadEduAiNativePedagogyArtifactSlotSnapshot } from "@/lib/model-artifact-slot";
import { loadSixFactorPolicyArtifact } from "@/lib/ml-six-factor-artifact-loader";
import { isSixFactorMlPolicyEnabled } from "@/lib/ml-six-factor-policy-adapter";
import {
  isSixFactorApplyEnabled,
  isSixFactorShadowOnlyEnabled,
} from "@/lib/ml-six-factor-apply";
import { isSixFactorShadowEnabled } from "@/lib/ml-six-factor-shadow";

export type OperationalCheckStatus = "ok" | "warn" | "error";

export type OperationalCheck = {
  ok: boolean;
  status: OperationalCheckStatus;
  summary: string;
  details?: Record<string, unknown>;
};

export type OperationalReadinessReport = {
  ok: boolean;
  checkedAtIso: string;
  checks: Array<{
    key: keyof OperationalReadinessReport["components"];
    label: string;
    status: OperationalCheckStatus;
    message: string;
    details?: Record<string, unknown>;
  }>;
  components: {
    db: OperationalCheck;
    prismaContract: OperationalCheck;
    auth: OperationalCheck;
    rateLimiter: OperationalCheck;
    predictionRuntime: OperationalCheck;
    artifactSlot: OperationalCheck;
    sixFactorArtifact: OperationalCheck;
    llm: OperationalCheck;
  };
};

function okCheck(
  summary: string,
  details?: Record<string, unknown>,
): OperationalCheck {
  return {
    ok: true,
    status: "ok",
    summary,
    ...(details ? { details } : {}),
  };
}

function warnCheck(
  summary: string,
  details?: Record<string, unknown>,
): OperationalCheck {
  return {
    ok: true,
    status: "warn",
    summary,
    ...(details ? { details } : {}),
  };
}

function errorCheck(
  summary: string,
  details?: Record<string, unknown>,
): OperationalCheck {
  return {
    ok: false,
    status: "error",
    summary,
    ...(details ? { details } : {}),
  };
}

function parseOptionalUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

async function checkDatabaseReachable() {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    return rows[0]?.ok === 1
      ? okCheck("Database reachable.", {
          backend: "postgresql",
        })
      : errorCheck("Database health query returned an unexpected result.");
  } catch (error) {
    return errorCheck("Database unreachable.", {
      reason:
        error instanceof Error ? error.message : "db_check_failed",
    });
  }
}

async function checkPrismaContractHealthy() {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        userTable: string | null;
        evaluationEpisodeTable: string | null;
        rateLimitTable: string | null;
        operatorAuditTable: string | null;
      }>
    >`
      SELECT
        to_regclass('"User"')::text as "userTable",
        to_regclass('"EvaluationEpisode"')::text as "evaluationEpisodeTable",
        to_regclass('"RateLimitBucket"')::text as "rateLimitTable",
        to_regclass('"OperatorAuditEvent"')::text as "operatorAuditTable"
    `;
    const row = rows[0];
    if (
      row?.userTable &&
      row.evaluationEpisodeTable &&
      row.rateLimitTable &&
      row.operatorAuditTable
    ) {
      return okCheck("Prisma/runtime DB contract healthy.");
    }
    return errorCheck("Required runtime tables are missing.", {
      tables: row ?? null,
    });
  } catch (error) {
    return errorCheck("Prisma/runtime DB contract check failed.", {
      reason:
        error instanceof Error ? error.message : "prisma_contract_check_failed",
    });
  }
}

function checkAuthConfig() {
  const jwtSecret = optionalEnv("JWT_SECRET");
  if (!jwtSecret) {
    return errorCheck("JWT secret is not configured.", {
      sessionMode: "httpOnly_cookie_session",
      adminAccessMode: "stored_role_flag",
      cookieName: AUTH_COOKIE_NAME,
    });
  }

  if (jwtSecret === "dev-secret") {
    return errorCheck("JWT secret is using the unsafe development fallback.", {
      sessionMode: "httpOnly_cookie_session",
      adminAccessMode: "stored_role_flag",
      cookieName: AUTH_COOKIE_NAME,
    });
  }

  return okCheck("Auth/session configuration is sane.", {
    sessionMode: "httpOnly_cookie_session",
    adminAccessMode: "stored_role_flag",
    cookieName: AUTH_COOKIE_NAME,
  });
}

async function checkRateLimiter() {
  const backend = await getRateLimitBackendHealth();
  if (!backend.ok) {
    return errorCheck("External rate limiter backend unreachable.", {
      backend: RATE_LIMIT_BACKEND,
      warning: backend.warning,
    });
  }

  return okCheck("External rate limiter backend reachable.", {
    backend: RATE_LIMIT_BACKEND,
  });
}

async function checkPredictionRuntime() {
  const snapshot = await getActivePredictionRuntimeConfig();
  const artifactSnapshot =
    snapshot.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(snapshot.config.backend.artifactPath)
      : null;
  const artifactEligibility =
    artifactSnapshot?.status === "ready"
      ? getAccuracyMlArtifactMlFirstEligibility(artifactSnapshot.artifact)
      : null;
  const artifactEvidence =
    artifactSnapshot?.status === "ready"
      ? getAccuracyMlArtifactEvidence(artifactSnapshot.artifact)
      : null;
  const artifactRuntimeReady =
    snapshot.config.backend.kind === "artifact_ml" &&
    artifactSnapshot?.status === "ready";
  const mlFirstProductionEligible =
    artifactRuntimeReady && artifactEligibility?.ok === true;
  const details = {
    source: snapshot.source,
    path: snapshot.path,
    warning: snapshot.warning,
    backendKind: snapshot.config.backend.kind,
    policyId: snapshot.config.policyId,
    backendArtifactPath:
      snapshot.config.backend.kind === "artifact_ml"
        ? snapshot.config.backend.artifactPath ?? null
        : null,
    artifactStatus: artifactSnapshot?.status ?? "not_applicable",
    artifactPath: artifactSnapshot?.path ?? null,
    artifactWarning: artifactSnapshot?.warning ?? null,
    artifactSchemaVersion:
      artifactSnapshot?.artifact?.artifactSchemaVersion ?? null,
    modelVersion: artifactSnapshot?.artifact?.modelVersion ?? null,
    artifactSourceMode: artifactSnapshot?.artifact?.source.mode ?? null,
    artifactEligibleOnly:
      artifactSnapshot?.artifact?.source.eligibleOnly ?? null,
    artifactConsentOnly: artifactSnapshot?.artifact?.source.consentOnly ?? null,
    artifactTrainSampleCount:
      artifactSnapshot?.artifact?.training.trainSampleCount ?? null,
    artifactEvalSampleCount:
      artifactSnapshot?.artifact?.training.evalSampleCount ?? null,
    artifactProvenance: artifactEvidence?.artifactProvenance ?? null,
    artifactRuntimeReady,
    mlFirstProductionEligible,
    productionEligible: artifactEvidence?.productionEligible ?? false,
    researchEvidence: artifactEvidence?.researchEvidence ?? false,
    productionEligibilityReason: artifactEvidence?.reason ?? null,
    mlFirstEligibility: artifactEligibility,
    heuristicFallbackAvailable: true,
    fallbackMode: "heuristic_baseline_on_artifact_failure",
    featurePayloadVersion: snapshot.featurePayloadVersion,
    accuracyFeatureSchemaVersion: snapshot.accuracyFeatureSchemaVersion,
    mlFirstReady: mlFirstProductionEligible,
  };

  if (snapshot.config.backend.kind === "artifact_ml") {
    if (artifactRuntimeReady && mlFirstProductionEligible) {
      return okCheck(
        "Prediction runtime is serving from a production-eligible ML artifact.",
        details,
      );
    }
    if (artifactRuntimeReady) {
      return warnCheck(
        "DEV ML artifact active; artifact runtime is ready but not production/research eligible.",
        details,
      );
    }
    return errorCheck(
      "Prediction runtime is configured for artifact ML, but the artifact is missing or invalid.",
      details,
    );
  }

  if (snapshot.config.backend.kind === "heuristic_baseline") {
    return warnCheck(
      "Prediction runtime is using an explicit heuristic fallback; accuracy ML-first is blocked until a valid artifact is configured.",
      details,
    );
  }

  if (snapshot.warning) {
    return warnCheck("Prediction runtime is interpretable with warnings.", details);
  }

  return okCheck("Prediction runtime state is interpretable.", details);
}

async function checkArtifactSlot() {
  const runtime = await getActivePredictionRuntimeConfig();
  const slotSnapshot = loadEduAiNativePedagogyArtifactSlotSnapshot();
  const artifactSnapshot =
    runtime.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(runtime.config.backend.artifactPath)
      : null;

  const details = {
    runtimeBackendKind: runtime.config.backend.kind,
    slotStatus: slotSnapshot.metadata.slotStatus,
    slotMetadataStatus: slotSnapshot.status,
    runtimeIntegrationStatus: slotSnapshot.metadata.runtimeIntegrationStatus,
    artifactExists: slotSnapshot.artifactExists,
    slotWarning: slotSnapshot.warning,
    artifactStatus: artifactSnapshot?.status ?? "not_applicable",
    artifactWarning: artifactSnapshot?.warning ?? null,
  };

  if (runtime.config.backend.kind === "artifact_ml") {
    if (artifactSnapshot?.status === "ready") {
      return okCheck("Artifact-backed runtime slot is ready.", details);
    }
    return errorCheck("Artifact-backed runtime is configured, but artifact slot is not ready.", details);
  }

  if (slotSnapshot.status === "invalid") {
    return warnCheck("Artifact slot metadata is invalid, but runtime is not serving from it.", details);
  }

  return okCheck("Artifact slot state is interpretable for the current bridge runtime.", details);
}

function checkSixFactorArtifact() {
  const artifactResult = loadSixFactorPolicyArtifact();
  const mlPolicyEnabled = isSixFactorMlPolicyEnabled();
  const details = {
    shadowEnabled: isSixFactorShadowEnabled(),
    applyEnabled: isSixFactorApplyEnabled(),
    shadowOnly: isSixFactorShadowOnlyEnabled(),
    mlPolicyEnabled,
    artifactOk: artifactResult.ok,
    artifactPath: artifactResult.artifactPath,
    artifactStatus: artifactResult.ok ? "ready" : artifactResult.errorKind,
    artifactWarning: artifactResult.ok ? null : artifactResult.error,
    artifactSchemaVersion: artifactResult.ok
      ? artifactResult.artifact.artifact_schema_version
      : null,
    modelVersion: artifactResult.ok ? artifactResult.artifact.model_version : null,
    modelFamily: artifactResult.ok
      ? artifactResult.artifact.model.model_family
      : null,
    warnings: artifactResult.warnings,
  };

  if (!mlPolicyEnabled) {
    return warnCheck(
      "Six-factor ML policy is disabled; explicit heuristic/static fallback will be used.",
      details,
    );
  }

  if (!artifactResult.ok) {
    return errorCheck(
      "Six-factor ML policy is enabled, but the runtime artifact is missing or invalid.",
      details,
    );
  }

  return warnCheck(
    "Six-factor ML scorer artifact is runtime-compatible; current artifact provenance is not real-user efficacy proof.",
    details,
  );
}

function checkLlmConfig() {
  const apiKey = optionalEnv("OPENAI_API_KEY");
  const baseUrl = optionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const normalizedBaseUrl = parseOptionalUrl(baseUrl);

  if (!apiKey) {
    return errorCheck("LLM provider API key is not configured.", {
      baseUrl,
    });
  }

  if (!normalizedBaseUrl) {
    return errorCheck("LLM provider base URL is invalid.", {
      baseUrl,
    });
  }

  return okCheck("LLM provider configuration is sane.", {
    baseUrl: normalizedBaseUrl,
    providerMode: "openai_compatible",
  });
}

export async function getOperationalReadinessReport(): Promise<OperationalReadinessReport> {
  const [
    db,
    prismaContract,
    rateLimiter,
    predictionRuntime,
    artifactSlot,
    sixFactorArtifact,
  ] = await Promise.all([
    checkDatabaseReachable(),
    checkPrismaContractHealthy(),
    checkRateLimiter(),
    checkPredictionRuntime(),
    checkArtifactSlot(),
    Promise.resolve(checkSixFactorArtifact()),
  ]);
  const auth = checkAuthConfig();
  const llm = checkLlmConfig();

  const components = {
    db,
    prismaContract,
    auth,
    rateLimiter,
    predictionRuntime,
    artifactSlot,
    sixFactorArtifact,
    llm,
  };
  const checkLabels: Record<keyof typeof components, string> = {
    db: "Database reachability",
    prismaContract: "Prisma/runtime contract",
    auth: "Auth/session config",
    rateLimiter: "Rate limiter backend",
    predictionRuntime: "Prediction runtime state",
    artifactSlot: "Artifact slot state",
    sixFactorArtifact: "Six-factor ML artifact state",
    llm: "LLM configuration",
  };
  const checks = Object.entries(components).map(([key, component]) => ({
    key: key as keyof typeof components,
    label: checkLabels[key as keyof typeof components],
    status: component.status,
    message: component.summary,
    details: component.details,
  }));

  return {
    ok: Object.values(components).every((component) => component.ok),
    checkedAtIso: new Date().toISOString(),
    checks,
    components,
  };
}

export function getProcessHealthReport() {
  return {
    ok: true,
    status: "alive" as const,
    checkedAtIso: new Date().toISOString(),
  };
}
