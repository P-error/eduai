export type ResearchWaveId = "wave_1" | "wave_2" | "wave_3";

export type ResearchPolicyId =
  | "baseline"
  | "policy_v0"
  | "policy_v1"
  | "policy_v2"
  | "preserved_v0"
  | "preserved_v1";

export type ResearchPolicyRole =
  | "baseline_control"
  | "historical_ml_policy"
  | "preserved_historical_ml_policy"
  | "final_thesis_ml_policy";

export type ResearchPolicyModelFamily =
  | "heuristic_baseline"
  | "six_factor_candidate_scorer_v0"
  | "six_factor_candidate_scorer_v1"
  | "catboost_candidate_scorer_v1";

export type ResearchPolicyRuntimeStatus =
  | "runtime_supported"
  | "historical_policy"
  | "preserved_historical_policy"
  | "runtime_pending";

export type ResearchDecisionSource = "heuristic_baseline" | "ml_policy";

export type ResearchPolicy = {
  readonly id: ResearchPolicyId;
  readonly thesisLabel: string;
  readonly publicLabel: string;
  readonly waveIds: readonly ResearchWaveId[];
  readonly roleInExperiment: ResearchPolicyRole;
  readonly modelFamily: ResearchPolicyModelFamily;
  readonly modelVersion: string | null;
  readonly runtimeStatus: ResearchPolicyRuntimeStatus;
  readonly artifactPath: string | null;
  readonly decisionSource: ResearchDecisionSource;
  readonly isBaseline: boolean;
  readonly isMachineLearned: boolean;
  readonly isPreserved: boolean;
  readonly isCurrentFinalPolicy: boolean;
};

export type ResearchWave = {
  readonly id: ResearchWaveId;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly policyIds: readonly ResearchPolicyId[];
};

export const RESEARCH_WAVES = {
  wave_1: {
    id: "wave_1",
    startedAt: "2026-04-10",
    endedAt: "2026-04-22",
    policyIds: ["baseline", "policy_v0"],
  },
  wave_2: {
    id: "wave_2",
    startedAt: "2026-04-23",
    endedAt: "2026-05-01",
    policyIds: ["baseline", "preserved_v0", "policy_v1"],
  },
  wave_3: {
    id: "wave_3",
    startedAt: "2026-05-03",
    endedAt: "2026-05-10",
    policyIds: ["baseline", "preserved_v0", "preserved_v1", "policy_v2"],
  },
} as const satisfies Record<ResearchWaveId, ResearchWave>;

export const RESEARCH_POLICIES = {
  baseline: {
    id: "baseline",
    thesisLabel: "Heuristic baseline policy",
    publicLabel: "Baseline",
    waveIds: ["wave_1", "wave_2", "wave_3"],
    roleInExperiment: "baseline_control",
    modelFamily: "heuristic_baseline",
    modelVersion: null,
    runtimeStatus: "runtime_supported",
    artifactPath: null,
    decisionSource: "heuristic_baseline",
    isBaseline: true,
    isMachineLearned: false,
    isPreserved: false,
    isCurrentFinalPolicy: false,
  },
  policy_v0: {
    id: "policy_v0",
    thesisLabel: "Six-factor candidate scorer v0",
    publicLabel: "Policy v0",
    waveIds: ["wave_1"],
    roleInExperiment: "historical_ml_policy",
    modelFamily: "six_factor_candidate_scorer_v0",
    modelVersion: "v0",
    runtimeStatus: "historical_policy",
    artifactPath: null,
    decisionSource: "ml_policy",
    isBaseline: false,
    isMachineLearned: true,
    isPreserved: false,
    isCurrentFinalPolicy: false,
  },
  policy_v1: {
    id: "policy_v1",
    thesisLabel: "Six-factor candidate scorer v1",
    publicLabel: "Policy v1",
    waveIds: ["wave_2"],
    roleInExperiment: "historical_ml_policy",
    modelFamily: "six_factor_candidate_scorer_v1",
    modelVersion: "v1",
    runtimeStatus: "historical_policy",
    artifactPath: null,
    decisionSource: "ml_policy",
    isBaseline: false,
    isMachineLearned: true,
    isPreserved: false,
    isCurrentFinalPolicy: false,
  },
  policy_v2: {
    id: "policy_v2",
    thesisLabel: "CatBoost candidate scorer final thesis policy",
    publicLabel: "Policy v2",
    waveIds: ["wave_3"],
    roleInExperiment: "final_thesis_ml_policy",
    modelFamily: "catboost_candidate_scorer_v1",
    modelVersion: "catboost_candidate_scorer_v1",
    runtimeStatus: "runtime_supported",
    artifactPath:
      "artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json",
    decisionSource: "ml_policy",
    isBaseline: false,
    isMachineLearned: true,
    isPreserved: false,
    isCurrentFinalPolicy: true,
  },
  preserved_v0: {
    id: "preserved_v0",
    thesisLabel: "Preserved six-factor candidate scorer v0",
    publicLabel: "Preserved v0",
    waveIds: ["wave_2", "wave_3"],
    roleInExperiment: "preserved_historical_ml_policy",
    modelFamily: "six_factor_candidate_scorer_v0",
    modelVersion: "v0",
    runtimeStatus: "preserved_historical_policy",
    artifactPath: null,
    decisionSource: "ml_policy",
    isBaseline: false,
    isMachineLearned: true,
    isPreserved: true,
    isCurrentFinalPolicy: false,
  },
  preserved_v1: {
    id: "preserved_v1",
    thesisLabel: "Preserved six-factor candidate scorer v1",
    publicLabel: "Preserved v1",
    waveIds: ["wave_3"],
    roleInExperiment: "preserved_historical_ml_policy",
    modelFamily: "six_factor_candidate_scorer_v1",
    modelVersion: "v1",
    runtimeStatus: "preserved_historical_policy",
    artifactPath: null,
    decisionSource: "ml_policy",
    isBaseline: false,
    isMachineLearned: true,
    isPreserved: true,
    isCurrentFinalPolicy: false,
  },
} as const satisfies Record<ResearchPolicyId, ResearchPolicy>;

export function listResearchPolicies(): readonly ResearchPolicy[] {
  return Object.values(RESEARCH_POLICIES);
}

export function listResearchWaves(): readonly ResearchWave[] {
  return Object.values(RESEARCH_WAVES);
}

export function getResearchPolicyById(
  id: ResearchPolicyId | string,
): ResearchPolicy | null {
  if (!isResearchPolicyId(id)) return null;
  return RESEARCH_POLICIES[id];
}

export function getResearchWaveById(
  id: ResearchWaveId | string,
): ResearchWave | null {
  if (!Object.prototype.hasOwnProperty.call(RESEARCH_WAVES, id)) return null;
  return RESEARCH_WAVES[id as ResearchWaveId];
}

export function getPoliciesForWave(
  waveId: ResearchWaveId | string,
): readonly ResearchPolicy[] {
  const wave = getResearchWaveById(waveId);
  if (!wave) return [];
  return wave.policyIds.map((policyId) => RESEARCH_POLICIES[policyId]);
}

export function getFinalThesisPolicy(): ResearchPolicy {
  return RESEARCH_POLICIES.policy_v2;
}

export function isResearchPolicyId(value: unknown): value is ResearchPolicyId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RESEARCH_POLICIES, value)
  );
}

export function normalizeResearchPolicyId(
  value: unknown,
  fallback: ResearchPolicyId,
): ResearchPolicyId {
  return isResearchPolicyId(value) ? value : fallback;
}
