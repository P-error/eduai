import { optionalEnv } from "@/lib/env";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMIT_BACKEND,
  getRateLimitBackendHealth,
} from "@/lib/rate-limit";
import { getActivePredictionRuntimeConfig } from "@/lib/active-policy";
import { loadAccuracyMlArtifactSnapshot } from "@/lib/prediction-ml";
import { loadEduAiNativePedagogyArtifactSlotSnapshot } from "@/lib/model-artifact-slot";

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
  const details = {
    source: snapshot.source,
    path: snapshot.path,
    warning: snapshot.warning,
    backendKind: snapshot.config.backend.kind,
    policyId: snapshot.config.policyId,
  };

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
  ] = await Promise.all([
    checkDatabaseReachable(),
    checkPrismaContractHealthy(),
    checkRateLimiter(),
    checkPredictionRuntime(),
    checkArtifactSlot(),
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
    llm,
  };
  const checkLabels: Record<keyof typeof components, string> = {
    db: "Database reachability",
    prismaContract: "Prisma/runtime contract",
    auth: "Auth/session config",
    rateLimiter: "Rate limiter backend",
    predictionRuntime: "Prediction runtime state",
    artifactSlot: "Artifact slot state",
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
