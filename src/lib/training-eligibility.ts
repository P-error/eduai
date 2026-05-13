import { RESEARCH_CONSENT_VERSION } from "@/lib/research-consent";

export const TRAINING_EXCLUSION_REASON_CONSENT_WITHDRAWN =
  "consent_withdrawn" as const;

export type TrainingEligibilitySnapshot = {
  consentGranted: boolean;
  consentVersion: string | null;
  consentGrantedAtIso: string | null;
  consentWithdrawnAtIso: string | null;
  futureTrainingEligible: boolean;
  excludedFromFutureTraining: boolean;
  excludedFromFutureTrainingAtIso: string | null;
  exclusionReason: string | null;
};

type UserTrainingEligibilityFields = {
  researchConsentAt: Date | null;
  researchConsentVersion: string | null;
  researchConsentWithdrawnAt: Date | null;
  trainingDataExclusionAt: Date | null;
  trainingDataExclusionReason: string | null;
};

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function getTrainingEligibilitySnapshot(
  user: UserTrainingEligibilityFields,
): TrainingEligibilitySnapshot {
  const consentGranted =
    Boolean(user.researchConsentAt) && !Boolean(user.researchConsentWithdrawnAt);
  const excludedFromFutureTraining = Boolean(user.trainingDataExclusionAt);
  const futureTrainingEligible = consentGranted && !excludedFromFutureTraining;

  return {
    consentGranted,
    consentVersion: user.researchConsentVersion,
    consentGrantedAtIso: toIso(user.researchConsentAt),
    consentWithdrawnAtIso: toIso(user.researchConsentWithdrawnAt),
    futureTrainingEligible,
    excludedFromFutureTraining,
    excludedFromFutureTrainingAtIso: toIso(user.trainingDataExclusionAt),
    exclusionReason: user.trainingDataExclusionReason ?? null,
  };
}

export function buildGrantResearchConsentUpdate(params?: {
  now?: Date;
  currentExclusionReason?: string | null;
}) {
  const now = params?.now ?? new Date();
  const clearExclusion =
    !params?.currentExclusionReason ||
    params.currentExclusionReason === TRAINING_EXCLUSION_REASON_CONSENT_WITHDRAWN;

  return {
    researchConsentAt: now,
    researchConsentVersion: RESEARCH_CONSENT_VERSION,
    researchConsentWithdrawnAt: null,
    trainingDataExclusionAt: clearExclusion ? null : undefined,
    trainingDataExclusionReason: clearExclusion ? null : undefined,
  };
}

export function buildWithdrawResearchConsentUpdate(now = new Date()) {
  return {
    researchConsentWithdrawnAt: now,
    trainingDataExclusionAt: now,
    trainingDataExclusionReason: TRAINING_EXCLUSION_REASON_CONSENT_WITHDRAWN,
  };
}
