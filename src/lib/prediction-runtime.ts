import {
  PREDICTION_POLICY_V1,
  type ActivePredictionRuntimeSnapshot,
} from "@/lib/active-policy";
import {
  difficultyAccuracyAdjust,
  expectedTotalDurationBaselineMs,
} from "@/lib/prediction-baselines";
import {
  ARTIFACT_ML_BACKEND_ID,
  DEFAULT_PREDICTION_RUNTIME_POLICY,
  HEURISTIC_BASELINE_BACKEND_ID,
  STUB_MODEL_BACKEND_ID,
  type PredictionAccuracyWindowEvidence,
  type PredictionArtifactDescriptor,
  type PredictionCell,
  type PredictionCellMetadata,
  type PredictionFeaturePayload,
  type PredictionRuntimeDescriptor,
} from "@/lib/prediction-contract";
import {
  buildAccuracyMlFeatureInputFromPayload,
  buildAccuracyMlFeatureVectorFromPayload,
} from "@/lib/prediction-feature-layer";
import {
  DURATION_PREDICTOR_VERSION,
  predictExpectedTotalDurationMsFromEvidence,
} from "@/lib/prediction-duration";
import { getActivePredictionModelParams } from "@/lib/prediction-params";
import {
  loadAccuracyMlArtifactSnapshot,
  predictExpectedAccuracyFromMlArtifact,
} from "@/lib/prediction-ml";

const CONFIDENCE_FULL_EVIDENCE_QUESTIONS = 100;
const BASELINE_DURATION_PREDICTOR_VERSION = "baseline_duration_v1_2026_03";
const STUB_MODEL_BASIS = "hardcoded_feature_vector_stub";

