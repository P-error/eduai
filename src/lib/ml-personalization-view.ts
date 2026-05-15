import {
  readSixFactorDeliveredConfigMetadata,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import type { EduAISixFactorMlConfigV1 } from "@/lib/ml-six-factor-policy-contract";

export type MlPersonalizationView = {
  kind: "six_factor_personalization_v1";
  selected_config: EduAISixFactorMlConfigV1;
  decisionSource: SixFactorDeliveredConfigMetadataV1["decisionSource"];
  fallbackUsed: boolean;
  artifactVersion: string | null;
  appliedToLearnerFacingOutput: boolean;
  appliedPromptInstructionCount: number | null;
  appliedPath: string | null;
};

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
    appliedToLearnerFacingOutput: metadata.appliedToLearnerFacingOutput,
    appliedPromptInstructionCount: metadata.appliedPromptInstructionCount,
    appliedPath: metadata.appliedPath,
  };
}
