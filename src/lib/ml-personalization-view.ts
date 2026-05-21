import {
  isMlSixFactorConfig,
  readSixFactorDeliveredConfigMetadata,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import type { EduAISixFactorMlConfigV1 } from "@/lib/ml-six-factor-policy-contract";

export type PublicSixFactorConfigurationView = {
  difficulty: string | null;
  depth: string | null;
  supportLevel: string | null;
  presentationFormat: string | null;
  examplesLevel: string | null;
  terminologyLevel: string | null;
  decisionSource: string | null;
  fallbackUsed: boolean | null;
  appliedAsPrimary: boolean | null;
  compatibilityRole:
    | "six_factor_primary_configuration"
    | "derived_six_factor_projection"
    | "legacy_two_factor_bridge";
};

export type PublicSixFactorSelectedFactor = {
  key:
    | "difficulty"
    | "depth"
    | "supportLevel"
    | "presentationFormat"
    | "examplesLevel"
    | "terminologyLevel";
  value: string | null;
};

export type MlPersonalizationView = {
  kind: "six_factor_personalization_v1";
  selected_config: EduAISixFactorMlConfigV1;
  selectedFactors: PublicSixFactorSelectedFactor[];
  summary: string;
  profileLabel: string;
  isPrimary: boolean;
  compatibilityRole:
    | "six_factor_primary_configuration"
    | "derived_six_factor_projection"
    | "legacy_two_factor_bridge";
  compatibilityProjection: {
    difficulty: EduAISixFactorMlConfigV1["difficulty"];
    depth: EduAISixFactorMlConfigV1["depth"];
    compatibilityRole: "derived_two_factor_projection";
  };
  decisionSource: SixFactorDeliveredConfigMetadataV1["decisionSource"] | "fallback";
  fallbackUsed: boolean;
  artifactVersion: string | null;
  modelVersion: string | null;
  backendKind: string | null;
  candidateCount: number | null;
  fallbackReason: string | null;
  appliedAsPrimary: boolean;
  appliedToLearnerFacingOutput: boolean;
  appliedPromptInstructionCount: number | null;
  appliedPath: string | null;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildSelectedFactors(
  config: Partial<PublicSixFactorConfigurationView>,
): PublicSixFactorSelectedFactor[] {
  return [
    { key: "difficulty", value: config.difficulty ?? null },
    { key: "depth", value: config.depth ?? null },
    { key: "supportLevel", value: config.supportLevel ?? null },
    { key: "presentationFormat", value: config.presentationFormat ?? null },
    { key: "examplesLevel", value: config.examplesLevel ?? null },
    { key: "terminologyLevel", value: config.terminologyLevel ?? null },
  ];
}

function buildSummaryFromFactors(factors: PublicSixFactorSelectedFactor[]) {
  return factors.map((factor) => factor.value ?? "-").join(" / ");
}

function buildPublicConfigFromMetadata(
  metadata: SixFactorDeliveredConfigMetadataV1,
): PublicSixFactorConfigurationView {
  return {
    difficulty: metadata.deliveredConfig.difficulty,
    depth: metadata.deliveredConfig.depth,
    supportLevel: metadata.deliveredConfig.support_level,
    presentationFormat: metadata.deliveredConfig.presentation_format,
    examplesLevel: metadata.deliveredConfig.examples_level,
    terminologyLevel: metadata.deliveredConfig.terminology_level,
    decisionSource: metadata.decisionSource,
    fallbackUsed: metadata.fallbackUsed,
    appliedAsPrimary: metadata.appliedAsPrimary,
    compatibilityRole:
      metadata.decisionSource === "legacy_derived"
        ? "legacy_two_factor_bridge"
        : metadata.appliedAsPrimary
          ? "six_factor_primary_configuration"
          : "derived_six_factor_projection",
  };
}

function buildPublicConfigFromMlConfig(params: {
  config: EduAISixFactorMlConfigV1;
  decisionSource: string | null;
  fallbackUsed: boolean | null;
  appliedAsPrimary: boolean | null;
  compatibilityRole: PublicSixFactorConfigurationView["compatibilityRole"];
}): PublicSixFactorConfigurationView {
  return {
    difficulty: params.config.difficulty,
    depth: params.config.depth,
    supportLevel: params.config.support_level,
    presentationFormat: params.config.presentation_format,
    examplesLevel: params.config.examples_level,
    terminologyLevel: params.config.terminology_level,
    decisionSource: params.decisionSource,
    fallbackUsed: params.fallbackUsed,
    appliedAsPrimary: params.appliedAsPrimary,
    compatibilityRole: params.compatibilityRole,
  };
}

export function buildPublicSixFactorConfigurationView(params: {
  decisionRuntime?: unknown;
  pedagogicalDecision?: unknown;
}): PublicSixFactorConfigurationView | null {
  const metadata = readSixFactorDeliveredConfigMetadata(params.decisionRuntime);
  if (metadata && metadata.decisionSource !== "legacy_derived") {
    return buildPublicConfigFromMetadata(metadata);
  }

  const pedagogicalDecision = isRecord(params.pedagogicalDecision)
    ? params.pedagogicalDecision
    : null;
  const compatibilitySixFactorConfig = pedagogicalDecision?.sixFactorConfig;
  if (isMlSixFactorConfig(compatibilitySixFactorConfig) && pedagogicalDecision) {
    return buildPublicConfigFromMlConfig({
      config: compatibilitySixFactorConfig,
      decisionSource: readString(pedagogicalDecision.sixFactorDecisionSource),
      fallbackUsed:
        typeof pedagogicalDecision.sixFactorFallbackUsed === "boolean"
          ? pedagogicalDecision.sixFactorFallbackUsed
          : null,
      appliedAsPrimary: null,
      compatibilityRole: "derived_six_factor_projection",
    });
  }

  const difficulty = readString(pedagogicalDecision?.difficulty);
  const depth = readString(pedagogicalDecision?.depth);
  if (difficulty || depth) {
    return {
      difficulty,
      depth,
      supportLevel: null,
      presentationFormat: null,
      examplesLevel: null,
      terminologyLevel: null,
      decisionSource: "legacy_derived",
      fallbackUsed: true,
      appliedAsPrimary: false,
      compatibilityRole: "legacy_two_factor_bridge",
    };
  }

  if (metadata?.decisionSource === "legacy_derived") {
    return {
      difficulty: metadata.deliveredConfig.difficulty,
      depth: metadata.deliveredConfig.depth,
      supportLevel: null,
      presentationFormat: null,
      examplesLevel: null,
      terminologyLevel: null,
      decisionSource: "legacy_derived",
      fallbackUsed: true,
      appliedAsPrimary: false,
      compatibilityRole: "legacy_two_factor_bridge",
    };
  }

  return null;
}

function sanitizeWarningsForView(warnings: string[]) {
  const safe = warnings.map((warning) => {
    if (warning.includes("artifact_error")) {
      return "ML artifact unavailable; fallback is explicitly marked.";
    }
    if (warning.includes("synthetic")) {
      return "Artifact provenance may be synthetic/bootstrap; this is not proof of real educational effect.";
    }
    if (warning.includes("guardrails")) {
      return "Safety guardrails constrained the selected candidate.";
    }
    if (warning.includes("ML policy explicitly disabled")) {
      return "ML policy is disabled; fallback is explicitly marked.";
    }
    if (warning.includes("scoring_error")) {
      return "ML scoring failed; fallback is explicitly marked.";
    }
    if (warning.includes("render mapping applied")) {
      return "Six-factor render mapping was applied under the explicit apply flag.";
    }
    if (warning.includes("legacy_derived")) {
      return "Old difficulty/depth data was adapted for compatibility; this is not a new ML decision.";
    }
    return warning;
  });

  return [...new Set(safe)];
}

export function buildMlPersonalizationView(
  value: unknown,
): MlPersonalizationView | null {
  const metadata = readSixFactorDeliveredConfigMetadata(value);
  if (!metadata) return null;
  const selectedFactors = buildSelectedFactors(
    buildPublicConfigFromMetadata(metadata),
  );
  const isPrimary =
    metadata.appliedAsPrimary === true &&
    metadata.decisionSource !== "legacy_derived" &&
    metadata.decisionSource !== "shadow_only";

  return {
    kind: "six_factor_personalization_v1",
    selected_config: metadata.deliveredConfig,
    selectedFactors,
    summary: buildSummaryFromFactors(selectedFactors),
    profileLabel: "Six-factor pedagogical configuration",
    isPrimary,
    compatibilityRole:
      metadata.decisionSource === "legacy_derived"
        ? "legacy_two_factor_bridge"
        : isPrimary
          ? "six_factor_primary_configuration"
          : "derived_six_factor_projection",
    compatibilityProjection: {
      difficulty: metadata.deliveredConfig.difficulty,
      depth: metadata.deliveredConfig.depth,
      compatibilityRole: "derived_two_factor_projection",
    },
    decisionSource: metadata.decisionSource,
    fallbackUsed: metadata.fallbackUsed,
    artifactVersion: metadata.modelVersion,
    modelVersion: metadata.modelVersion,
    backendKind: metadata.backendKind,
    candidateCount: metadata.candidateCount,
    fallbackReason: metadata.fallbackReason,
    appliedAsPrimary: metadata.appliedAsPrimary,
    appliedToLearnerFacingOutput: metadata.appliedToLearnerFacingOutput,
    appliedPromptInstructionCount: metadata.appliedPromptInstructionCount,
    appliedPath: metadata.appliedPath,
    warnings: sanitizeWarningsForView(metadata.warnings),
  };
}
