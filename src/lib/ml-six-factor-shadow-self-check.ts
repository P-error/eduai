import {
  toMlSixFactorConfig,
  validateSixFactorCandidateConfig,
  validateSixFactorDecision,
} from "@/lib/ml-six-factor-policy-contract";
import { buildEduAIAppPolicyFeaturesV1 } from "@/lib/ml-six-factor-feature-builder";
import {
  createHeuristicSixFactorFallbackFromTwoFactor,
  createStaticSixFactorFallback,
} from "@/lib/ml-six-factor-fallback";
import { mapSixFactorDecisionToRenderPolicy } from "@/lib/ml-six-factor-render-mapping";
import {
  buildShadowSixFactorDecision,
  buildOptionalSixFactorShadowMetadata,
  buildSixFactorDecisionMetadata,
  isSixFactorShadowEnabled,
} from "@/lib/ml-six-factor-shadow";
import {
  generateSixFactorCandidateSet,
  hasDuplicateSixFactorCandidates,
} from "@/lib/ml-six-factor-candidate-generator";
import {
  filterUnsafeSixFactorCandidates,
  isSafeSixFactorCandidateForLearnerState,
  unsafeSixFactorCandidateReasons,
} from "@/lib/ml-six-factor-guardrails";
import {
  isSixFactorMlPolicyEnabled,
  resolveSixFactorPolicyDecision,
  resolveSixFactorPolicyDecisionForFeatures,
} from "@/lib/ml-six-factor-policy-adapter";
import {
  buildAppliedSixFactorPromptInstructions,
  isSixFactorApplyEnabled,
  shouldApplySixFactorRenderPolicy,
  type SixFactorApplyPathV1,
} from "@/lib/ml-six-factor-apply";
import {
  buildOptionalSixFactorDeliveredConfigMetadata,
  buildSixFactorDeliveredConfigMetadata,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  buildMissingSixFactorOutcome,
  buildSixFactorOutcome,
  buildSixFactorOutcomeLink,
  computeNormalizedLearningGain,
} from "@/lib/ml-six-factor-outcome-linking";
import {
  buildTrainingObservationV1FromAppRecord,
  isTrainingObservationV1Shape,
} from "@/lib/ml-six-factor-training-observation";
import {
  buildMockRealUserTrainingObservationExport,
  summarizeRealUserTrainingObservations,
} from "@/lib/ml-six-factor-real-user-export";
import { SIX_FACTOR_ARTIFACT_PATH_ENV } from "@/lib/ml-six-factor-artifact-loader";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSixMlFactors(config: Record<string, unknown>) {
  const expected = [
    "difficulty",
    "depth",
    "support_level",
    "presentation_format",
    "examples_level",
    "terminology_level",
  ];
  assert(
    expected.every((factor) => factor in config),
    "metadata must include all six ML factor keys",
  );
}

function buildLoggedPayload(params: {
  sixFactorShadow: unknown;
  promptInstructionsApplied: boolean;
}) {
  const basePayload = {
    prompt: "Existing learner-facing prompt",
    output: "Existing learner-facing output",
    technicalTestResponseFormat: "mcq",
    promptInstructionsApplied: params.promptInstructionsApplied,
  };

  return {
    ...basePayload,
    ...(params.sixFactorShadow ? { sixFactorShadow: params.sixFactorShadow } : {}),
  };
}

type ContentPathRegressionName =
  | "chat_route_event_meta"
  | "test_generation_validation_meta"
  | "learning_content_signals_json";

function applyPathForRegression(
  path: ContentPathRegressionName,
): SixFactorApplyPathV1 {
  if (path === "chat_route_event_meta") return "chat";
  if (path === "test_generation_validation_meta") return "test_generation";
  return "learning_content";
}

