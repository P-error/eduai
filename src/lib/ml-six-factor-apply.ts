import {
  buildEduAIAppPolicyFeaturesV1,
  type BuildEduAIAppPolicyFeaturesInput,
} from "@/lib/ml-six-factor-feature-builder";
import {
  normalizeSixFactorDecision,
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";
import {
  buildSixFactorPedagogicalPromptProfile,
  buildSixFactorPromptInstructions,
  mapSixFactorDecisionToRenderPolicy,
  type SixFactorPedagogicalPromptProfileV1,
} from "@/lib/ml-six-factor-render-mapping";
import {
  buildSixFactorDecisionMetadata,
  buildShadowSixFactorDecision,
  isSixFactorShadowEnabled,
  type SixFactorDecisionMetadataV1,
  type SixFactorShadowResultV1,
} from "@/lib/ml-six-factor-shadow";

export const SIX_FACTOR_APPLY_ENV = "EDUAI_SIX_FACTOR_APPLY" as const;
export const SIX_FACTOR_SHADOW_ONLY_ENV = "EDUAI_SIX_FACTOR_SHADOW_ONLY" as const;

export type SixFactorApplyPathV1 =
  | "chat"
  | "learning_content"
  | "test_generation";

export type BuildAppliedSixFactorPromptInstructionsResult =
  | {
      applied: true;
      appliedPath: SixFactorApplyPathV1;
      shadow: SixFactorShadowResultV1;
      metadata: SixFactorDecisionMetadataV1;
      promptInstructions: string[];
      promptInstructionBlock: string;
      warnings: string[];
    }
  | {
      applied: false;
      appliedPath: SixFactorApplyPathV1;
      shadow: null;
      metadata: null;
      promptInstructions: [];
      promptInstructionBlock: null;
      warnings: string[];
    };

function enabledValue(value: unknown) {
  return (
    typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}

function disabledValue(value: unknown) {
  return (
    typeof value === "string" &&
    ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
  );
}

export function isSixFactorApplyEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return !disabledValue(env[SIX_FACTOR_APPLY_ENV]);
}

export function isSixFactorShadowOnlyEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return enabledValue(env[SIX_FACTOR_SHADOW_ONLY_ENV]);
}

export function shouldApplySixFactorRenderPolicy(params: {
  env?: Record<string, string | undefined>;
  path?: SixFactorApplyPathV1;
} = {}) {
  const env = params.env ?? process.env;
  return (
    isSixFactorShadowEnabled(env) &&
    isSixFactorApplyEnabled(env) &&
    !isSixFactorShadowOnlyEnabled(env)
  );
}

function formatInstructionLines(
  shadow: SixFactorShadowResultV1,
  path: SixFactorApplyPathV1,
  profile: SixFactorPedagogicalPromptProfileV1,
) {
  const deliveredConfig = shadow.metadata.deliveredConfig;
  const guidance = profile.factorGuidance;

  return [
    `Selected six-factor pedagogical profile for ${path}:`,
    `delivered_config: difficulty=${deliveredConfig.difficulty}; depth=${deliveredConfig.depth}; support_level=${deliveredConfig.support_level}; presentation_format=${deliveredConfig.presentation_format}; examples_level=${deliveredConfig.examples_level}; terminology_level=${deliveredConfig.terminology_level}.`,
    `Profile summary: ${profile.profileSummary}`,
    "Factor guidance:",
    `- difficulty: ${guidance.difficulty.value} - ${guidance.difficulty.instruction}`,
    `- depth: ${guidance.depth.value} - ${guidance.depth.instruction}`,
    `- support_level: ${guidance.supportLevel.value} - ${guidance.supportLevel.instruction}`,
    `- presentation_format: ${guidance.presentationFormat.value} - ${guidance.presentationFormat.instruction}`,
    `- examples_level: ${guidance.examplesLevel.value} - ${guidance.examplesLevel.instruction}`,
    `- terminology_level: ${guidance.terminologyLevel.value} - ${guidance.terminologyLevel.instruction}`,
    "Path-specific output constraints:",
    ...profile.pathSpecificRequirements.map((requirement) => `- ${requirement}`),
    "Safety and precedence:",
    ...profile.safetyAndPrecedence.map((requirement) => `- ${requirement}`),
  ];
}

