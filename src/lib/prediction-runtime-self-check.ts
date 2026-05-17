import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getActivePredictionRuntimeConfig } from "@/lib/active-policy";
import {
  ACCURACY_ML_FEATURE_SCHEMA_VERSION,
  PREDICTION_FEATURE_PAYLOAD_VERSION,
  PREDICTION_RUNTIME_CONFIG_VERSION,
  PREDICTION_RUNTIME_POLICY_ID,
  type PredictionRuntimeConfig,
} from "@/lib/prediction-contract";
import { buildPredictionFeaturePayload } from "@/lib/prediction-feature-layer";
import {
  clearAccuracyMlArtifactCache,
  getAccuracyMlArtifactMlFirstEligibility,
  loadAccuracyMlArtifactSnapshot,
} from "@/lib/prediction-ml";
import { runPredictionRuntime } from "@/lib/prediction-runtime";

export type PredictionRuntimeSelfCheckResult = {
  ok: boolean;
  artifactRuntimeReady: boolean;
  mlFirstReady: boolean;
  mlFirstProductionEligible: boolean;
  checks: Array<{
    name: string;
    ok: boolean;
    details?: Record<string, unknown>;
  }>;
};

function sampleFeaturePayload() {
  const currentAt = new Date("2026-05-17T00:00:00.000Z");
  return buildPredictionFeaturePayload({
    historyAttempts: [
      {
        score: 0.8,
        byTagJson: { _meta: { learning: { eligible: true } } },
        createdAt: new Date("2026-05-15T00:00:00.000Z"),
        test: {
          subjectId: "subject_ml_self_check",
          questionCount: 5,
        },
      },
      {
        score: 0.6,
        byTagJson: { _meta: { learning: { eligible: true } } },
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
        test: {
          subjectId: "subject_ml_self_check",
          questionCount: 5,
        },
      },
    ],
    durationAttempts: [],
    subjectId: "subject_ml_self_check",
    difficultyTarget: "medium",
    responseFormat: "mcq",
    questionCount: 5,
    currentAt,
  });
}

function artifactRuntimeConfig(artifactPath: string): PredictionRuntimeConfig {
  return {
    version: PREDICTION_RUNTIME_CONFIG_VERSION,
    policyId: PREDICTION_RUNTIME_POLICY_ID,
    backend: {
      kind: "artifact_ml",
      artifactPath,
    },
  };
}