export type PredictionRuntimeResult = {
  runtime: PredictionRuntimeDescriptor;
  predicted: {
    expectedAccuracy: PredictionCell;
    expectedTotalDurationMs: PredictionCell;
  };
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function betaPosteriorMean(
  correctSum: number,
  totalSum: number,
  betaA: number,
  betaB: number,
) {
  return (betaA + correctSum) / (betaA + betaB + totalSum);
}

function resolveBackendId(snapshot: ActivePredictionRuntimeSnapshot) {
  if (snapshot.config.backend.kind === "heuristic_baseline") {
    return `${HEURISTIC_BASELINE_BACKEND_ID}:${snapshot.config.backend.heuristicPolicyId}`;
  }
  if (snapshot.config.backend.kind === "artifact_ml") {
    return ARTIFACT_ML_BACKEND_ID;
  }
  return STUB_MODEL_BACKEND_ID;
}

function toArtifactDescriptor(
  snapshot:
    | {
        status: "ready" | "missing" | "invalid";
        path: string;
        warning: string | null;
        artifact: { modelVersion: string; artifactSchemaVersion: string } | null;
      }
    | null,
): PredictionArtifactDescriptor {
  if (!snapshot) {
    return {
      status: "not_applicable",
      path: null,
      warning: null,
      modelVersion: null,
      artifactSchemaVersion: null,
    };
  }

  return {
    status: snapshot.status,
    path: snapshot.path,
    warning: snapshot.warning,
    modelVersion: snapshot.artifact?.modelVersion ?? null,
    artifactSchemaVersion: snapshot.artifact?.artifactSchemaVersion ?? null,
  };
}

function createRuntimeDescriptor(params: {
  snapshot: ActivePredictionRuntimeSnapshot;
  artifact: PredictionArtifactDescriptor;
}): PredictionRuntimeDescriptor {
  const { snapshot, artifact } = params;
  return {
    policyId: DEFAULT_PREDICTION_RUNTIME_POLICY.id,
    policyVersion: DEFAULT_PREDICTION_RUNTIME_POLICY.version,
    configVersion: snapshot.config.version,
    selectionSource: snapshot.source,
    selectionWarning: snapshot.warning,
    backendKind: snapshot.config.backend.kind,
    backendId: resolveBackendId(snapshot),
    backendStatus:
      snapshot.config.backend.kind === "artifact_ml"
        ? artifact.status === "missing"
          ? "artifact_missing"
          : artifact.status === "invalid"
            ? "artifact_invalid"
            : "ready"
        : "ready",
    featurePayloadVersion: snapshot.featurePayloadVersion,
    accuracyFeatureSchemaVersion: snapshot.accuracyFeatureSchemaVersion,
    artifact,
  };
}

function createCellMetadata(params: {
  runtime: PredictionRuntimeDescriptor;
  targetId: PredictionCell["targetId"];
  sourceType: PredictionCellMetadata["sourceType"];
  producerId: string;
}): PredictionCellMetadata {
  return {
    targetId: params.targetId,
    sourceType: params.sourceType,
    producerId: params.producerId,
    backendKind: params.runtime.backendKind,
    backendId: params.runtime.backendId,
    runtimePolicyId: params.runtime.policyId,
    featurePayloadVersion: params.runtime.featurePayloadVersion,
    accuracyFeatureSchemaVersion: params.runtime.accuracyFeatureSchemaVersion,
    artifact: params.runtime.artifact,
  };
}

function readyCell(params: {
  runtime: PredictionRuntimeDescriptor;
  targetId: PredictionCell["targetId"];
  sourceType: PredictionCellMetadata["sourceType"];
  producerId: string;
  value: number | null;
  confidence: number;
  basis: string;
  components?: PredictionCell["components"];
}): PredictionCell {
  return {
    targetId: params.targetId,
    status: "ready",
    value: params.value,
    confidence: params.confidence,
    basis: params.basis,
    metadata: createCellMetadata({
      runtime: params.runtime,
      targetId: params.targetId,
      sourceType: params.sourceType,
      producerId: params.producerId,
    }),
    components: params.components,
  };
}

function unavailableCell(params: {
  runtime: PredictionRuntimeDescriptor;
  targetId: PredictionCell["targetId"];
  sourceType: PredictionCellMetadata["sourceType"];
  producerId: string;
  basis: string;
}): PredictionCell {
  return {
    targetId: params.targetId,
    status: "unavailable",
    value: null,
    confidence: 0,
    basis: params.basis,
    metadata: createCellMetadata({
      runtime: params.runtime,
      targetId: params.targetId,
      sourceType: params.sourceType,
      producerId: params.producerId,
    }),
  };
}

function pickHeuristicEvidence(
  payload: PredictionFeaturePayload,
): PredictionAccuracyWindowEvidence | null {
  if (
    payload.context.subjectId &&
    payload.accuracyEvidence.subjectLastNClean.attemptCount >=
      payload.accuracyEvidence.subjectCleanMinAttempts
  ) {
    return payload.accuracyEvidence.subjectLastNClean;
  }

  if (
    payload.context.subjectId &&
    payload.accuracyEvidence.subjectLastNFallback.attemptCount > 0
  ) {
    return payload.accuracyEvidence.subjectLastNFallback;
  }

  if (payload.accuracyEvidence.globalLastNClean.attemptCount > 0) {
    return payload.accuracyEvidence.globalLastNClean;
  }

  return null;
}

function predictHeuristicAccuracyRawMean(payload: PredictionFeaturePayload) {
  const selected = pickHeuristicEvidence(payload);
  if (!selected || selected.totalQuestions <= 0) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  return {
    value: clamp01(selected.correctQuestions / selected.totalQuestions),
    confidence: clamp01(selected.totalQuestions / CONFIDENCE_FULL_EVIDENCE_QUESTIONS),
    basis: `${selected.scope}|raw_mean`,
  };
}

function predictHeuristicAccuracyBeta(payload: PredictionFeaturePayload) {
  const selected = pickHeuristicEvidence(payload);
  if (!selected || selected.totalQuestions <= 0) {
    return {
      value: null,
      confidence: 0,
      basis: "insufficient_data",
    };
  }

  const modelParams = getActivePredictionModelParams();
  const posterior = betaPosteriorMean(
    selected.correctQuestions,
    selected.totalQuestions,
    modelParams.betaA,
    modelParams.betaB,
  );
  const adjusted = clamp01(
    posterior +
      difficultyAccuracyAdjust(
        payload.context.difficultyTarget,
        modelParams.diffAdjustMag,
      ),
  );

  return {
    value: adjusted,
    confidence: clamp01(selected.totalQuestions / CONFIDENCE_FULL_EVIDENCE_QUESTIONS),
    basis: `${selected.scope}|beta_binomial_posterior + difficulty_adjust`,
  };
}

function predictStubAccuracy(payload: PredictionFeaturePayload) {
  const featureVector = buildAccuracyMlFeatureVectorFromPayload(payload);
  const weights = {
    difficulty_easy: 0.32,
    difficulty_hard: -0.32,
    question_count_centered: -0.08,
    log_total_questions_before: 0.24,
    recent_accuracy_centered: 0.96,
    recent_accuracy_missing: -0.18,
    log_time_since_last_attempt_days: -0.06,
    time_since_last_attempt_missing: 0.03,
  } as const;

  let logit = 0;
  for (const [featureName, weight] of Object.entries(weights)) {
    logit +=
      featureVector.values[featureName as keyof typeof featureVector.values] * weight;
  }

  return {
    value: clamp01(sigmoid(logit)),
    confidence:
      payload.accuracyEvidence.totalQuestionsBefore > 0
        ? clamp01(payload.accuracyEvidence.totalQuestionsBefore / 100) * 0.6
        : 0.05,
    basis: `${STUB_MODEL_BACKEND_ID}|${STUB_MODEL_BASIS}`,
  };
}

function predictDurationCell(params: {
  runtime: PredictionRuntimeDescriptor;
  payload: PredictionFeaturePayload;
  useBaselineOnly: boolean;
}): PredictionCell {
  if (params.useBaselineOnly) {
    const baseline = expectedTotalDurationBaselineMs({
      difficultyTarget: params.payload.context.difficultyTarget,
      responseFormat: params.payload.context.responseFormat,
      questionCount: params.payload.context.questionCount,
    });

    return readyCell({
      runtime: params.runtime,
      targetId: "expected_total_duration_ms",
      sourceType: "heuristic",
      producerId: BASELINE_DURATION_PREDICTOR_VERSION,
      value: baseline,
      confidence: 0,
      basis: `${BASELINE_DURATION_PREDICTOR_VERSION}|baseline_only`,
      components: {
        baseline,
      },
    });
  }

  const predicted = predictExpectedTotalDurationMsFromEvidence({
    difficultyTarget: params.payload.context.difficultyTarget,
    responseFormat: params.payload.context.responseFormat,
    questionCount: params.payload.context.questionCount,
    telemetryEvidence: params.payload.durationEvidence,
  });

  return readyCell({
    runtime: params.runtime,
    targetId: "expected_total_duration_ms",
    sourceType: "heuristic",
    producerId: DURATION_PREDICTOR_VERSION,
    value: predicted.value,
    confidence: predicted.confidence,
    basis: predicted.basis,
    components: predicted.components,
  });
}

export function runPredictionRuntime(params: {
  snapshot: ActivePredictionRuntimeSnapshot;
  featurePayload: PredictionFeaturePayload;
}): PredictionRuntimeResult {
  const artifactSnapshot =
    params.snapshot.config.backend.kind === "artifact_ml"
      ? loadAccuracyMlArtifactSnapshot(params.snapshot.config.backend.artifactPath)
      : null;
  const runtime = createRuntimeDescriptor({
    snapshot: params.snapshot,
    artifact: toArtifactDescriptor(artifactSnapshot),
  });

  if (params.snapshot.config.backend.kind === "heuristic_baseline") {
    const heuristicPolicyId = params.snapshot.config.backend.heuristicPolicyId;
    const predictedAccuracy =
      heuristicPolicyId === PREDICTION_POLICY_V1
        ? predictHeuristicAccuracyRawMean(params.featurePayload)
        : predictHeuristicAccuracyBeta(params.featurePayload);

    return {
      runtime,
      predicted: {
        expectedAccuracy: readyCell({
          runtime,
          targetId: "expected_accuracy",
          sourceType: "heuristic",
          producerId: heuristicPolicyId,
          value: predictedAccuracy.value,
          confidence: predictedAccuracy.confidence,
          basis: predictedAccuracy.basis,
        }),
        expectedTotalDurationMs: predictDurationCell({
          runtime,
          payload: params.featurePayload,
          useBaselineOnly: heuristicPolicyId === PREDICTION_POLICY_V1,
        }),
      },
    };
  }

  if (params.snapshot.config.backend.kind === "stub_model") {
    const predictedAccuracy = predictStubAccuracy(params.featurePayload);

    return {
      runtime,
      predicted: {
        expectedAccuracy: readyCell({
          runtime,
          targetId: "expected_accuracy",
          sourceType: "stub",
          producerId: STUB_MODEL_BACKEND_ID,
          value: predictedAccuracy.value,
          confidence: predictedAccuracy.confidence,
          basis: predictedAccuracy.basis,
        }),
        expectedTotalDurationMs: predictDurationCell({
          runtime,
          payload: params.featurePayload,
          useBaselineOnly: false,
        }),
      },
    };
  }

  if (!artifactSnapshot || artifactSnapshot.status !== "ready") {
    return {
      runtime,
      predicted: {
        expectedAccuracy: unavailableCell({
          runtime,
          targetId: "expected_accuracy",
          sourceType: "ml_artifact",
          producerId: ARTIFACT_ML_BACKEND_ID,
          basis:
            artifactSnapshot?.status === "invalid"
              ? "artifact_invalid"
              : "artifact_missing",
        }),
        expectedTotalDurationMs: predictDurationCell({
          runtime,
          payload: params.featurePayload,
          useBaselineOnly: false,
        }),
      },
    };
  }

  const predictedAccuracy = predictExpectedAccuracyFromMlArtifact({
    artifact: artifactSnapshot.artifact,
    featureInput: buildAccuracyMlFeatureInputFromPayload(params.featurePayload),
  });

  return {
    runtime,
    predicted: {
      expectedAccuracy: readyCell({
        runtime,
        targetId: "expected_accuracy",
        sourceType: "ml_artifact",
        producerId: artifactSnapshot.artifact.modelVersion,
        value: predictedAccuracy.value,
        confidence: predictedAccuracy.confidence,
        basis: predictedAccuracy.basis,
      }),
      expectedTotalDurationMs: predictDurationCell({
        runtime,
        payload: params.featurePayload,
        useBaselineOnly: false,
      }),
    },
  };
}