function buildShadowFromDecisionOverride(params: {
  context: BuildEduAIAppPolicyFeaturesInput;
  decision: EduAIAppSixFactorDecisionV1;
}): SixFactorShadowResultV1 {
  const features = buildEduAIAppPolicyFeaturesV1(params.context);
  const decision = normalizeSixFactorDecision(params.decision);
  const renderPolicy = mapSixFactorDecisionToRenderPolicy(decision);

  return {
    features,
    decision,
    renderPolicy,
    promptInstructions: buildSixFactorPromptInstructions(decision),
    metadata: {
      ...buildSixFactorDecisionMetadata(decision, features),
      warnings: [
        ...decision.warnings,
        "Six-factor decision reused from the episode/request primary decision.",
      ],
    },
    shadowMode: true,
    appliedToLearnerFacingOutput: false,
  };
}

export function buildAppliedSixFactorPromptInstructions(params: {
  context: BuildEduAIAppPolicyFeaturesInput;
  decisionOverride?: EduAIAppSixFactorDecisionV1 | null;
  env?: Record<string, string | undefined>;
  path: SixFactorApplyPathV1;
}): BuildAppliedSixFactorPromptInstructionsResult {
  const env = params.env ?? process.env;
  if (
    !shouldApplySixFactorRenderPolicy({
      env,
      path: params.path,
    })
  ) {
    return {
      applied: false,
      appliedPath: params.path,
      shadow: null,
      metadata: null,
      promptInstructions: [],
      promptInstructionBlock: null,
      warnings: isSixFactorShadowOnlyEnabled(env)
        ? [
            "ML metadata mode selects a candidate for logging only; learner-facing output is unchanged.",
          ]
        : isSixFactorApplyEnabled(env)
        ? [
            "Six-factor apply flag is enabled, but shadow mode is disabled; keeping learner-facing output unchanged.",
          ]
        : [],
    };
  }

  try {
    const shadow = params.decisionOverride
      ? buildShadowFromDecisionOverride({
          context: params.context,
          decision: params.decisionOverride,
        })
      : buildShadowSixFactorDecision(params.context, env);
    const pedagogicalProfile = buildSixFactorPedagogicalPromptProfile(
      shadow.decision,
      params.path,
    );
    const promptInstructions = formatInstructionLines(
      shadow,
      params.path,
      pedagogicalProfile,
    );
    const metadata = {
      ...shadow.metadata,
      appliedToLearnerFacingOutput: true,
      appliedPromptInstructionCount: 6,
      appliedPath: params.path,
      warnings: [
        ...shadow.metadata.warnings,
        "Six-factor render mapping applied under explicit EDUAI_SIX_FACTOR_APPLY flag.",
      ],
    } satisfies SixFactorDecisionMetadataV1;

    return {
      applied: true,
      appliedPath: params.path,
      shadow: {
        ...shadow,
        renderPolicy: {
          ...shadow.renderPolicy,
          pedagogicalProfile,
        },
        metadata,
        appliedToLearnerFacingOutput: true,
      },
      metadata,
      promptInstructions,
      promptInstructionBlock: promptInstructions.join("\n"),
      warnings: metadata.warnings,
    };
  } catch (error) {
    return {
      applied: false,
      appliedPath: params.path,
      shadow: null,
      metadata: null,
      promptInstructions: [],
      promptInstructionBlock: null,
      warnings: [
        `six_factor_apply_error: ${
          error instanceof Error ? error.message : "Unknown apply failure."
        }`,
      ],
    };
  }
}
