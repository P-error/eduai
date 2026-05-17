import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildEduAIAppPolicyFeaturesV1 } from "@/lib/ml-six-factor-feature-builder";
import {
  isSixFactorEvaluationPolicyMode,
  resolveSixFactorEvaluationPolicyMode,
  SIX_FACTOR_EVALUATION_POLICY_MODES,
  type SixFactorEvaluationPolicyDecision,
  type SixFactorEvaluationPolicyMode,
} from "@/lib/ml-six-factor-evaluation-policy-modes";
import {
  DEPTH_VALUES,
  DIFFICULTY_VALUES,
  EXAMPLES_LEVEL_VALUES,
  PRESENTATION_FORMAT_VALUES,
  SUPPORT_LEVEL_VALUES,
  TERMINOLOGY_LEVEL_VALUES,
  type DepthFactor,
  type DifficultyFactor,
  type EduAIAppPolicyFeaturesV1,
  type EduAISixFactorMlConfigV1,
  type ExamplesLevelFactor,
  type PresentationFormatFactor,
  type SupportLevelFactor,
  type TerminologyLevelFactor,
} from "@/lib/ml-six-factor-policy-contract";

type CliOptions = {
  sessionsPerPolicy: number;
  policies: SixFactorEvaluationPolicyMode[];
  out: string;
  jsonlOut: string;
  seed: number;
  mockContent: boolean;
  cleanup: boolean;
  subject: string;
  topic: string;
  artifact: string;
};

type LatentLearnerProfile = {
  learnerIndex: number;
  baseAbility: number;
  learningRate: number;
  noiseLevel: number;
  effectiveConfig: EduAISixFactorMlConfigV1;
  declaredPreferences: {
    difficulty: DifficultyFactor;
    depth: DepthFactor;
    presentationFormat: PresentationFormatFactor;
  };
};

type SimulatedOutcome = {
  preScore: number;
  postScore: number;
  maxScore: number;
  nextStepSuccess: boolean;
  normalizedLearningGain: number;
  expectedCombinedScore: number;
  matchScore: number;
  oracleCombinedScore: number;
  regret: number;
};

type PolicyRunObservation = {
  policyMode: SixFactorEvaluationPolicyMode;
  learnerIndex: number;
  stepIndex: number;
  features: EduAIAppPolicyFeaturesV1;
  decision: SixFactorEvaluationPolicyDecision;
  outcome: SimulatedOutcome;
};

type TrainingObservationV1Json = {
  schema_version: "training_observation.v1";
  ids: {
    observation_id: string;
    user_ref: string;
    subject_ref: string;
    topic_ref: string;
    session_ref: string | null;
    content_event_ref: string | null;
    test_event_ref: string | null;
  };
  timestamps: {
    decision_created_at: string;
    outcome_observed_at: string | null;
  };
  source: {
    source_kind: "synthetic";
    source_name: "eduai_ab_controlled_mock";
    source_version: "ab_mock_v1";
    adapter_version: "six_factor_ab_eval_runner_v1";
  };
  pre_decision_features: {
    prior_attempts_count: number;
    prior_correct_rate: number;
    recent_correct_rate: number;
    recent_attempts_count: number;
    topic_seen_count: number;
    minutes_since_last_activity: number | null;
    session_position: number;
    declared_preference_difficulty: DifficultyFactor | null;
    declared_preference_depth: DepthFactor | null;
    declared_preference_format: PresentationFormatFactor | null;
  };
  candidate_config: EduAISixFactorMlConfigV1;
  delivered_config: EduAISixFactorMlConfigV1;
  outcome: {
    pre_score: number;
    post_score: number;
    max_score: number;
    next_step_success: boolean;
    normalized_learning_gain: number;
    outcome_available: true;
  };
  leakage_guard: {
    features_cutoff_at: string;
    uses_only_pre_decision_data: true;
    notes: string;
  };
  policy_context: {
    policy_id: string | null;
    model_version: string | null;
    backend_kind: string | null;
    fallback_used: boolean | null;
  };
};

