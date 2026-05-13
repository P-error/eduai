export const LEARNING_EXCLUSION_REASON_CODES = [
  "LOW_UX_COMPLIANCE",
  "INVALID_TAG_WARNINGS",
  "FALLBACK_GENERATION",
  "FALLBACK_TAGGING",
  "LEARNING_INELIGIBLE",
  "DEFAULT_COLLECTION",
  "UNKNOWN",
] as const;

export type LearningExclusionReasonCode =
  (typeof LEARNING_EXCLUSION_REASON_CODES)[number];

export type LearnerAttemptPathKind =
  | "learn_episode"
  | "custom_practice"
  | "standalone_assessment";

export type LearnerAttemptAdaptiveImpactKind =
  | "canonical_learn_update"
  | "secondary_practice_update"
  | "standalone_assessment_update"
  | "record_only";

export type LearnerAttemptEvidenceContract = {
  attemptRecorded: true;
  path: {
    kind: LearnerAttemptPathKind;
    canonical: boolean;
    episodeId: string | null;
    sequenceRole: string | null;
  };
  learning: {
    eligible: boolean;
    status: "eligible" | "excluded";
    exclusionReasonCode: LearningExclusionReasonCode | null;
  };
  adaptive: {
    updatesState: boolean;
    impactKind: LearnerAttemptAdaptiveImpactKind;
  };
  signals: {
    testsPrimary: boolean;
    supportingSignalsOnly: boolean;
    chatSecondary: boolean;
  };
};

function isKnownLearningExclusionReason(
  value: string,
): value is LearningExclusionReasonCode {
  return (LEARNING_EXCLUSION_REASON_CODES as readonly string[]).includes(value);
}

export function normalizeLearningExclusionReason(
  value: unknown,
): LearningExclusionReasonCode | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return isKnownLearningExclusionReason(value) ? value : "UNKNOWN";
}

export function resolveLearnerAttemptPathKind(params: {
  testMode: string | null | undefined;
  evaluationEpisodeId: string | null | undefined;
  sequenceRole: string | null | undefined;
}) {
  if (params.evaluationEpisodeId || params.sequenceRole) {
    return "learn_episode" satisfies LearnerAttemptPathKind;
  }
  if (params.testMode === "practice") {
    return "custom_practice" satisfies LearnerAttemptPathKind;
  }
  return "standalone_assessment" satisfies LearnerAttemptPathKind;
}

export function buildLearnerAttemptEvidenceContract(params: {
  testMode: string | null | undefined;
  evaluationEpisodeId: string | null | undefined;
  sequenceRole: string | null | undefined;
  learningEligible: boolean;
  learningSkipReason: LearningExclusionReasonCode | null;
  testsPrimary?: boolean | null | undefined;
  chatSecondary?: boolean | null | undefined;
}): LearnerAttemptEvidenceContract {
  const pathKind = resolveLearnerAttemptPathKind(params);
  const testsPrimary = params.testsPrimary ?? true;
  const chatSecondary =
    params.chatSecondary ??
    (pathKind === "learn_episode" ? true : false);
  const learningStatus = params.learningEligible ? "eligible" : "excluded";
  const adaptiveImpact =
    learningStatus === "excluded"
      ? "record_only"
      : pathKind === "learn_episode"
        ? "canonical_learn_update"
        : pathKind === "custom_practice"
          ? "secondary_practice_update"
          : "standalone_assessment_update";

  return {
    attemptRecorded: true,
    path: {
      kind: pathKind,
      canonical: pathKind === "learn_episode",
      episodeId: params.evaluationEpisodeId ?? null,
      sequenceRole: params.sequenceRole ?? null,
    },
    learning: {
      eligible: params.learningEligible,
      status: learningStatus,
      exclusionReasonCode:
        learningStatus === "excluded" ? params.learningSkipReason : null,
    },
    adaptive: {
      updatesState: learningStatus === "eligible",
      impactKind: adaptiveImpact,
    },
    signals: {
      testsPrimary,
      supportingSignalsOnly: !testsPrimary,
      chatSecondary,
    },
  };
}
