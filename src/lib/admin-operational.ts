import { PrismaClient } from "@prisma/client";
import { getOperationalReadinessReport } from "@/lib/operational-readiness";
import { getActivePredictionRuntimeConfig } from "@/lib/active-policy";
import {
  loadEduAiNativePedagogyArtifactSlotSnapshot,
} from "@/lib/model-artifact-slot";
import {
  getAccuracyMlArtifactEvidence,
  getAccuracyMlArtifactMlFirstEligibility,
  loadAccuracyMlArtifactSnapshot,
} from "@/lib/prediction-ml";
import { RATE_LIMIT_BACKEND } from "@/lib/rate-limit";
import { getTrainingEligibilitySnapshot } from "@/lib/training-eligibility";

export async function getAdminOperationalSummary(prisma: PrismaClient) {
  const [readiness, runtimeConfig, users, recentAuditEvents] = await Promise.all([
    getOperationalReadinessReport(),
    getActivePredictionRuntimeConfig(),
    prisma.user.findMany({
      select: {
        id: true,
        researchConsentAt: true,
        researchConsentVersion: true,
        researchConsentWithdrawnAt: true,
        trainingDataExclusionAt: true,
        trainingDataExclusionReason: true,
      },
    }),
    prisma.operatorAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        result: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const slotSnapshot = loadEduAiNativePedagogyArtifactSlotSnapshot();
  const artifactSnapshot =
    runtimeConfig.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(runtimeConfig.config.backend.artifactPath)
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
    runtimeConfig.config.backend.kind === "artifact_ml" &&
    artifactSnapshot?.status === "ready";
  const mlFirstProductionEligible =
    artifactRuntimeReady && artifactEligibility?.ok === true;

  const consentStats = users.reduce(
    (acc, user) => {
      const eligibility = getTrainingEligibilitySnapshot(user);
      acc.totalUsers += 1;
      if (eligibility.consentGranted) {
        acc.consentGranted += 1;
      }
      if (eligibility.consentWithdrawnAtIso) {
        acc.consentWithdrawn += 1;
      }
      if (eligibility.excludedFromFutureTraining) {
        acc.excludedFromFutureTraining += 1;
      }
      if (eligibility.futureTrainingEligible) {
        acc.futureTrainingEligible += 1;
      }
      return acc;
    },
    {
      totalUsers: 0,
      consentGranted: 0,
      consentWithdrawn: 0,
      excludedFromFutureTraining: 0,
      futureTrainingEligible: 0,
    },
  );

  return {
    readiness,
    runtime: {
      source: runtimeConfig.source,
      warning: runtimeConfig.warning,
      policyId: runtimeConfig.config.policyId,
      backendKind: runtimeConfig.config.backend.kind,
      artifactPath:
        runtimeConfig.config.backend.kind === "artifact_ml"
          ? runtimeConfig.config.backend.artifactPath ?? null
          : null,
      artifactStatus: artifactSnapshot?.status ?? "not_applicable",
      artifactModelVersion: artifactSnapshot?.artifact?.modelVersion ?? null,
      artifactSchemaVersion:
        artifactSnapshot?.artifact?.artifactSchemaVersion ?? null,
      artifactWarning: artifactSnapshot?.warning ?? null,
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
      artifactMlFirstEligibilityReason: artifactEligibility?.reason ?? null,
      mlFirstReady: mlFirstProductionEligible,
      rateLimiterBackend: RATE_LIMIT_BACKEND,
    },
    artifactSlot: {
      slotMetadataStatus: slotSnapshot.status,
      slotStatus: slotSnapshot.metadata.slotStatus,
      runtimeIntegrationStatus: slotSnapshot.metadata.runtimeIntegrationStatus,
      artifactExists: slotSnapshot.artifactExists,
      warning: slotSnapshot.warning,
      runtimeArtifactStatus: artifactSnapshot?.status ?? "not_applicable",
      runtimeArtifactWarning: artifactSnapshot?.warning ?? null,
    },
    consent: consentStats,
    exports: {
      dataset: {
        path: "/api/admin/dataset-export",
        requiresAdmin: true,
      },
      evaluation: {
        path: "/api/admin/evaluation-export",
        requiresAdmin: true,
      },
    },
    recentDangerousActions: recentAuditEvents.map((event) => ({
      id: event.id,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      result: event.result,
      createdAtIso: event.createdAt.toISOString(),
      actor: {
        id: event.actor?.id ?? null,
        email: event.actor?.email ?? null,
        name: event.actor?.name ?? null,
      },
    })),
  };
}

export async function listRecentOperatorAuditEvents(
  prisma: PrismaClient,
  limit = 20,
) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const events = await prisma.operatorAuditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      result: true,
      ipAddress: true,
      summaryJson: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    result: event.result,
    ipAddress: event.ipAddress,
    summary: event.summaryJson,
    createdAtIso: event.createdAt.toISOString(),
    actor: {
      id: event.actor?.id ?? null,
      email: event.actor?.email ?? null,
      name: event.actor?.name ?? null,
    },
  }));
}