function runInvalidArtifactCheck() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "eduai-prediction-runtime-"));
  const invalidArtifactPath = path.join(tempDir, "invalid-artifact.json");
  try {
    writeFileSync(
      invalidArtifactPath,
      `${JSON.stringify({ artifactKind: "invalid" })}\n`,
      "utf8",
    );
    clearAccuracyMlArtifactCache();
    const result = runPredictionRuntime({
      snapshot: {
        source: "config",
        path: "prediction-runtime-self-check",
        warning: null,
        raw: null,
        config: artifactRuntimeConfig(invalidArtifactPath),
        featurePayloadVersion: PREDICTION_FEATURE_PAYLOAD_VERSION,
        accuracyFeatureSchemaVersion: ACCURACY_ML_FEATURE_SCHEMA_VERSION,
      },
      featurePayload: sampleFeaturePayload(),
    });

    return {
      name: "invalid_artifact_reports_unavailable_ml_artifact",
      ok:
        result.runtime.backendStatus === "artifact_invalid" &&
        result.predicted.expectedAccuracy.status === "unavailable" &&
        result.predicted.expectedAccuracy.metadata.sourceType === "ml_artifact" &&
        result.predicted.expectedAccuracy.basis === "artifact_invalid",
      details: {
        backendStatus: result.runtime.backendStatus,
        expectedAccuracyStatus: result.predicted.expectedAccuracy.status,
        sourceType: result.predicted.expectedAccuracy.metadata.sourceType,
        basis: result.predicted.expectedAccuracy.basis,
      },
    };
  } finally {
    clearAccuracyMlArtifactCache();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function runPredictionRuntimeMlFirstSelfCheck(): Promise<PredictionRuntimeSelfCheckResult> {
  const snapshot = await getActivePredictionRuntimeConfig();
  const artifactSnapshot =
    snapshot.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(snapshot.config.backend.artifactPath)
      : loadAccuracyMlArtifactSnapshot();
  const artifactEligibility =
    artifactSnapshot.status === "ready"
      ? getAccuracyMlArtifactMlFirstEligibility(artifactSnapshot.artifact)
      : null;
  const checks: PredictionRuntimeSelfCheckResult["checks"] = [
    {
      name: "active_policy_uses_artifact_ml",
      ok: snapshot.config.backend.kind === "artifact_ml",
      details: {
        backendKind: snapshot.config.backend.kind,
        configPath: snapshot.path,
      },
    },
    {
      name: "artifact_exists_and_matches_accuracy_schema",
      ok: artifactSnapshot.status === "ready",
      details: {
        path: artifactSnapshot.path,
        status: artifactSnapshot.status,
        warning: artifactSnapshot.warning,
        artifactSchemaVersion:
          artifactSnapshot.artifact?.artifactSchemaVersion ?? null,
        modelVersion: artifactSnapshot.artifact?.modelVersion ?? null,
      },
    },
    {
      name: "artifact_is_ml_first_eligible",
      ok: artifactEligibility?.ok === true,
      details: {
        reason: artifactEligibility?.reason ?? `artifact_${artifactSnapshot.status}`,
        sourceMode: artifactEligibility?.details.sourceMode ?? null,
        eligibleOnly: artifactEligibility?.details.eligibleOnly ?? null,
        consentOnly: artifactEligibility?.details.consentOnly ?? null,
        trainSampleCount: artifactEligibility?.details.trainSampleCount ?? null,
        evalSampleCount: artifactEligibility?.details.evalSampleCount ?? null,
        evalMetricSampleCount:
          artifactEligibility?.details.evalMetricSampleCount ?? null,
      },
    },
  ];

  if (
    snapshot.config.backend.kind === "artifact_ml" &&
    artifactSnapshot.status === "ready" &&
    artifactEligibility?.ok === true
  ) {
    const runtimeResult = runPredictionRuntime({
      snapshot,
      featurePayload: sampleFeaturePayload(),
    });
    checks.push({
      name: "runtime_returns_ml_artifact_source_for_expected_accuracy",
      ok:
        runtimeResult.predicted.expectedAccuracy.status === "ready" &&
        runtimeResult.predicted.expectedAccuracy.metadata.sourceType ===
          "ml_artifact",
      details: {
        expectedAccuracyStatus:
          runtimeResult.predicted.expectedAccuracy.status,
        sourceType:
          runtimeResult.predicted.expectedAccuracy.metadata.sourceType,
        modelVersion:
          runtimeResult.predicted.expectedAccuracy.metadata.artifact.modelVersion,
      },
    });
  } else {
    checks.push({
      name: "runtime_returns_ml_artifact_source_for_expected_accuracy",
      ok: false,
      details: {
        reason:
          snapshot.config.backend.kind !== "artifact_ml"
            ? "active_policy_not_artifact_ml"
            : artifactSnapshot.status !== "ready"
              ? `artifact_${artifactSnapshot.status}`
              : artifactEligibility?.reason ?? "artifact_not_ml_first_eligible",
      },
    });
  }

  checks.push(runInvalidArtifactCheck());

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    artifactRuntimeReady:
      snapshot.config.backend.kind === "artifact_ml" &&
      artifactSnapshot.status === "ready",
    mlFirstReady: ok,
    mlFirstProductionEligible: artifactEligibility?.ok === true,
    checks,
  };
}

