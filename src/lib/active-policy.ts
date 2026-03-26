import { readFile } from "node:fs/promises";
import path from "node:path";

export const PREDICTION_POLICY_V1 = "v1_accuracy_raw_duration_baseline" as const;
export const PREDICTION_POLICY_V2 = "v2_accuracy_beta_duration_unified" as const;

export type ActivePredictionPolicyId =
  | typeof PREDICTION_POLICY_V1
  | typeof PREDICTION_POLICY_V2;

export const DEFAULT_ACTIVE_PREDICTION_POLICY_ID: ActivePredictionPolicyId =
  PREDICTION_POLICY_V2;

const ACTIVE_POLICY_CONFIG_PATH = path.join(
  process.cwd(),
  "configs",
  "active_policy.json",
);

function isKnownPolicyId(value: unknown): value is ActivePredictionPolicyId {
  return value === PREDICTION_POLICY_V1 || value === PREDICTION_POLICY_V2;
}

export async function getActivePredictionPolicyId() {
  try {
    const raw = await readFile(ACTIVE_POLICY_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as { policyId?: unknown };
    if (isKnownPolicyId(parsed.policyId)) {
      return parsed.policyId;
    }
  } catch {
    // Fall through to default.
  }

  return DEFAULT_ACTIVE_PREDICTION_POLICY_ID;
}