function buildContentPathRegressionPayload(params: {
  path: ContentPathRegressionName;
  env: Record<string, string | undefined>;
}) {
  const appliedPath = applyPathForRegression(params.path);
  const shadowContext = {
    userRef: "user_1",
    subjectRef: params.path === "chat_route_event_meta" ? null : "subject_1",
    topicRef: "topic_1",
    conceptKey: "concept_1",
    skillKey: "skill_1",
    familyKey: "family_1",
    topic: "Fixed learner-facing topic",
    sessionRef:
      params.path === "learning_content_signals_json" ? "episode_1" : null,
    previousDifficulty: "medium",
    previousDepth: "standard",
    declaredPreferences: {
      difficulty_target: "medium",
      depth: "standard",
      response_format: "mcq",
    },
    policyId: "policy_v1",
    backendKind: "heuristic_baseline",
    modelVersion: null,
    priorAttemptsCount: 4,
    recentCorrectRate: 0.6,
    timeSinceLastAttemptSec: 180,
    postScore: 1,
    nextStepSuccess: true,
    normalizedLearningGain: 1,
  };
  const applyResult = buildAppliedSixFactorPromptInstructions({
    context: shadowContext,
    env: params.env,
    path: appliedPath,
  });
  const sixFactorShadow =
    applyResult?.metadata ??
    buildOptionalSixFactorShadowMetadata(shadowContext, params.env);
  const sixFactorDeliveredConfig =
    buildOptionalSixFactorDeliveredConfigMetadata({
      sixFactorShadow,
      decisionCreatedAt: "2026-05-08T10:00:00.000Z",
      featuresCutoffAt: "2026-05-08T10:00:00.000Z",
      appliedPath,
    });
  const basePrompt = "Fixed learner-facing prompt";
  const prompt =
    applyResult?.applied && applyResult.promptInstructionBlock != null
      ? [basePrompt, applyResult.promptInstructionBlock].join("\n\n")
      : basePrompt;
  const learnerFacing = {
    prompt,
    output: "Fixed learner-facing output",
    content: "Fixed learner-facing content",
    technicalTestResponseFormat: "mcq",
    testResponseFormat: "mcq",
    promptInstructionsApplied: applyResult?.applied ?? false,
    appliedToLearnerFacingOutput:
      sixFactorShadow?.appliedToLearnerFacingOutput ?? false,
  };
  const metadata = {
    source: params.path,
    personalizationMode: "on",
    policyMode: "fixed_regression_policy",
    policyId: "policy_v1",
    pedagogicalDecision: {
      difficulty: "medium",
      depth: "standard",
    },
    renderingDecision: {
      tone: "formal",
      explanation_style: "stepwise",
      response_format: "mcq",
    },
    ...(sixFactorShadow ? { sixFactorShadow } : {}),
    ...(sixFactorDeliveredConfig ? { sixFactorDeliveredConfig } : {}),
  };

  return {
    path: params.path,
    learnerFacing,
    metadata,
  };
}

function stripSixFactorMetadata<
  T extends {
    sixFactorShadow?: unknown;
    sixFactorDeliveredConfig?: unknown;
  },
>(value: T) {
  const rest = { ...value };
  delete rest.sixFactorShadow;
  delete rest.sixFactorDeliveredConfig;
  return rest;
}

function assertLearnerFacingUnchanged(
  baseline: ReturnType<typeof buildContentPathRegressionPayload>,
  candidate: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  assert(
    JSON.stringify(baseline.learnerFacing) ===
      JSON.stringify(candidate.learnerFacing),
    `${candidate.path} learner-facing payload must be unchanged`,
  );
  assert(
    JSON.stringify(stripSixFactorMetadata(baseline.metadata)) ===
      JSON.stringify(stripSixFactorMetadata(candidate.metadata)),
    `${candidate.path} metadata must differ only by six-factor metadata`,
  );
  assert(
    candidate.learnerFacing.technicalTestResponseFormat === "mcq" &&
      candidate.learnerFacing.testResponseFormat === "mcq",
    `${candidate.path} technical test response_format must stay mcq`,
  );
  assert(
    candidate.learnerFacing.promptInstructionsApplied === false &&
      candidate.learnerFacing.appliedToLearnerFacingOutput === false,
    `${candidate.path} must not apply six-factor render instructions`,
  );
}

function assertPathHasNoSixFactorShadow(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  assert(
    !("sixFactorShadow" in payload.metadata),
    `${payload.path} must omit sixFactorShadow when shadow flag is off`,
  );
  assert(
    !("sixFactorDeliveredConfig" in payload.metadata),
    `${payload.path} must omit sixFactorDeliveredConfig when shadow flag is off`,
  );
}

function assertPathHasSixFactorShadow(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  assert(
    "sixFactorShadow" in payload.metadata,
    `${payload.path} must include sixFactorShadow when shadow flag is on`,
  );
  const shadow = payload.metadata.sixFactorShadow;
  assert(
    shadow != null && typeof shadow === "object",
    `${payload.path} sixFactorShadow must be an object`,
  );
  return shadow as NonNullable<typeof payload.metadata.sixFactorShadow>;
}

function assertPathHasDeliveredConfigMetadata(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  assert(
    "sixFactorDeliveredConfig" in payload.metadata,
    `${payload.path} must include canonical delivered_config metadata`,
  );
  const delivered = payload.metadata.sixFactorDeliveredConfig;
  assert(
    delivered != null && typeof delivered === "object",
    `${payload.path} delivered_config metadata must be an object`,
  );
  const root = delivered as Record<string, unknown>;
  assertSixMlFactors(root.candidateConfig as Record<string, unknown>);
  assertSixMlFactors(root.deliveredConfig as Record<string, unknown>);
  assert(
    (root.leakageGuard as Record<string, unknown> | undefined)
      ?.usesOnlyPreDecisionData === true,
    `${payload.path} delivered_config metadata must preserve leakage guard`,
  );
  return root;
}

function assertPromptHasSixFactorInstructions(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  const prompt = payload.learnerFacing.prompt;
  for (const label of [
    "difficulty:",
    "depth:",
    "support_level:",
    "presentation_format:",
    "examples_level:",
    "terminology_level:",
  ]) {
    assert(
      prompt.includes(label),
      `${payload.path} applied prompt must include ${label}`,
    );
  }
  assert(
    payload.learnerFacing.promptInstructionsApplied === true,
    `${payload.path} must mark prompt instructions as applied`,
  );
}