const DEFAULT_POLICIES: SixFactorEvaluationPolicyMode[] = [
  "static_default",
  "declared_preferences_only",
  "heuristic_baseline",
  "ml_policy",
];
const DEFAULT_RESULTS_OUT = "exports/six_factor_ab_evaluation_results.json";
const DEFAULT_JSONL_OUT = "exports/six_factor_ab_evaluation_observations.jsonl";
const DEFAULT_ARTIFACT = "artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json";
const SOURCE_NAME = "eduai_ab_controlled_mock";
const FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS = [
  "pre_score",
  "post_score",
  "max_score",
  "next_step_success",
  "normalized_learning_gain",
  "outcome_available",
  "outcome",
] as const;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    sessionsPerPolicy: 20,
    policies: DEFAULT_POLICIES,
    out: DEFAULT_RESULTS_OUT,
    jsonlOut: DEFAULT_JSONL_OUT,
    seed: 42,
    mockContent: false,
    cleanup: false,
    subject: "Six-factor A/B Controlled Subject",
    topic: "Six-factor A/B Controlled Topic",
    artifact: DEFAULT_ARTIFACT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sessions-per-policy") {
      options.sessionsPerPolicy = readPositiveInteger(
        argv[index + 1],
        options.sessionsPerPolicy,
      );
      index += 1;
    } else if (arg === "--policies") {
      options.policies = parsePolicies(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--out") {
      options.out = readNonEmptyString(argv[index + 1], options.out);
      index += 1;
    } else if (arg === "--jsonl-out") {
      options.jsonlOut = readNonEmptyString(argv[index + 1], options.jsonlOut);
      index += 1;
    } else if (arg === "--seed") {
      options.seed = readInteger(argv[index + 1], options.seed);
      index += 1;
    } else if (arg === "--mock-content") {
      options.mockContent = true;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    } else if (arg === "--subject") {
      options.subject = readNonEmptyString(argv[index + 1], options.subject);
      index += 1;
    } else if (arg === "--topic") {
      options.topic = readNonEmptyString(argv[index + 1], options.topic);
      index += 1;
    } else if (arg === "--artifact") {
      options.artifact = readNonEmptyString(argv[index + 1], options.artifact);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.mockContent) {
    throw new Error(
      "AB_EVALUATION_REQUIRES_MOCK_CONTENT: use --mock-content. Live LLM/API evaluation is intentionally out of scope.",
    );
  }
  if (options.policies.length === 0) {
    throw new Error("At least one policy mode is required.");
  }

  return options;
}

function parsePolicies(raw: string) {
  const policies = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const policy of policies) {
    if (!isSixFactorEvaluationPolicyMode(policy)) {
      throw new Error(
        `Unknown policy mode: ${policy}. Allowed: ${SIX_FACTOR_EVALUATION_POLICY_MODES.join(",")}`,
      );
    }
  }

  return policies as SixFactorEvaluationPolicyMode[];
}

function readNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function readInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
}

function readPositiveInteger(value: unknown, fallback: number) {
  return Math.max(1, Math.min(500, readInteger(value, fallback)));
}

function timestampForRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
}