export async function runPredictionRuntimeDevSelfCheck(): Promise<PredictionRuntimeSelfCheckResult> {
  const snapshot = await getActivePredictionRuntimeConfig();
  const artifactSnapshot =
    snapshot.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(snapshot.config.backend.artifactPath)
      : loadAccuracyMlArtifactSnapshot();
  const artifactEligibility =
    artifactSnapshot.status === "ready"
      ? getAccuracyMlArtifactMlFirstEligibility(artifactSnapshot.artifact)
      : null;
  const checks: PredictionRuntimeSelfCheckResult["checks"] = [
    {
      name: "active_policy_uses_artifact_ml",
      ok: snapshot.config.backend.kind === "artifact_ml",
      details: {
        backendKind: snapshot.config.backend.kind,
        configPath: snapshot.path,
      },
    },
    {
      name: "artifact_exists_and_matches_accuracy_schema",
      ok: artifactSnapshot.status === "ready",
      details: {
        path: artifactSnapshot.path,
        status: artifactSnapshot.status,
        warning: artifactSnapshot.warning,
        artifactSchemaVersion:
          artifactSnapshot.artifact?.artifactSchemaVersion ?? null,
        modelVersion: artifactSnapshot.artifact?.modelVersion ?? null,
        sourceMode: artifactSnapshot.artifact?.source.mode ?? null,
        eligibleOnly: artifactSnapshot.artifact?.source.eligibleOnly ?? null,
        consentOnly: artifactSnapshot.artifact?.source.consentOnly ?? null,
        productionEligible: artifactEligibility?.ok ?? false,
        productionEligibilityReason:
          artifactEligibility?.reason ?? `artifact_${artifactSnapshot.status}`,
        researchEvidence: artifactEligibility?.ok ?? false,
      },
    },
  ];

  if (
    snapshot.config.backend.kind === "artifact_ml" &&
    artifactSnapshot.status === "ready"
  ) {
    const runtimeResult = runPredictionRuntime({
      snapshot,
      featurePayload: sampleFeaturePayload(),
    });
    checks.push({
      name: "runtime_returns_ml_artifact_source_for_expected_accuracy",
      ok:
        runtimeResult.predicted.expectedAccuracy.status === "ready" &&
        runtimeResult.predicted.expectedAccuracy.metadata.sourceType ===
          "ml_artifact" &&
        runtimeResult.predicted.expectedAccuracy.metadata.backendKind ===
          "artifact_ml" &&
        runtimeResult.predicted.expectedAccuracy.metadata.artifact.status === "ready",
      details: {
        expectedAccuracyStatus:
          runtimeResult.predicted.expectedAccuracy.status,
        sourceType:
          runtimeResult.predicted.expectedAccuracy.metadata.sourceType,
        backendKind:
          runtimeResult.predicted.expectedAccuracy.metadata.backendKind,
        artifactStatus:
          runtimeResult.predicted.expectedAccuracy.metadata.artifact.status,
        modelVersion:
          runtimeResult.predicted.expectedAccuracy.metadata.artifact.modelVersion,
        productionEligible:
          runtimeResult.predicted.expectedAccuracy.metadata.artifact
            .productionEligible,
        researchEvidence:
          runtimeResult.predicted.expectedAccuracy.metadata.artifact
            .researchEvidence,
      },
    });
  } else {
    checks.push({
      name: "runtime_returns_ml_artifact_source_for_expected_accuracy",
      ok: false,
      details: {
        reason:
          snapshot.config.backend.kind !== "artifact_ml"
            ? "active_policy_not_artifact_ml"
            : `artifact_${artifactSnapshot.status}`,
      },
    });
  }

  checks.push(runInvalidArtifactCheck());

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    artifactRuntimeReady:
      snapshot.config.backend.kind === "artifact_ml" &&
      artifactSnapshot.status === "ready",
    mlFirstReady: artifactEligibility?.ok === true && ok,
    mlFirstProductionEligible: artifactEligibility?.ok === true,
    checks,
  };
}
