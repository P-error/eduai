import {
  evaluateUxComplianceGate,
  resolveStoredUxComplianceGate,
} from "@/lib/learning-quality-gate";
import { formatLearningExclusionReasonLabel } from "@/lib/ui-locale";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function runLearningQualityGateSelfCheck() {
  const optionalEpisodeStyle = evaluateUxComplianceGate({
    requestedDelivery: {
      tone: "friendly",
      explanation_style: "concise",
      response_format: "mcq",
    },
    observedTagsPerQuestion: [
      {
        tone: "formal",
        explanation_style: "stepwise",
        response_format: "mcq",
      },
    ],
    hasManualDeliveryOverride: false,
    taggingSource: "llm",
  });
  assert(
    optionalEpisodeStyle.learningExclusion === false &&
      optionalEpisodeStyle.status === "unknown",
    "optional episode rendering style must not exclude learning outcome",
  );

  const missingOptionalStyle = evaluateUxComplianceGate({
    requestedDelivery: {},
    observedTagsPerQuestion: [],
    hasManualDeliveryOverride: false,
    taggingSource: null,
  });
  assert(
    missingOptionalStyle.learningExclusion === false,
    "missing optional style metadata must not become LOW_UX_COMPLIANCE",
  );

  const provenManualLowStyle = evaluateUxComplianceGate({
    requestedDelivery: {
      tone: "friendly",
      explanation_style: "concise",
      response_format: "mcq",
    },
    observedTagsPerQuestion: [
      {
        tone: "formal",
        explanation_style: "stepwise",
        response_format: "mcq",
      },
      {
        tone: "formal",
        explanation_style: "stepwise",
        response_format: "mcq",
      },
    ],
    hasManualDeliveryOverride: true,
    taggingSource: "llm",
  });
  assert(
    provenManualLowStyle.learningExclusion === true &&
      provenManualLowStyle.reasonCode === "LOW_UX_COMPLIANCE" &&
      provenManualLowStyle.status === "failed",
    "proven manual style mismatch must produce LOW_UX_COMPLIANCE",
  );

  const fallbackUnknownStyle = evaluateUxComplianceGate({
    requestedDelivery: {
      tone: "friendly",
      explanation_style: "concise",
      response_format: "mcq",
    },
    observedTagsPerQuestion: [],
    hasManualDeliveryOverride: true,
    taggingSource: "rule_fallback",
  });
  assert(
    fallbackUnknownStyle.learningExclusion === false &&
      fallbackUnknownStyle.status === "unknown",
    "fallback or unknown style evidence must not be treated as low style consistency",
  );

  const legacyEpisodeLowUxFlag = resolveStoredUxComplianceGate({
    learningEligible: false,
    learningExcludedReason: "LOW_UX_COMPLIANCE",
    deliveryComplianceFailed: true,
    requestedDelivery: {},
    deliveryCompliance: {
      ux: {
        averageMatchRate: 0,
        minAxisMatchRate: 0,
        perAxis: [],
      },
    },
  });
  assert(
    legacyEpisodeLowUxFlag.learningExclusion === false,
    "legacy LOW_UX_COMPLIANCE without explicit requested UX axes must not exclude",
  );

  const legacyManualLowUxFlag = resolveStoredUxComplianceGate({
    learningEligible: false,
    learningExcludedReason: "LOW_UX_COMPLIANCE",
    deliveryComplianceFailed: true,
    requestedDelivery: {
      tone: "friendly",
    },
    deliveryCompliance: {
      ux: {
        averageMatchRate: 0,
        minAxisMatchRate: 0,
        perAxis: [
          {
            axis: "tone",
            requested: "friendly",
            matchCount: 0,
            total: 2,
            matchRate: 0,
          },
        ],
      },
    },
  });
  assert(
    legacyManualLowUxFlag.learningExclusion === true &&
      legacyManualLowUxFlag.reasonCode === "LOW_UX_COMPLIANCE",
    "legacy manual explicit style mismatch must still exclude",
  );

  assert(
    formatLearningExclusionReasonLabel("LOW_UX_COMPLIANCE", "ru") ===
      "Низкая согласованность стиля ответа",
    "UI label must map LOW_UX_COMPLIANCE to the Russian learner-facing text",
  );

  return {
    ok: true,
    checks: [
      "optional_episode_style_not_excluded",
      "missing_optional_style_not_low_ux",
      "manual_low_style_excluded",
      "fallback_unknown_style_not_low_ux",
      "legacy_episode_low_ux_flag_not_excluded_without_requested_axes",
      "legacy_manual_low_ux_flag_still_excluded",
      "ui_mapping_low_ux_ru",
    ],
  };
}