function mkdirForFile(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath: string, value: unknown) {
  mkdirForFile(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath: string, rows: unknown[]) {
  mkdirForFile(filePath);
  writeFileSync(
    filePath,
    rows.length > 0
      ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
      : "",
    "utf8",
  );
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed: number, ...parts: number[]) {
  let mixed = seed >>> 0;
  for (const part of parts) {
    mixed = Math.imul(mixed ^ (part + 0x9e3779b9), 0x85ebca6b) >>> 0;
  }
  return mulberry32(mixed);
}

function pick<T extends string>(values: readonly T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function noisyPreference<T extends string>(
  values: readonly T[],
  effective: T,
  random: () => number,
  matchProbability: number,
) {
  if (random() < matchProbability) return effective;
  const alternatives = values.filter((value) => value !== effective);
  return alternatives[
    Math.min(alternatives.length - 1, Math.floor(random() * alternatives.length))
  ];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function positiveRate(values: boolean[]) {
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function buildLatentLearnerProfile(
  learnerIndex: number,
  seed: number,
): LatentLearnerProfile {
  const random = seededRandom(seed, learnerIndex, 101);
  const baseAbility = 0.18 + random() * 0.72;
  const learningRate = 0.05 + random() * 0.3;
  const noiseLevel = 0.035 + random() * 0.07;
  const difficulty: DifficultyFactor =
    baseAbility < 0.38
      ? "easy"
      : baseAbility > 0.72
        ? "hard"
        : "medium";
  const depth: DepthFactor =
    baseAbility < 0.42
      ? "detailed"
      : baseAbility > 0.76
        ? "brief"
        : "standard";
  const supportLevel: SupportLevelFactor =
    baseAbility < 0.46
      ? "scaffolded"
      : baseAbility > 0.78
        ? "minimal"
        : "guided";
  const examplesLevel: ExamplesLevelFactor =
    baseAbility < 0.44
      ? "multiple"
      : baseAbility > 0.78
        ? "none"
        : "single";
  const terminologyLevel: TerminologyLevelFactor =
    baseAbility < 0.42
      ? "simple"
      : baseAbility > 0.76
        ? "technical"
        : "balanced";
  const presentationFormat: PresentationFormatFactor = pick(
    PRESENTATION_FORMAT_VALUES,
    random,
  );
  const effectiveConfig = {
    difficulty,
    depth,
    support_level: supportLevel,
    presentation_format: presentationFormat,
    examples_level: examplesLevel,
    terminology_level: terminologyLevel,
  } satisfies EduAISixFactorMlConfigV1;

  return {
    learnerIndex,
    baseAbility,
    learningRate,
    noiseLevel,
    effectiveConfig,
    declaredPreferences: {
      difficulty: noisyPreference(
        DIFFICULTY_VALUES,
        difficulty,
        random,
        0.72,
      ) as DifficultyFactor,
      depth: noisyPreference(DEPTH_VALUES, depth, random, 0.68) as DepthFactor,
      presentationFormat: noisyPreference(
        PRESENTATION_FORMAT_VALUES,
        presentationFormat,
        random,
        0.6,
      ) as PresentationFormatFactor,
    },
  };
}

function ordinalCloseness<const T extends readonly string[]>(
  values: T,
  selected: T[number],
  effective: T[number],
) {
  const maxDistance = values.length - 1;
  if (maxDistance <= 0) return 1;
  return 1 - Math.abs(values.indexOf(selected) - values.indexOf(effective)) / maxDistance;
}

function categoricalCloseness(selected: string, effective: string) {
  return selected === effective ? 1 : 0.35;
}

function configMatchScore(
  profile: LatentLearnerProfile,
  config: EduAISixFactorMlConfigV1,
) {
  const difficulty = ordinalCloseness(
    DIFFICULTY_VALUES,
    config.difficulty,
    profile.effectiveConfig.difficulty,
  );
  const depth = ordinalCloseness(
    DEPTH_VALUES,
    config.depth,
    profile.effectiveConfig.depth,
  );
  const support = ordinalCloseness(
    SUPPORT_LEVEL_VALUES,
    config.support_level,
    profile.effectiveConfig.support_level,
  );
  const examples = ordinalCloseness(
    EXAMPLES_LEVEL_VALUES,
    config.examples_level,
    profile.effectiveConfig.examples_level,
  );
  const terminology = ordinalCloseness(
    TERMINOLOGY_LEVEL_VALUES,
    config.terminology_level,
    profile.effectiveConfig.terminology_level,
  );
  const presentation = categoricalCloseness(
    config.presentation_format,
    profile.effectiveConfig.presentation_format,
  );

  return (
    difficulty * 0.2 +
    depth * 0.16 +
    support * 0.2 +
    presentation * 0.14 +
    examples * 0.16 +
    terminology * 0.14
  );
}

function difficultyOverload(
  profile: LatentLearnerProfile,
  config: EduAISixFactorMlConfigV1,
) {
  const difficultyIndex = DIFFICULTY_VALUES.indexOf(config.difficulty);
  const abilityTarget = profile.baseAbility * 2;
  return Math.max(0, difficultyIndex - abilityTarget) / 2;
}

function expectedOutcome(
  profile: LatentLearnerProfile,
  features: EduAIAppPolicyFeaturesV1,
  config: EduAISixFactorMlConfigV1,
) {
  const matchScore = configMatchScore(profile, config);
  const knownRate =
    features.recentCorrectRate ?? features.priorCorrectRate ?? profile.baseAbility;
  const overload = difficultyOverload(profile, config);
  const stateReadiness = clamp01(profile.baseAbility * 0.65 + knownRate * 0.35);
  const expectedGain = clamp01(
    0.03 +
      matchScore * 0.52 +
      profile.learningRate * 0.25 +
      (1 - knownRate) * 0.12 -
      overload * 0.16,
  );
  const successProbability = clamp01(
    0.1 +
      matchScore * 0.48 +
      stateReadiness * 0.32 +
      profile.learningRate * 0.12 -
      overload * 0.18,
  );

  return {
    matchScore,
    expectedGain,
    successProbability,
    expectedCombinedScore: clamp01(expectedGain * 0.75 + successProbability * 0.25),
  };
}

function fullFactorGrid() {
  const output: EduAISixFactorMlConfigV1[] = [];
  for (const difficulty of DIFFICULTY_VALUES) {
    for (const depth of DEPTH_VALUES) {
      for (const supportLevel of SUPPORT_LEVEL_VALUES) {
        for (const presentationFormat of PRESENTATION_FORMAT_VALUES) {
          for (const examplesLevel of EXAMPLES_LEVEL_VALUES) {
            for (const terminologyLevel of TERMINOLOGY_LEVEL_VALUES) {
              output.push({
                difficulty,
                depth,
                support_level: supportLevel,
                presentation_format: presentationFormat,
                examples_level: examplesLevel,
                terminology_level: terminologyLevel,
              });
            }
          }
        }
      }
    }
  }
  return output;
}

const ALL_FACTOR_CONFIGS = fullFactorGrid();

function oracleCombinedScore(
  profile: LatentLearnerProfile,
  features: EduAIAppPolicyFeaturesV1,
) {
  let best = 0;
  for (const config of ALL_FACTOR_CONFIGS) {
    best = Math.max(best, expectedOutcome(profile, features, config).expectedCombinedScore);
  }
  return best;
}

function simulateOutcome(params: {
  profile: LatentLearnerProfile;
  features: EduAIAppPolicyFeaturesV1;
  config: EduAISixFactorMlConfigV1;
  seed: number;
  stepIndex: number;
}) {
  const expected = expectedOutcome(params.profile, params.features, params.config);
  const noiseRandom = seededRandom(
    params.seed,
    params.profile.learnerIndex,
    params.stepIndex,
    707,
  );
  const noise = (noiseRandom() - 0.5) * params.profile.noiseLevel;
  const basePre =
    params.features.priorCorrectRate ??
    params.features.recentCorrectRate ??
    params.profile.baseAbility;
  const preScore = clamp01(basePre * 0.82 + params.profile.baseAbility * 0.18);
  const normalizedLearningGain = clamp01(expected.expectedGain + noise);
  const postScore = clamp01(
    preScore + (1 - preScore) * normalizedLearningGain,
  );
  const nextStepSuccess =
    clamp01(expected.successProbability + noise * 0.75) >= 0.6;
  const oracleScore = oracleCombinedScore(params.profile, params.features);

  return {
    preScore: round4(preScore),
    postScore: round4(postScore),
    maxScore: 1,
    nextStepSuccess,
    normalizedLearningGain: round4(
      preScore < 1 ? (postScore - preScore) / (1 - preScore) : 0,
    ),
    expectedCombinedScore: round4(expected.expectedCombinedScore),
    matchScore: round4(expected.matchScore),
    oracleCombinedScore: round4(oracleScore),
    regret: round4(Math.max(0, oracleScore - expected.expectedCombinedScore)),
  } satisfies SimulatedOutcome;
}

function buildFeatures(params: {
  profile: LatentLearnerProfile;
  policyMode: SixFactorEvaluationPolicyMode;
  options: CliOptions;
  stepIndex: number;
  priorOutcomes: SimulatedOutcome[];
  previousDecision: SixFactorEvaluationPolicyDecision | null;
}) {
  const priorScores = params.priorOutcomes.map((outcome) => outcome.postScore);
  const recentScores = priorScores.slice(-3);

  return buildEduAIAppPolicyFeaturesV1({
    userRef: `ab_eval_user_${String(params.profile.learnerIndex).padStart(4, "0")}`,
    subjectRef: `ab_eval_subject_${slugify(params.options.subject)}`,
    topicRef: `ab_eval_topic_${slugify(params.options.topic)}`,
    sessionRef: `ab_eval_${params.policyMode}_${String(params.profile.learnerIndex).padStart(4, "0")}`,
    contentEventRef: `ab_eval_${params.policyMode}_${params.profile.learnerIndex}_${params.stepIndex}_content`,
    priorAttemptsCount: priorScores.length,
    priorCorrectRate: priorScores.length > 0 ? mean(priorScores) : null,
    recentCorrectRate: recentScores.length > 0 ? mean(recentScores) : null,
    recentAttemptsCount: recentScores.length,
    topicSeenCount: priorScores.length,
    minutesSinceLastActivity:
      params.stepIndex === 0 ? null : 5 + params.profile.learnerIndex,
    sessionPosition: params.stepIndex + 1,
    declaredPreferenceDifficulty: params.profile.declaredPreferences.difficulty,
    declaredPreferenceDepth: params.profile.declaredPreferences.depth,
    declaredPreferenceFormat: params.profile.declaredPreferences.presentationFormat,
    previousDifficulty:
      params.previousDecision?.decision.difficulty ??
      params.profile.declaredPreferences.difficulty,
    previousDepth:
      params.previousDecision?.decision.depth ??
      params.profile.declaredPreferences.depth,
    policyId: `six_factor_ab_eval_${params.policyMode}_v1`,
    backendKind: params.policyMode,
    modelVersion: null,
  });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "default";
}

function safeRate(value: number | null) {
  return value == null ? 0 : clamp01(value);
}

function preDecisionFeaturesForObservation(features: EduAIAppPolicyFeaturesV1) {
  return {
    prior_attempts_count: features.priorAttemptsCount,
    prior_correct_rate: safeRate(features.priorCorrectRate),
    recent_correct_rate: safeRate(features.recentCorrectRate),
    recent_attempts_count: features.recentAttemptsCount,
    topic_seen_count: features.topicSeenCount ?? 0,
    minutes_since_last_activity: features.minutesSinceLastActivity,
    session_position: features.sessionPosition ?? 0,
    declared_preference_difficulty: features.declaredPreferenceDifficulty,
    declared_preference_depth: features.declaredPreferenceDepth,
    declared_preference_format: features.declaredPreferenceFormat,
  } satisfies TrainingObservationV1Json["pre_decision_features"];
}

function isoForDecision(stepIndex: number, learnerIndex: number, policyIndex: number) {
  return new Date(
    Date.UTC(2026, 4, 8, 0, 0, 0) +
      policyIndex * 24 * 60 * 60 * 1000 +
      learnerIndex * 10 * 60 * 1000 +
      stepIndex * 90 * 1000,
  ).toISOString();
}

function buildTrainingObservation(params: {
  runId: string;
  policyIndex: number;
  policyMode: SixFactorEvaluationPolicyMode;
  observation: PolicyRunObservation;
}): TrainingObservationV1Json {
  const decisionCreatedAt = isoForDecision(
    params.observation.stepIndex,
    params.observation.learnerIndex,
    params.policyIndex,
  );
  const outcomeObservedAt = new Date(
    Date.parse(decisionCreatedAt) + 60 * 1000,
  ).toISOString();
  const prefix = [
    params.runId,
    params.policyMode,
    params.observation.learnerIndex,
    params.observation.stepIndex,
  ].join("_");

  return {
    schema_version: "training_observation.v1",
    ids: {
      observation_id: `${prefix}_observation`,
      user_ref: params.observation.features.userRef,
      subject_ref: params.observation.features.subjectRef ?? "ab_eval_subject",
      topic_ref: params.observation.features.topicRef ?? "ab_eval_topic",
      session_ref: params.observation.features.sessionRef,
      content_event_ref: params.observation.features.contentEventRef,
      test_event_ref: `${prefix}_test`,
    },
    timestamps: {
      decision_created_at: decisionCreatedAt,
      outcome_observed_at: outcomeObservedAt,
    },
    source: {
      source_kind: "synthetic",
      source_name: SOURCE_NAME,
      source_version: "ab_mock_v1",
      adapter_version: "six_factor_ab_eval_runner_v1",
    },
    pre_decision_features: preDecisionFeaturesForObservation(
      params.observation.features,
    ),
    candidate_config: params.observation.decision.candidateConfig,
    delivered_config: params.observation.decision.deliveredConfig,
    outcome: {
      pre_score: params.observation.outcome.preScore,
      post_score: params.observation.outcome.postScore,
      max_score: params.observation.outcome.maxScore,
      next_step_success: params.observation.outcome.nextStepSuccess,
      normalized_learning_gain:
        params.observation.outcome.normalizedLearningGain,
      outcome_available: true,
    },
    leakage_guard: {
      features_cutoff_at: decisionCreatedAt,
      uses_only_pre_decision_data: true,
      notes:
        "Controlled A/B mock observation. Outcome is generated after decision and is not included in pre_decision_features.",
    },
    policy_context: {
      policy_id: params.observation.decision.policyId,
      model_version: params.observation.decision.modelVersion,
      backend_kind: params.observation.decision.backendKind,
      fallback_used: params.observation.decision.fallbackUsed,
    },
  };
}

function runPolicy(params: {
  policyMode: SixFactorEvaluationPolicyMode;
  policyIndex: number;
  options: CliOptions;
}) {
  const observations: PolicyRunObservation[] = [];

  for (
    let learnerIndex = 0;
    learnerIndex < params.options.sessionsPerPolicy;
    learnerIndex += 1
  ) {
    const profile = buildLatentLearnerProfile(learnerIndex, params.options.seed);
    const priorOutcomes: SimulatedOutcome[] = [];
    let previousDecision: SixFactorEvaluationPolicyDecision | null = null;

    for (let stepIndex = 0; stepIndex < 2; stepIndex += 1) {
      const features = buildFeatures({
        profile,
        policyMode: params.policyMode,
        options: params.options,
        stepIndex,
        priorOutcomes,
        previousDecision,
      });
      const decision = resolveSixFactorEvaluationPolicyMode(
        params.policyMode,
        features,
        {
          artifactPath: params.options.artifact,
          maxCandidates: 30,
        },
      );
      const outcome = simulateOutcome({
        profile,
        features,
        config: decision.deliveredConfig,
        seed: params.options.seed,
        stepIndex,
      });

      observations.push({
        policyMode: params.policyMode,
        learnerIndex,
        stepIndex,
        features,
        decision,
        outcome,
      });
      priorOutcomes.push(outcome);
      previousDecision = decision;
    }
  }

  return observations;
}

function factorDistribution(observations: PolicyRunObservation[]) {
  const distribution = {
    difficulty: {} as Record<string, number>,
    depth: {} as Record<string, number>,
    support_level: {} as Record<string, number>,
    presentation_format: {} as Record<string, number>,
    examples_level: {} as Record<string, number>,
    terminology_level: {} as Record<string, number>,
  };

  for (const observation of observations) {
    const config = observation.decision.deliveredConfig;
    increment(distribution.difficulty, config.difficulty);
    increment(distribution.depth, config.depth);
    increment(distribution.support_level, config.support_level);
    increment(distribution.presentation_format, config.presentation_format);
    increment(distribution.examples_level, config.examples_level);
    increment(distribution.terminology_level, config.terminology_level);
  }

  return distribution;
}

function decisionSourceCounts(observations: PolicyRunObservation[]) {
  const counts: Record<string, number> = {};
  for (const observation of observations) {
    increment(counts, observation.decision.decisionSource);
  }
  return counts;
}

function metricsForPolicy(observations: PolicyRunObservation[]) {
  const normalizedGains = observations.map(
    (observation) => observation.outcome.normalizedLearningGain,
  );
  const postScores = observations.map((observation) => observation.outcome.postScore);
  const regrets = observations.map((observation) => observation.outcome.regret);
  const nextStepSuccess = observations.map(
    (observation) => observation.outcome.nextStepSuccess,
  );
  const fallbackUsed = observations.map(
    (observation) => observation.decision.fallbackUsed,
  );

  return {
    observationsCount: observations.length,
    meanPostScore: round4(mean(postScores)),
    meanNormalizedLearningGain: round4(mean(normalizedGains)),
    positiveGainShare: round4(
      normalizedGains.filter((value) => value > 0).length / observations.length,
    ),
    nextStepSuccessRate: round4(positiveRate(nextStepSuccess)),
    meanRegretVsOracle: round4(mean(regrets)),
    fallbackUsedRate: round4(positiveRate(fallbackUsed)),
    decisionSourceCounts: decisionSourceCounts(observations),
    factorDistribution: factorDistribution(observations),
  };
}

function groupByPolicy(observations: PolicyRunObservation[]) {
  const grouped = new Map<SixFactorEvaluationPolicyMode, PolicyRunObservation[]>();
  for (const observation of observations) {
    const current = grouped.get(observation.policyMode) ?? [];
    current.push(observation);
    grouped.set(observation.policyMode, current);
  }
  return grouped;
}

function pairwiseComparisons(
  metricsByPolicy: Record<string, ReturnType<typeof metricsForPolicy>>,
) {
  const ml = metricsByPolicy.ml_policy;
  if (!ml) return {};

  const output: Record<string, Record<string, number>> = {};
  for (const baseline of [
    "static_default",
    "declared_preferences_only",
    "heuristic_baseline",
  ]) {
    const baselineMetrics = metricsByPolicy[baseline];
    if (!baselineMetrics) continue;
    output[`ml_policy_vs_${baseline}`] = {
      meanPostScoreDiff: round4(
        ml.meanPostScore - baselineMetrics.meanPostScore,
      ),
      meanNormalizedLearningGainDiff: round4(
        ml.meanNormalizedLearningGain -
          baselineMetrics.meanNormalizedLearningGain,
      ),
      nextStepSuccessRateDiff: round4(
        ml.nextStepSuccessRate - baselineMetrics.nextStepSuccessRate,
      ),
      meanRegretVsOracleDiff: round4(
        ml.meanRegretVsOracle - baselineMetrics.meanRegretVsOracle,
      ),
    };
  }
  return output;
}

function recommendation(
  metricsByPolicy: Record<string, ReturnType<typeof metricsForPolicy>>,
) {
  const ml = metricsByPolicy.ml_policy;
  const staticBaseline = metricsByPolicy.static_default;
  const heuristic = metricsByPolicy.heuristic_baseline;
  if (!ml || !staticBaseline || !heuristic) {
    return {
      status: "inconclusive",
      note: "ml_policy, static_default, and heuristic_baseline are required for the main recommendation.",
    };
  }

  const beatsStatic =
    ml.meanNormalizedLearningGain > staticBaseline.meanNormalizedLearningGain &&
    ml.nextStepSuccessRate >= staticBaseline.nextStepSuccessRate &&
    ml.meanRegretVsOracle <= staticBaseline.meanRegretVsOracle;
  const beatsHeuristic =
    ml.meanNormalizedLearningGain > heuristic.meanNormalizedLearningGain &&
    ml.nextStepSuccessRate >= heuristic.nextStepSuccessRate &&
    ml.meanRegretVsOracle <= heuristic.meanRegretVsOracle;

  if (beatsStatic && beatsHeuristic) {
    return {
      status: "ml_better_controlled_mock",
      note: "ML policy is ahead of static and heuristic baselines in this controlled simulation only; this is not real-user educational evidence.",
    };
  }

  const mlCloseToBest =
    ml.meanNormalizedLearningGain >=
    Math.max(
      staticBaseline.meanNormalizedLearningGain,
      heuristic.meanNormalizedLearningGain,
    ) - 0.01;

  if (mlCloseToBest) {
    return {
      status: "inconclusive",
      note: "ML policy is close to the best comparator, but the controlled mock result is not strong enough for a superiority claim.",
    };
  }

  return {
    status: "ml_not_better_controlled_mock",
    note: "ML policy did not outperform the main baselines in this controlled simulation. Improve policy/scorer/candidate generation before real-user pilot claims.",
  };
}

function hasLeakageViolation(observation: TrainingObservationV1Json) {
  const pre = observation.pre_decision_features as Record<string, unknown>;
  return (
    observation.leakage_guard.uses_only_pre_decision_data !== true ||
    FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS.some((field) => field in pre)
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const runId = `ab_eval_${timestampForRunId()}_seed${options.seed}`;
  const allObservations: PolicyRunObservation[] = [];

  options.policies.forEach((policyMode, policyIndex) => {
    allObservations.push(
      ...runPolicy({
        policyMode,
        policyIndex,
        options,
      }),
    );
  });

  const trainingRows = allObservations.map((observation) =>
    buildTrainingObservation({
      runId,
      policyIndex: options.policies.indexOf(observation.policyMode),
      policyMode: observation.policyMode,
      observation,
    }),
  );
  const grouped = groupByPolicy(allObservations);
  const metricsByPolicy = Object.fromEntries(
    [...grouped.entries()].map(([policyMode, observations]) => [
      policyMode,
      metricsForPolicy(observations),
    ]),
  );
  const comparisons = pairwiseComparisons(metricsByPolicy);
  const leakageViolations = trainingRows.filter(hasLeakageViolation).length;
  const sourceKindCounts = trainingRows.reduce<Record<string, number>>((counts, row) => {
    increment(counts, row.source.source_kind);
    return counts;
  }, {});
  const resultRecommendation = recommendation(metricsByPolicy);
  const result = {
    runId,
    seed: options.seed,
    mode: "controlled_mock",
    mockContent: options.mockContent,
    policies: options.policies,
    sessionsPerPolicy: options.sessionsPerPolicy,
    observationsCount: trainingRows.length,
    outputPaths: {
      results: path.resolve(process.cwd(), options.out),
      observationsJsonl: path.resolve(process.cwd(), options.jsonlOut),
    },
    artifact: {
      requestedPath: options.artifact,
    },
    evaluationDesign: {
      learnerStates:
        "Seed-balanced latent learners are reused across policy modes; declared preferences are noisy and may differ from effective config.",
      outcomeSimulation:
        "Outcome depends on learner ability, prior/recent aggregate state, delivered six-factor config match, overload penalty, learning rate, and deterministic noise.",
      policyAssignment:
        "Each policy receives the same learner-index distribution and two sequential content/test steps.",
      leakagePrevention:
        "Step 2 features include only prior simulated outcomes as aggregate history; raw outcome fields are never copied into pre_decision_features.",
    },
    metricsByPolicy,
    pairwiseComparisons: comparisons,
    leakageCheckSummary: {
      sourceKindCounts,
      leakageViolations,
      forbiddenOutcomeFeatureFields: FORBIDDEN_PRE_DECISION_OUTCOME_FIELDS,
    },
    limitations: [
      "This is controlled/mock simulation, not real-user evidence.",
      "No browser UI, live LLM/API, or randomized real-user assignment is used.",
      "Outcome function is diagnostic and must not be presented as proof of real educational effect.",
      "The synthetic-trained artifact may or may not align with this mock latent outcome function.",
    ],
    recommendation: resultRecommendation,
  };

  writeJsonl(options.jsonlOut, trainingRows);
  writeJson(options.out, result);

  console.log(
    JSON.stringify(
      {
        runId,
        status:
          resultRecommendation.status === "ml_better_controlled_mock"
            ? "AB_EVAL_PASS"
            : resultRecommendation.status === "inconclusive"
              ? "AB_EVAL_INCONCLUSIVE"
              : "AB_EVAL_FAIL",
        mode: "controlled_mock",
        observations: trainingRows.length,
        leakageViolations,
        metricsByPolicy,
        pairwiseComparisons: comparisons,
        recommendation: resultRecommendation,
        resultsOut: options.out,
        jsonlOut: options.jsonlOut,
      },
      null,
      2,
    ),
  );
}

main();
