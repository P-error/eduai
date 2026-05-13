import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  EXAMPLES_LEVEL_VALUES,
  PRESENTATION_FORMAT_VALUES,
  STATIC_SIX_FACTOR_BASELINE,
  SUPPORT_LEVEL_VALUES,
  TERMINOLOGY_LEVEL_VALUES,
  type EduAIAppPolicyFeaturesV1,
  type EduAIAppSixFactorDecisionV1,
  type SixFactorCandidateConfigV1,
} from "@/lib/ml-six-factor-policy-contract";
import { createHeuristicSixFactorFallbackFromTwoFactor } from "@/lib/ml-six-factor-fallback";

export type GenerateSixFactorCandidateSetInput = {
  features: EduAIAppPolicyFeaturesV1;
  baseDecision?: EduAIAppSixFactorDecisionV1 | SixFactorCandidateConfigV1 | null;
  maxCandidates?: number;
};

const DEFAULT_MAX_CANDIDATES = 30;

function toCandidateConfig(
  value: EduAIAppSixFactorDecisionV1 | SixFactorCandidateConfigV1,
): SixFactorCandidateConfigV1 {
  return {
    difficulty: value.difficulty,
    depth: value.depth,
    supportLevel: value.supportLevel,
    presentationFormat: value.presentationFormat,
    examplesLevel: value.examplesLevel,
    terminologyLevel: value.terminologyLevel,
  };
}

function candidateKey(candidate: SixFactorCandidateConfigV1) {
  return [
    candidate.difficulty,
    candidate.depth,
    candidate.supportLevel,
    candidate.presentationFormat,
    candidate.examplesLevel,
    candidate.terminologyLevel,
  ].join("|");
}

function boundedMaxCandidates(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_CANDIDATES;
  }
  return Math.max(1, Math.min(972, Math.floor(value)));
}

function neighboringValues<const T extends readonly string[]>(
  values: T,
  current: T[number],
): T[number][] {
  const index = values.indexOf(current);
  if (index < 0) return [values[0]];
  const candidates = [current];
  if (index > 0) candidates.push(values[index - 1]);
  if (index < values.length - 1) candidates.push(values[index + 1]);
  return candidates;
}

function addCandidate(
  output: SixFactorCandidateConfigV1[],
  seen: Set<string>,
  candidate: SixFactorCandidateConfigV1,
  maxCandidates: number,
) {
  if (output.length >= maxCandidates) return;
  const key = candidateKey(candidate);
  if (seen.has(key)) return;
  seen.add(key);
  output.push(candidate);
}

function heuristicCandidateFromFeatures(features: EduAIAppPolicyFeaturesV1) {
  return toCandidateConfig(
    createHeuristicSixFactorFallbackFromTwoFactor({
      currentDifficulty: features.previousDifficulty,
      currentDepth: features.previousDepth,
      recentCorrectRate: features.recentCorrectRate,
      declaredPreferenceDifficulty: features.declaredPreferenceDifficulty,
      declaredPreferenceDepth: features.declaredPreferenceDepth,
      policyId: features.policyId,
      backendKind: features.backendKind,
      modelVersion: features.modelVersion,
    }),
  );
}

function addNearbyCandidates(
  output: SixFactorCandidateConfigV1[],
  seen: Set<string>,
  base: SixFactorCandidateConfigV1,
  maxCandidates: number,
) {
  for (const difficulty of neighboringValues(DIFFICULTY_VALUES, base.difficulty)) {
    addCandidate(output, seen, { ...base, difficulty }, maxCandidates);
  }
  for (const depth of neighboringValues(DEPTH_VALUES, base.depth)) {
    addCandidate(output, seen, { ...base, depth }, maxCandidates);
  }
  for (const supportLevel of neighboringValues(
    SUPPORT_LEVEL_VALUES,
    base.supportLevel,
  )) {
    addCandidate(output, seen, { ...base, supportLevel }, maxCandidates);
  }
  for (const presentationFormat of neighboringValues(
    PRESENTATION_FORMAT_VALUES,
    base.presentationFormat,
  )) {
    addCandidate(output, seen, { ...base, presentationFormat }, maxCandidates);
  }
  for (const examplesLevel of neighboringValues(
    EXAMPLES_LEVEL_VALUES,
    base.examplesLevel,
  )) {
    addCandidate(output, seen, { ...base, examplesLevel }, maxCandidates);
  }
  for (const terminologyLevel of neighboringValues(
    TERMINOLOGY_LEVEL_VALUES,
    base.terminologyLevel,
  )) {
    addCandidate(output, seen, { ...base, terminologyLevel }, maxCandidates);
  }
}

function explorationCandidates(): SixFactorCandidateConfigV1[] {
  return [
    {
      difficulty: "easy",
      depth: "detailed",
      supportLevel: "scaffolded",
      presentationFormat: "step_by_step",
      examplesLevel: "multiple",
      terminologyLevel: "simple",
    },
    {
      difficulty: "medium",
      depth: "standard",
      supportLevel: "guided",
      presentationFormat: "qa",
      examplesLevel: "single",
      terminologyLevel: "balanced",
    },
    {
      difficulty: "hard",
      depth: "brief",
      supportLevel: "minimal",
      presentationFormat: "paragraph",
      examplesLevel: "none",
      terminologyLevel: "technical",
    },
    {
      difficulty: "hard",
      depth: "standard",
      supportLevel: "guided",
      presentationFormat: "structured_list",
      examplesLevel: "single",
      terminologyLevel: "technical",
    },
    {
      difficulty: "easy",
      depth: "brief",
      supportLevel: "guided",
      presentationFormat: "structured_list",
      examplesLevel: "single",
      terminologyLevel: "simple",
    },
  ];
}

export function generateSixFactorCandidateSet({
  features,
  baseDecision,
  maxCandidates,
}: GenerateSixFactorCandidateSetInput): SixFactorCandidateConfigV1[] {
  const limit = boundedMaxCandidates(maxCandidates);
  const output: SixFactorCandidateConfigV1[] = [];
  const seen = new Set<string>();
  const heuristic = heuristicCandidateFromFeatures(features);
  const base = baseDecision == null ? heuristic : toCandidateConfig(baseDecision);

  addCandidate(output, seen, toCandidateConfig(STATIC_SIX_FACTOR_BASELINE), limit);
  addCandidate(output, seen, heuristic, limit);
  addCandidate(output, seen, base, limit);
  addNearbyCandidates(output, seen, base, limit);
  addNearbyCandidates(output, seen, heuristic, limit);

  for (const candidate of explorationCandidates()) {
    addCandidate(output, seen, candidate, limit);
  }

  return output;
}

export function hasDuplicateSixFactorCandidates(
  candidates: SixFactorCandidateConfigV1[],
) {
  return new Set(candidates.map(candidateKey)).size !== candidates.length;
}
