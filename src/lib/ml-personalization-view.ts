import {
  readSixFactorDeliveredConfigMetadata,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import type { EduAISixFactorMlConfigV1 } from "@/lib/ml-six-factor-policy-contract";

export type MlPersonalizationView = {
  kind: "six_factor_personalization_v1";
  selected_config: EduAISixFactorMlConfigV1;
  decisionSource: SixFactorDeliveredConfigMetadataV1["decisionSource"] | "fallback";
  fallbackUsed: boolean;
  artifactVersion: string | null;
  modelVersion: string | null;
  backendKind: string | null;
  candidateCount: number | null;
  appliedToLearnerFacingOutput: boolean;
  appliedPromptInstructionCount: number | null;
  appliedPath: string | null;
  warnings: string[];
};

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

  return {
    kind: "six_factor_personalization_v1",
    selected_config: metadata.deliveredConfig,
    decisionSource: metadata.decisionSource,
    fallbackUsed: metadata.fallbackUsed,
    artifactVersion: metadata.modelVersion,
    modelVersion: metadata.modelVersion,
    backendKind: metadata.backendKind,
    candidateCount: metadata.candidateCount,
    appliedToLearnerFacingOutput: metadata.appliedToLearnerFacingOutput,
    appliedPromptInstructionCount: metadata.appliedPromptInstructionCount,
    appliedPath: metadata.appliedPath,
    warnings: sanitizeWarningsForView(metadata.warnings),
  };
}