function assertPromptOmitsSixFactorInstructions(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
) {
  assert(
    !payload.learnerFacing.prompt.includes("Six-factor render instructions"),
    `${payload.path} must not include six-factor prompt instructions`,
  );
}

function assertAppliedPathMetadata(
  payload: ReturnType<typeof buildContentPathRegressionPayload>,
  appliedPath: SixFactorApplyPathV1,
) {
  const shadow = assertPathHasSixFactorShadow(payload);
  assert(
    shadow.appliedToLearnerFacingOutput === true,
    `${payload.path} metadata must mark learner-facing application`,
  );
  assert(
    shadow.appliedPromptInstructionCount === 6,
    `${payload.path} metadata must include applied instruction count`,
  );
  assert(
    shadow.appliedPath === appliedPath,
    `${payload.path} metadata must include applied ${appliedPath} path`,
  );
  assertPromptHasSixFactorInstructions(payload);
  return shadow;
}

function runContentPathRegressionChecks() {
  const paths: ContentPathRegressionName[] = [
    "chat_route_event_meta",
    "test_generation_validation_meta",
    "learning_content_signals_json",
  ];
  const envOff = {
    EDUAI_SIX_FACTOR_SHADOW: "0",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
  };
  const envShadowOnly = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
  };
  const envMlValid = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "ml/examples/candidate_scorer_artifact.example.json",
  };
  const envMlInvalid = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "/tmp/eduai-missing-six-factor-artifact.json",
  };
  const envApplyFallback = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
    EDUAI_SIX_FACTOR_APPLY: "1",
  };
  const envApplyMlValid = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "ml/examples/candidate_scorer_artifact.example.json",
  };
  const envApplyMlInvalid = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "/tmp/eduai-missing-six-factor-artifact.json",
  };

  for (const path of paths) {
    const appliedPath = applyPathForRegression(path);
    const offPayload = buildContentPathRegressionPayload({
      path,
      env: envOff,
    });
    const shadowOnlyPayload = buildContentPathRegressionPayload({
      path,
      env: envShadowOnly,
    });
    const mlPayload = buildContentPathRegressionPayload({
      path,
      env: envMlValid,
    });
    const invalidArtifactPayload = buildContentPathRegressionPayload({
      path,
      env: envMlInvalid,
    });
    const applyFallbackPayload = buildContentPathRegressionPayload({
      path,
      env: envApplyFallback,
    });
    const applyMlPayload = buildContentPathRegressionPayload({
      path,
      env: envApplyMlValid,
    });
    const applyInvalidArtifactPayload = buildContentPathRegressionPayload({
      path,
      env: envApplyMlInvalid,
    });

    assertPathHasNoSixFactorShadow(offPayload);
    const shadowOnly = assertPathHasSixFactorShadow(shadowOnlyPayload);
    const mlShadow = assertPathHasSixFactorShadow(mlPayload);
    const invalidArtifactShadow =
      assertPathHasSixFactorShadow(invalidArtifactPayload);
    const shadowOnlyDelivered =
      assertPathHasDeliveredConfigMetadata(shadowOnlyPayload);
    const mlDelivered = assertPathHasDeliveredConfigMetadata(mlPayload);
    const invalidArtifactDelivered =
      assertPathHasDeliveredConfigMetadata(invalidArtifactPayload);

    assertLearnerFacingUnchanged(offPayload, shadowOnlyPayload);
    assertLearnerFacingUnchanged(offPayload, mlPayload);
    assertLearnerFacingUnchanged(offPayload, invalidArtifactPayload);
    assertPromptOmitsSixFactorInstructions(offPayload);
    assertPromptOmitsSixFactorInstructions(shadowOnlyPayload);
    assertPromptOmitsSixFactorInstructions(mlPayload);
    assertPromptOmitsSixFactorInstructions(invalidArtifactPayload);

    assert(
      shadowOnly.decisionSource === "heuristic_baseline" ||
        shadowOnly.decisionSource === "static_fallback",
      `${path} shadow-only metadata must use fallback/heuristic decision`,
    );
    assertSixMlFactors(shadowOnly.candidateConfig);
    assertSixMlFactors(shadowOnly.deliveredConfig);
    assert(
      shadowOnly.appliedToLearnerFacingOutput === false,
      `${path} shadow-only metadata must remain unapplied`,
    );
    assert(
      shadowOnlyDelivered.appliedToLearnerFacingOutput === false,
      `${path} shadow-only delivered_config metadata must remain unapplied`,
    );

    assert(
      mlShadow.decisionSource === "ml_policy",
      `${path} shadow+ML metadata must use ml_policy decision source`,
    );
    assert(mlShadow.fallbackUsed === false, `${path} ML metadata must not fallback`);
    assert(
      typeof mlShadow.candidateCount === "number" && mlShadow.candidateCount > 0,
      `${path} ML metadata must include candidateCount`,
    );
    assert(
      typeof mlShadow.modelVersion === "string" &&
        mlShadow.modelVersion.length > 0,
      `${path} ML metadata must include modelVersion`,
    );
    assertSixMlFactors(mlShadow.candidateConfig);
    assertSixMlFactors(mlShadow.deliveredConfig);
    assert(
      mlShadow.appliedToLearnerFacingOutput === false,
      `${path} ML metadata must remain unapplied`,
    );
    assert(
      mlDelivered.decisionSource === "ml_policy",
      `${path} ML delivered_config metadata must preserve ml_policy source`,
    );

    assert(
      invalidArtifactShadow.fallbackUsed === true,
      `${path} invalid artifact metadata must fallback`,
    );
    assert(
      invalidArtifactShadow.warnings.some((warning: string) =>
        warning.includes("artifact_error"),
      ),
      `${path} invalid artifact metadata must include artifact error warning`,
    );
    assertSixMlFactors(invalidArtifactShadow.candidateConfig);
    assertSixMlFactors(invalidArtifactShadow.deliveredConfig);
    assert(
      invalidArtifactShadow.appliedToLearnerFacingOutput === false,
      `${path} invalid artifact metadata must remain unapplied`,
    );
    assert(
      invalidArtifactDelivered.fallbackUsed === true,
      `${path} invalid artifact delivered_config metadata must mark fallback`,
    );

    const applyFallbackShadow = assertAppliedPathMetadata(
      applyFallbackPayload,
      appliedPath,
    );
    assert(
      applyFallbackShadow.decisionSource === "heuristic_baseline" ||
        applyFallbackShadow.decisionSource === "static_fallback",
      `${path} apply ML-off metadata must use fallback/heuristic decision`,
    );
    assert(
      assertPathHasDeliveredConfigMetadata(applyFallbackPayload)
        .appliedToLearnerFacingOutput === true,
      `${path} apply ML-off delivered_config metadata must be applied`,
    );

    const applyMlShadow = assertAppliedPathMetadata(applyMlPayload, appliedPath);
    assert(
      applyMlShadow.decisionSource === "ml_policy",
      `${path} apply ML-on metadata must use ml_policy decision source`,
    );
    assert(
      applyMlShadow.fallbackUsed === false,
      `${path} apply ML-on metadata must not fallback`,
    );
    assert(
      typeof applyMlShadow.modelVersion === "string" &&
        applyMlShadow.modelVersion.length > 0,
      `${path} apply ML-on metadata must include modelVersion`,
    );
    assert(
      assertPathHasDeliveredConfigMetadata(applyMlPayload).decisionSource ===
        "ml_policy",
      `${path} apply ML-on delivered_config metadata must preserve ml source`,
    );

    const applyInvalidArtifactShadow = assertAppliedPathMetadata(
      applyInvalidArtifactPayload,
      appliedPath,
    );
    assert(
      applyInvalidArtifactShadow.fallbackUsed === true,
      `${path} apply invalid artifact metadata must fallback`,
    );
    assert(
      applyInvalidArtifactShadow.warnings.some((warning: string) =>
        warning.includes("artifact_error"),
      ),
      `${path} apply invalid artifact metadata must include artifact error warning`,
    );
    assert(
      assertPathHasDeliveredConfigMetadata(applyInvalidArtifactPayload)
        .fallbackUsed === true,
      `${path} apply invalid artifact delivered_config must mark fallback`,
    );
  }
}

