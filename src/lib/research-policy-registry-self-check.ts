import {
  getFinalThesisPolicy,
  getPoliciesForWave,
  listResearchPolicies,
  listResearchWaves,
  RESEARCH_POLICIES,
  RESEARCH_WAVES,
  type ResearchPolicyId,
} from "@/lib/research-policy-registry";

type ResearchPolicyRegistrySelfCheckResult = {
  readonly ok: true;
  readonly checks: readonly string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPolicyIds(
  actual: readonly ResearchPolicyId[],
  expected: readonly ResearchPolicyId[],
  label: string,
) {
  assert(
    actual.length === expected.length &&
      actual.every((policyId, index) => policyId === expected[index]),
    `${label} policyIds mismatch: expected ${expected.join(", ")}, got ${actual.join(", ")}`,
  );
}

export function runResearchPolicyRegistrySelfCheck(): ResearchPolicyRegistrySelfCheckResult {
  const waves = listResearchWaves();
  const policies = listResearchPolicies();

  assert(waves.length === 3, `expected 3 waves, got ${waves.length}`);
  assert(policies.length === 6, `expected 6 policies, got ${policies.length}`);

  assertPolicyIds(
    RESEARCH_WAVES.wave_1.policyIds,
    ["baseline", "policy_v0"],
    "wave_1",
  );
  assertPolicyIds(
    RESEARCH_WAVES.wave_2.policyIds,
    ["baseline", "preserved_v0", "policy_v1"],
    "wave_2",
  );
  assertPolicyIds(
    RESEARCH_WAVES.wave_3.policyIds,
    ["baseline", "preserved_v0", "preserved_v1", "policy_v2"],
    "wave_3",
  );

  assert(
    RESEARCH_POLICIES.policy_v2.modelFamily === "catboost_candidate_scorer_v1",
    "policy_v2 must use catboost_candidate_scorer_v1",
  );
  assert(
    getFinalThesisPolicy().isCurrentFinalPolicy === true,
    "policy_v2 must be the current final policy",
  );
  assert(
    RESEARCH_POLICIES.baseline.decisionSource === "heuristic_baseline",
    "baseline must use heuristic_baseline decision source",
  );

  for (const wave of waves) {
    for (const policyId of wave.policyIds) {
      assert(
        RESEARCH_POLICIES[policyId] !== undefined,
        `${wave.id} references unknown policy ${policyId}`,
      );
    }
    assert(
      getPoliciesForWave(wave.id).length === wave.policyIds.length,
      `${wave.id} policies lookup must preserve registry coverage`,
    );
  }

  assert(
    RESEARCH_POLICIES.preserved_v0.isPreserved === true,
    "preserved_v0 must be marked preserved",
  );
  assert(
    RESEARCH_POLICIES.preserved_v1.isPreserved === true,
    "preserved_v1 must be marked preserved",
  );

  return {
    ok: true,
    checks: [
      "three_waves",
      "six_policies",
      "wave_1_policy_ids",
      "wave_2_policy_ids",
      "wave_3_policy_ids",
      "policy_v2_model_family",
      "policy_v2_current_final",
      "baseline_decision_source",
      "wave_policy_registry_coverage",
      "preserved_policy_flags",
    ],
  };
}