export function runMlSixFactorShadowSelfCheck() {
  const staticFallback = createStaticSixFactorFallback();
  assert(
    validateSixFactorDecision(staticFallback),
    "static fallback must be a valid six-factor decision",
  );

  assert(
    !validateSixFactorDecision({
      ...staticFallback,
      terminologyLevel: "invalid",
    }),
    "invalid factor value must be rejected",
  );

  const heuristic = createHeuristicSixFactorFallbackFromTwoFactor({
    currentDifficulty: "hard",
    currentDepth: "detailed",
    recentCorrectRate: 0.3,
  });
  assert(heuristic.difficulty === "hard", "heuristic must preserve difficulty");
  assert(heuristic.depth === "detailed", "heuristic must preserve depth");
  assert(
    validateSixFactorDecision(heuristic),
    "heuristic fallback must be a valid six-factor decision",
  );

  const features = buildEduAIAppPolicyFeaturesV1({
    userRef: "user_1",
    subjectId: "subject_1",
    topicId: "topic_id",
    conceptKey: "concept_1",
    skillKey: "skill_1",
    familyKey: "family_1",
    topic: "Topic text",
    timeSinceLastAttemptSec: 180,
    declaredPreferences: {
      difficulty_target: "easy",
      depth: "brief",
      response_format: "mcq",
    },
    postScore: 1,
    nextStepSuccess: true,
    normalizedLearningGain: 1,
  });
  const serializedFeatures = JSON.stringify(features);
  assert(
    !serializedFeatures.includes("postScore") &&
      !serializedFeatures.includes("nextStepSuccess") &&
      !serializedFeatures.includes("normalizedLearningGain"),
    "feature builder must not include outcome fields",
  );
  assert(
    features.minutesSinceLastActivity === 3,
    "feature builder must transform seconds into minutes",
  );
  assert(
    features.topicRef === "topic_id",
    "topicRef must prefer explicit topic id",
  );

  const conceptFallback = buildEduAIAppPolicyFeaturesV1({
    userRef: "user_1",
    conceptKey: "concept_1",
    skillKey: "skill_1",
    familyKey: "family_1",
    topic: "Topic text",
  });
  assert(
    conceptFallback.topicRef === "concept_1",
    "topicRef must fall back to concept key",
  );

  const renderPolicy = mapSixFactorDecisionToRenderPolicy({
    ...heuristic,
    presentationFormat: "qa",
  });
  assert(
    Object.keys(renderPolicy.sixFactorPromptInstructions).length === 6,
    "render mapping must return instructions for all six factors",
  );
  assert(
    renderPolicy.technicalTestResponseFormat === "mcq" &&
      renderPolicy.legacyDelivery.response_format === "mcq",
    "presentation_format must not alter technical test response_format",
  );

  assert(
    !isSixFactorShadowEnabled({}),
    "six-factor shadow adapter must be disabled by default",
  );
  assert(
    !isSixFactorShadowEnabled({ EDUAI_SIX_FACTOR_SHADOW: "0" }),
    "six-factor shadow adapter must stay disabled when flag is 0",
  );
  assert(
    !isSixFactorApplyEnabled({}),
    "six-factor apply mode must be disabled by default",
  );
  assert(
    !shouldApplySixFactorRenderPolicy({
      env: { EDUAI_SIX_FACTOR_APPLY: "1" },
      path: "learning_content",
    }),
    "six-factor apply mode must require shadow mode",
  );
  assert(
    shouldApplySixFactorRenderPolicy({
      env: {
        EDUAI_SIX_FACTOR_SHADOW: "1",
        EDUAI_SIX_FACTOR_APPLY: "1",
      },
      path: "learning_content",
    }),
    "six-factor apply mode must enable only with shadow and apply flags",
  );
  assert(
    shouldApplySixFactorRenderPolicy({
      env: {
        EDUAI_SIX_FACTOR_SHADOW: "1",
        EDUAI_SIX_FACTOR_APPLY: "1",
      },
      path: "chat",
    }) &&
      shouldApplySixFactorRenderPolicy({
        env: {
          EDUAI_SIX_FACTOR_SHADOW: "1",
          EDUAI_SIX_FACTOR_APPLY: "1",
        },
        path: "test_generation",
      }),
    "six-factor apply mode must support chat and test_generation paths",
  );

  const shadowContext = {
    userRef: "user_1",
    subjectRef: "subject_1",
    topicId: "topic_1",
    previousDifficulty: "medium",
    previousDepth: "standard",
    recentCorrectRate: 0.6,
  };
  const flagOffMissing = buildOptionalSixFactorShadowMetadata(shadowContext, {});
  const flagOffZero = buildOptionalSixFactorShadowMetadata(shadowContext, {
    EDUAI_SIX_FACTOR_SHADOW: "0",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
  });
  assert(flagOffMissing === null, "flag-off missing env must return null metadata");
  assert(flagOffZero === null, "flag-off zero env must return null metadata");

  const flagOffPayload = buildLoggedPayload({
    sixFactorShadow: flagOffZero,
    promptInstructionsApplied: false,
  });
  assert(
    !("sixFactorShadow" in flagOffPayload),
    "flag-off payload must not contain sixFactorShadow",
  );
  assert(
    flagOffPayload.prompt === "Existing learner-facing prompt" &&
      flagOffPayload.output === "Existing learner-facing output",
    "flag-off prompt/output path must be unchanged",
  );
  assert(
    flagOffPayload.technicalTestResponseFormat === "mcq",
    "flag-off technical test response_format must stay mcq",
  );
  assert(
    flagOffPayload.promptInstructionsApplied === false,
    "flag-off prompt instructions must not be applied",
  );

  assert(
    isSixFactorShadowEnabled({ EDUAI_SIX_FACTOR_SHADOW: "1" }),
    "six-factor shadow adapter must be enabled when flag is 1",
  );
  assert(
    !isSixFactorMlPolicyEnabled({ EDUAI_SIX_FACTOR_ML_POLICY: "0" }),
    "six-factor ML policy must stay disabled when flag is 0",
  );

  const shadow = buildShadowSixFactorDecision(shadowContext, {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
  });
  assert(shadow.shadowMode === true, "shadow result must be marked shadow");
  assert(
    shadow.appliedToLearnerFacingOutput === false,
    "shadow result must not claim learner-facing application",
  );
  const flagOnMetadata = buildOptionalSixFactorShadowMetadata(shadowContext, {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "0",
  });
  assert(flagOnMetadata != null, "flag-on must return six-factor metadata");
  assert(
    flagOnMetadata.decisionSource === "heuristic_baseline" ||
      flagOnMetadata.decisionSource === "static_fallback",
    "flag-on ML-off metadata must use fallback or bridge decision source",
  );
  assertSixMlFactors(flagOnMetadata.candidateConfig);
  assertSixMlFactors(flagOnMetadata.deliveredConfig);

  const flagOnPayload = buildLoggedPayload({
    sixFactorShadow: flagOnMetadata,
    promptInstructionsApplied: false,
  });
  assert(
    "sixFactorShadow" in flagOnPayload,
    "flag-on payload must contain sixFactorShadow metadata",
  );
  assert(
    flagOnPayload.prompt === "Existing learner-facing prompt" &&
      flagOnPayload.output === "Existing learner-facing output",
    "flag-on must add metadata only and keep prompt/output unchanged",
  );
  assert(
    flagOnPayload.technicalTestResponseFormat === "mcq",
    "flag-on technical test response_format must stay mcq",
  );
  assert(
    flagOnPayload.promptInstructionsApplied === false,
    "flag-on must not apply prompt instructions",
  );
  assert(
    shadow.appliedToLearnerFacingOutput === false,
    "flag-on shadow result must still not be applied to learner-facing output",
  );
  assert(
    flagOnMetadata.appliedToLearnerFacingOutput === false,
    "flag-on metadata must explicitly remain unapplied",
  );

  const candidateFeatures = buildEduAIAppPolicyFeaturesV1(shadowContext);
  const candidateSetA = generateSixFactorCandidateSet({
    features: candidateFeatures,
    maxCandidates: 30,
  });
  const candidateSetB = generateSixFactorCandidateSet({
    features: candidateFeatures,
    maxCandidates: 30,
  });
  assert(
    JSON.stringify(candidateSetA) === JSON.stringify(candidateSetB),
    "candidate generation must be deterministic",
  );
  assert(
    !hasDuplicateSixFactorCandidates(candidateSetA),
    "candidate generation must not include duplicates",
  );
  assert(
    candidateSetA.every(validateSixFactorCandidateConfig),
    "candidate generation must produce valid six-factor configs",
  );
  const unknownFeatures = buildEduAIAppPolicyFeaturesV1({
    userRef: "unknown_user",
    subjectRef: "subject_1",
    topicRef: "topic_1",
  });
  const unsafeCandidate = {
    difficulty: "hard",
    depth: "brief",
    supportLevel: "minimal",
    presentationFormat: "paragraph",
    examplesLevel: "none",
    terminologyLevel: "technical",
  } as const;
  assert(
    !isSafeSixFactorCandidateForLearnerState(unknownFeatures, unsafeCandidate),
    "guardrails must reject hard/brief/minimal/none/technical for unknown learner state",
  );
  assert(
    unsafeSixFactorCandidateReasons(unknownFeatures, unsafeCandidate).includes(
      "weak_state_blocks_hard_brief_minimal",
    ),
    "guardrails must explain hard/brief/minimal rejection",
  );
  const filteredUnknown = filterUnsafeSixFactorCandidates(unknownFeatures, [
    unsafeCandidate,
  ]);
  assert(
    filteredUnknown.fallbackUsed === true &&
      filteredUnknown.candidates[0].supportLevel === "guided" &&
      filteredUnknown.candidates[0].examplesLevel === "single",
    "guardrails must provide safe fallback when all candidates are unsafe",
  );
  const weakFeatures = buildEduAIAppPolicyFeaturesV1({
    userRef: "weak_user",
    subjectRef: "subject_1",
    topicRef: "topic_1",
    priorAttemptsCount: 4,
    priorCorrectRate: 0.25,
    recentAttemptsCount: 3,
    recentCorrectRate: 0.2,
    topicSeenCount: 1,
  });
  assert(
    !isSafeSixFactorCandidateForLearnerState(weakFeatures, {
      ...unsafeCandidate,
      difficulty: "medium",
      terminologyLevel: "balanced",
    }),
    "guardrails must require at least guided support and one example for weak state",
  );
  const masteredFeatures = buildEduAIAppPolicyFeaturesV1({
    userRef: "strong_user",
    subjectRef: "subject_1",
    topicRef: "topic_1",
    priorAttemptsCount: 10,
    priorCorrectRate: 0.9,
    recentAttemptsCount: 4,
    recentCorrectRate: 0.85,
    topicSeenCount: 4,
  });
  assert(
    isSafeSixFactorCandidateForLearnerState(masteredFeatures, {
      ...unsafeCandidate,
      depth: "standard",
      supportLevel: "guided",
    }),
    "guardrails may allow none examples and technical terminology only with strong mastered history",
  );

  const mlFlagEnv = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "ml/examples/candidate_scorer_artifact.example.json",
  };
  assert(
    isSixFactorMlPolicyEnabled(mlFlagEnv),
    "six-factor ML policy must be enabled when flag is 1",
  );
  const mlDecision = resolveSixFactorPolicyDecision(shadowContext, {
    env: mlFlagEnv,
  });
  assert(
    mlDecision.decisionSource === "ml_policy",
    "valid artifact mode must return ml_policy decision source",
  );
  assert(
    validateSixFactorDecision(mlDecision),
    "valid artifact mode must return a valid six-factor decision",
  );
  assert(
    mlDecision.candidateCount != null && mlDecision.candidateCount > 0,
    "valid artifact mode must score at least one candidate",
  );
  assert(
    mlDecision.modelVersion != null && mlDecision.modelVersion.length > 0,
    "valid artifact mode must expose modelVersion",
  );
  assert(
    mlDecision.fallbackUsed === false,
    "valid artifact mode must not mark fallbackUsed",
  );

  const nonFiniteScoreDecision = resolveSixFactorPolicyDecisionForFeatures(
    {
      ...buildEduAIAppPolicyFeaturesV1(shadowContext),
      priorCorrectRate: Number.NaN,
    },
    { env: mlFlagEnv },
  );
  assert(
    nonFiniteScoreDecision.fallbackUsed === true,
    "non-finite scorer output must fall back safely",
  );
  assert(
    nonFiniteScoreDecision.warnings.some((warning) =>
      warning.includes("scoring_error"),
    ),
    "non-finite scorer fallback must include scoring_error warning",
  );

  const mlMetadata = buildOptionalSixFactorShadowMetadata(shadowContext, mlFlagEnv);
  assert(mlMetadata != null, "ML policy shadow mode must return metadata");
  assert(
    mlMetadata.decisionSource === "ml_policy",
    "ML policy shadow metadata must preserve ml_policy decision source",
  );
  assertSixMlFactors(mlMetadata.candidateConfig);
  assertSixMlFactors(mlMetadata.deliveredConfig);
  assert(
    mlMetadata.appliedToLearnerFacingOutput === false,
    "ML policy shadow metadata must remain unapplied to learner-facing output",
  );
  const serializedFeatureSnapshot = JSON.stringify(mlMetadata.featuresSnapshot);
  assert(
    !serializedFeatureSnapshot.includes("postScore") &&
      !serializedFeatureSnapshot.includes("nextStepSuccess") &&
      !serializedFeatureSnapshot.includes("normalizedLearningGain"),
    "metadata feature snapshot must not include outcome fields",
  );

  const invalidArtifactEnv = {
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    [SIX_FACTOR_ARTIFACT_PATH_ENV]:
      "/tmp/eduai-missing-six-factor-artifact.json",
  };
  const invalidArtifactMetadata = buildOptionalSixFactorShadowMetadata(
    shadowContext,
    invalidArtifactEnv,
  );
  assert(
    invalidArtifactMetadata != null,
    "invalid artifact mode must still return fallback metadata",
  );
  assert(
    invalidArtifactMetadata.fallbackUsed === true,
    "invalid artifact mode must mark fallbackUsed",
  );
  assert(
    invalidArtifactMetadata.decisionSource === "heuristic_baseline" ||
      invalidArtifactMetadata.decisionSource === "static_fallback",
    "invalid artifact mode must fall back to heuristic/static decision source",
  );
  assert(
    invalidArtifactMetadata.warnings.some((warning) =>
      warning.includes("artifact_error"),
    ),
    "invalid artifact mode must include artifact error warning",
  );
  assertSixMlFactors(invalidArtifactMetadata.candidateConfig);
  assertSixMlFactors(invalidArtifactMetadata.deliveredConfig);
  assert(
    invalidArtifactMetadata.appliedToLearnerFacingOutput === false,
    "invalid artifact fallback metadata must remain unapplied",
  );

  const metadata = buildSixFactorDecisionMetadata(heuristic, features);
  assertSixMlFactors(metadata.candidateConfig);
  assertSixMlFactors(metadata.deliveredConfig);
  assert(
    JSON.stringify(metadata.candidateConfig) ===
      JSON.stringify(toMlSixFactorConfig(heuristic)),
    "metadata candidateConfig must come from decision factors",
  );

  const deliveredMetadata = buildSixFactorDeliveredConfigMetadata({
    sixFactorShadow: metadata,
    decisionCreatedAt: "2026-05-08T10:00:00.000Z",
    featuresCutoffAt: "2026-05-08T10:00:00.000Z",
    appliedPath: "learning_content",
  });
  assertSixMlFactors(deliveredMetadata.candidateConfig);
  assertSixMlFactors(deliveredMetadata.deliveredConfig);
  assert(
    deliveredMetadata.appliedToLearnerFacingOutput === false,
    "canonical delivered_config metadata must preserve applied=false",
  );
  assert(
    deliveredMetadata.leakageGuard.usesOnlyPreDecisionData === true,
    "canonical delivered_config metadata must preserve leakage guard",
  );

  const clampedGain = computeNormalizedLearningGain({
    preScore: 0.9,
    postScore: 1.4,
    maxScore: 1,
  });
  assert(
    clampedGain === 1,
    "normalized_learning_gain must be clamped to 0..1",
  );
  const missingOutcome = buildMissingSixFactorOutcome();
  assert(
    missingOutcome.outcome_available === false,
    "missing outcome must set outcome_available=false",
  );
  const outcome = buildSixFactorOutcome({
    preScore: 0.4,
    postScore: 0.8,
    maxScore: 1,
    nextStepSuccess: true,
    outcomeAvailable: true,
  });
  assert(
    outcome.normalized_learning_gain != null &&
      outcome.normalized_learning_gain > 0 &&
      outcome.normalized_learning_gain <= 1,
    "available outcome must compute safe normalized_learning_gain",
  );
  const outcomeLink = buildSixFactorOutcomeLink({
    contentEventRef: "content_1",
    testEventRef: "test_1",
    userRef: "user_1",
    subjectRef: "subject_1",
    topicRef: "topic_1",
    sessionRef: "episode_1",
    decisionCreatedAt: deliveredMetadata.decisionCreatedAt,
    outcomeObservedAt: "2026-05-08T10:06:00.000Z",
    outcome,
  });
  const observation = buildTrainingObservationV1FromAppRecord({
    deliveredMetadata,
    outcomeLink,
  });
  assert(
    isTrainingObservationV1Shape(observation),
    "real_user observation must satisfy local training_observation shape",
  );
  const serializedPreDecision = JSON.stringify(
    observation.pre_decision_features,
  );
  assert(
    !serializedPreDecision.includes("post_score") &&
      !serializedPreDecision.includes("next_step_success") &&
      !serializedPreDecision.includes("normalized_learning_gain"),
    "real_user observation pre_decision_features must exclude outcome fields",
  );
  assert(
    observation.policy_context.backend_kind === deliveredMetadata.backendKind &&
      observation.policy_context.model_version === deliveredMetadata.modelVersion &&
      observation.policy_context.fallback_used === deliveredMetadata.fallbackUsed,
    "real_user observation must preserve policy_context",
  );
  assert(
    observation.leakage_guard.uses_only_pre_decision_data === true,
    "real_user observation leakage_guard must require pre-decision features",
  );

  const mockExport = buildMockRealUserTrainingObservationExport();
  assert(
    mockExport.summary.exportedObservations === 1 &&
      mockExport.summary.withOutcome === 1,
    "mock real_user export summary must count exported outcome rows",
  );
  const malformedSummary = summarizeRealUserTrainingObservations([], {
    totalScanned: 1,
    skipped: 1,
    skipReasons: { malformed_six_factor_metadata: 1 },
    sourcePaths: [],
  });
  assert(
    malformedSummary.skipReasons.malformed_six_factor_metadata === 1,
    "export summary must preserve malformed metadata skip reason",
  );

  runContentPathRegressionChecks();

  return {
    ok: true,
    checks: [
      "six-factor decision validation",
      "static fallback",
      "heuristic two-factor bridge",
      "feature leakage guard",
      "seconds to minutes transform",
      "topicRef priority",
      "render mapping coverage",
      "test response_format unchanged",
      "shadow disabled by default",
      "apply disabled by default",
      "apply requires shadow mode",
      "apply enables only with shadow and apply flags",
      "flag-off missing env returns null metadata",
      "flag-off zero env returns null metadata",
      "flag-off payload omits sixFactorShadow",
      "flag-off prompt/output unchanged",
      "flag-on metadata added only",
      "flag-on candidate/delivered config has six factors",
      "flag-on prompt/output unchanged",
      "flag-on technical response_format unchanged",
      "flag-on ML-off decision source is fallback/heuristic",
      "shadow result not applied",
      "candidate generation deterministic",
      "candidate generation no duplicates",
      "candidate generation valid configs",
      "guardrails reject unsafe unknown-state candidates",
      "guardrails explain unsafe candidate reasons",
      "guardrails provide safe fallback when all candidates are unsafe",
      "guardrails require guided support and examples for weak state",
      "guardrails allow advanced config only with mastered history",
      "flag-on ML-on valid artifact returns ml_policy",
      "flag-on ML-on valid artifact has modelVersion and candidateCount",
      "non-finite ML scorer output falls back with warning",
      "flag-on ML-on metadata remains unapplied",
      "metadata feature snapshot excludes outcome fields",
      "flag-on ML-on invalid artifact falls back with warning",
      "metadata candidate/delivered config",
      "content paths omit sixFactorShadow when shadow flag is off",
      "content paths add fallback metadata only when shadow is on and ML is off",
      "content paths add ml_policy metadata when shadow and ML are on",
      "content paths fall back with warning when artifact is invalid",
      "content path prompt/output/content unchanged across shadow modes",
      "content path technical response_format unchanged across shadow modes",
      "apply mode adds six-factor prompt instructions to chat, test, and learning content paths",
      "apply mode marks metadata as applied on chat, test, and learning content paths",
      "apply mode can use ml_policy artifact decision",
      "apply mode falls back on invalid artifact",
      "canonical delivered_config metadata has six factors",
      "canonical delivered_config metadata preserves applied flag",
      "outcome linking computes clamped normalized_learning_gain",
      "missing outcome marks outcome_available=false",
      "real_user training observation excludes outcome fields from features",
      "real_user training observation preserves policy_context",
      "real_user training observation leakage guard",
      "mock real_user export summary counts outcomes",
      "export summary preserves malformed metadata skip reason",
    ],
  };
}
