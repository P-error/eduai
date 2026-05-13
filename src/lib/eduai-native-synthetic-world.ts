const DAY_MS = 24 * 60 * 60 * 1000;

export const SYNTHETIC_WORLD_SCHEMA_VERSION =
  "eduai_native_synthetic_world_v2_2026_03" as const;

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"] as const;
export const DEPTH_ORDER = ["brief", "standard", "detailed"] as const;
export const POLICY_ARMS = ["baseline", "self_report", "predicted"] as const;
export const SYNTHETIC_SEQUENCE_ROLES = [
  "precheck",
  "learning_content",
  "postcheck",
  "holdout",
  "delayed_recheck",
] as const;
export const SYNTHETIC_DELAYED_RECHECK_MINUTES = 48 * 60;

const LEARNER_ARCHETYPES = [
  {
    key: "novice_scaffolded",
    label: "Novice scaffolded",
    description:
      "Lower baseline mastery, stronger need for guidance, and clear benefit from adequate depth.",
    abilityBase: [0.2, 0.36],
    challengeAppetite: [-0.3, -0.08],
    difficultySensitivity: [0.22, 0.32],
    depthSensitivity: [0.2, 0.3],
    learningRate: [0.13, 0.21],
    retentionStrength: [0.48, 0.62],
    transferStrength: [0.46, 0.6],
    overexplanationPenalty: [0.02, 0.06],
    slipProbability: [0.03, 0.06],
    guessProbability: [0.08, 0.14],
    paceMultiplier: [1.02, 1.26],
    answerChangeBias: [0.14, 0.24],
    noiseScale: [0.04, 0.08],
    effectiveDepthIndex: 2,
  },
  {
    key: "steady_builder",
    label: "Steady builder",
    description:
      "Balanced learner with medium mastery, moderate guidance need, and reliable improvement.",
    abilityBase: [0.38, 0.58],
    challengeAppetite: [-0.08, 0.08],
    difficultySensitivity: [0.14, 0.22],
    depthSensitivity: [0.12, 0.2],
    learningRate: [0.11, 0.18],
    retentionStrength: [0.56, 0.7],
    transferStrength: [0.54, 0.68],
    overexplanationPenalty: [0.03, 0.08],
    slipProbability: [0.03, 0.06],
    guessProbability: [0.07, 0.12],
    paceMultiplier: [0.94, 1.12],
    answerChangeBias: [0.1, 0.18],
    noiseScale: [0.04, 0.08],
    effectiveDepthIndex: 1,
  },
  {
    key: "challenge_seeker",
    label: "Challenge seeker",
    description:
      "Stronger baseline ability, lower depth need on familiar material, and better fit with higher difficulty.",
    abilityBase: [0.56, 0.74],
    challengeAppetite: [0.12, 0.28],
    difficultySensitivity: [0.1, 0.18],
    depthSensitivity: [0.08, 0.14],
    learningRate: [0.1, 0.16],
    retentionStrength: [0.56, 0.7],
    transferStrength: [0.58, 0.72],
    overexplanationPenalty: [0.07, 0.14],
    slipProbability: [0.03, 0.06],
    guessProbability: [0.05, 0.1],
    paceMultiplier: [0.82, 1.02],
    answerChangeBias: [0.08, 0.16],
    noiseScale: [0.03, 0.07],
    effectiveDepthIndex: 1,
  },
  {
    key: "careful_deep",
    label: "Careful deep learner",
    description:
      "Learns well from sufficiently deep explanations and retains them better, but pays time cost.",
    abilityBase: [0.34, 0.54],
    challengeAppetite: [-0.1, 0.06],
    difficultySensitivity: [0.16, 0.24],
    depthSensitivity: [0.16, 0.24],
    learningRate: [0.12, 0.2],
    retentionStrength: [0.64, 0.8],
    transferStrength: [0.56, 0.7],
    overexplanationPenalty: [0.02, 0.06],
    slipProbability: [0.03, 0.06],
    guessProbability: [0.06, 0.11],
    paceMultiplier: [1.06, 1.26],
    answerChangeBias: [0.1, 0.18],
    noiseScale: [0.03, 0.07],
    effectiveDepthIndex: 2,
  },
  {
    key: "fragile_high_ability",
    label: "Fragile high ability",
    description:
      "Good baseline mastery with weaker consistency, so difficult material can still become brittle.",
    abilityBase: [0.6, 0.78],
    challengeAppetite: [0.02, 0.18],
    difficultySensitivity: [0.16, 0.24],
    depthSensitivity: [0.1, 0.16],
    learningRate: [0.08, 0.14],
    retentionStrength: [0.5, 0.64],
    transferStrength: [0.52, 0.66],
    overexplanationPenalty: [0.06, 0.12],
    slipProbability: [0.05, 0.09],
    guessProbability: [0.04, 0.08],
    paceMultiplier: [0.84, 1.04],
    answerChangeBias: [0.1, 0.2],
    noiseScale: [0.07, 0.12],
    effectiveDepthIndex: 1,
  },
  {
    key: "inconsistent_explorer",
    label: "Inconsistent explorer",
    description:
      "Moderate ability, wider outcome noise, and weaker stability across repetitions and delayed checks.",
    abilityBase: [0.32, 0.56],
    challengeAppetite: [-0.02, 0.12],
    difficultySensitivity: [0.16, 0.24],
    depthSensitivity: [0.12, 0.2],
    learningRate: [0.1, 0.17],
    retentionStrength: [0.44, 0.6],
    transferStrength: [0.46, 0.6],
    overexplanationPenalty: [0.04, 0.1],
    slipProbability: [0.05, 0.1],
    guessProbability: [0.08, 0.14],
    paceMultiplier: [0.9, 1.14],
    answerChangeBias: [0.14, 0.26],
    noiseScale: [0.08, 0.14],
    effectiveDepthIndex: 1,
  },
] as const;

export const SKILL_CATALOG = [
  {
    subjectTitle: "Synthetic Algebra Bridge",
    sectionTitle: "Linear Equations",
    conceptKey: "linear_equations",
    skillKey: "solve_linear_equations",
    intrinsicDifficultyIndex: 1,
    intrinsicDepthNeedIndex: 1,
    topicVariants: [
      "balancing one-step equations",
      "isolating the unknown variable",
      "checking linear equation solutions",
    ],
  },
  {
    subjectTitle: "Synthetic Algebra Bridge",
    sectionTitle: "Fractions",
    conceptKey: "fractions",
    skillKey: "fraction_operations",
    intrinsicDifficultyIndex: 1,
    intrinsicDepthNeedIndex: 2,
    topicVariants: [
      "adding fractions with common denominators",
      "simplifying fraction expressions",
      "comparing fractions in word form",
    ],
  },
  {
    subjectTitle: "Synthetic Geometry Bridge",
    sectionTitle: "Area And Perimeter",
    conceptKey: "area_perimeter",
    skillKey: "measure_area_perimeter",
    intrinsicDifficultyIndex: 0,
    intrinsicDepthNeedIndex: 1,
    topicVariants: [
      "finding rectangle area",
      "distinguishing area from perimeter",
      "multi-step perimeter calculation",
    ],
  },
  {
    subjectTitle: "Synthetic Physics Bridge",
    sectionTitle: "Motion Basics",
    conceptKey: "motion_basics",
    skillKey: "speed_distance_time",
    intrinsicDifficultyIndex: 2,
    intrinsicDepthNeedIndex: 2,
    topicVariants: [
      "interpreting speed-distance-time relationships",
      "basic motion formula substitution",
      "reading motion values from short scenarios",
    ],
  },
  {
    subjectTitle: "Synthetic Statistics Bridge",
    sectionTitle: "Averages",
    conceptKey: "averages",
    skillKey: "compute_mean_median",
    intrinsicDifficultyIndex: 1,
    intrinsicDepthNeedIndex: 1,
    topicVariants: [
      "computing arithmetic mean",
      "distinguishing mean from median",
      "interpreting average values in a dataset",
    ],
  },
  {
    subjectTitle: "Synthetic Reasoning Bridge",
    sectionTitle: "Ratios",
    conceptKey: "ratios",
    skillKey: "ratio_reasoning",
    intrinsicDifficultyIndex: 2,
    intrinsicDepthNeedIndex: 2,
    topicVariants: [
      "interpreting proportional relationships",
      "ratio tables and scaling",
      "multi-step ratio comparison",
    ],
  },
] as const;

const DECISION_CELLS = DIFFICULTY_ORDER.flatMap((difficulty) =>
  DEPTH_ORDER.map((depth) => ({
    difficulty,
    depth,
    key: `${difficulty}|${depth}`,
  })),
);

type LearnerArchetype = (typeof LEARNER_ARCHETYPES)[number];

export type DifficultyValue = (typeof DIFFICULTY_ORDER)[number];
export type DepthValue = (typeof DEPTH_ORDER)[number];
export type PolicyArmValue = (typeof POLICY_ARMS)[number];
export type SyntheticSequenceRole = (typeof SYNTHETIC_SEQUENCE_ROLES)[number];
export type SyntheticSkillCatalogEntry = (typeof SKILL_CATALOG)[number];

export type SyntheticSkillState = {
  mastery: number;
  strengthOffset: number;
  difficultyShift: number;
  depthNeedShift: number;
  retentionShift: number;
  exposureCount: number;
};

export type SyntheticLatentProfile = {
  archetypeKey: LearnerArchetype["key"];
  archetypeLabel: LearnerArchetype["label"];
  archetypeDescription: LearnerArchetype["description"];
  abilityBase: number;
  challengeAppetite: number;
  difficultySensitivity: number;
  depthSensitivity: number;
  learningRate: number;
  retentionStrength: number;
  transferStrength: number;
  overexplanationPenalty: number;
  slipProbability: number;
  guessProbability: number;
  paceMultiplier: number;
  answerChangeBias: number;
  noiseScale: number;
  declaredDifficultyIndex: number;
  declaredDepthIndex: number;
  effectiveDifficultyIndex: number;
  effectiveDepthIndex: number;
  skillState: Record<string, SyntheticSkillState>;
};

export type SyntheticLearnerProfileSummary = {
  learnerIndex: number;
  externalId: string;
  archetypeKey: SyntheticLatentProfile["archetypeKey"];
  abilityBase: number;
  declaredDifficulty: DifficultyValue;
  declaredDepth: DepthValue;
  effectiveDifficulty: DifficultyValue;
  effectiveDepth: DepthValue;
};

export type SyntheticEpisodeTimeline = {
  episodeCreatedAtIso: string;
  precheckDeliveredAtIso: string;
  precheckSubmittedAtIso: string;
  learningContentDeliveredAtIso: string;
  postcheckDeliveredAtIso: string;
  postcheckSubmittedAtIso: string;
  holdoutDeliveredAtIso: string;
  holdoutSubmittedAtIso: string;
  delayedRecheckDeliveredAtIso: string;
  delayedRecheckSubmittedAtIso: string;
  delayedMinutes: number;
};

export type SyntheticEpisodePlan = {
  skill: SyntheticSkillCatalogEntry;
  topic: string;
  policyArm: PolicyArmValue;
  holdoutStrategy: "holdout_unseen" | "isomorphic_same_skill";
  coverageCellKey: string;
  armDecisionMode:
    | "baseline_center_bias"
    | "self_report_blend"
    | "predicted_blend"
    | "coverage_anchor"
    | "hard_novel_depth_probe"
    | "mastered_easy_depth_probe";
  decision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  declaredDecision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  effectiveDecision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  timeline: SyntheticEpisodeTimeline;
};

export type SyntheticRoleOutcome = {
  probability: number;
  accuracy: number;
  totalDurationMs: number;
};

export type SyntheticOutcomeModel = {
  masteryBefore: number;
  masteryAfter: number;
  exposureCountBefore: number;
  novelty: number;
  difficultyCapacity: number;
  depthNeed: number;
  difficultyGap: number;
  depthGap: number;
  hardPenalty: number;
  easyPenalty: number;
  insufficientDepthPenalty: number;
  excessiveDepthPenalty: number;
  learningQuality: number;
  learningGain: number;
  immediateBonus: number;
  transferBonus: number;
  retentionDecay: number;
  roleProbabilities: {
    precheck: number;
    postcheck: number;
    holdout: number;
    delayedRecheck: number;
  };
};

export type SyntheticEpisodeAnalyticsRecord = {
  learnerExternalId: string;
  learnerIndex: number;
  learnerArchetypeKey: SyntheticLatentProfile["archetypeKey"];
  learnerArchetypeLabel: SyntheticLatentProfile["archetypeLabel"];
  learnerAbilityBase: number;
  episodeIndex: number;
  policyArm: PolicyArmValue;
  holdoutStrategy: SyntheticEpisodePlan["holdoutStrategy"];
  subjectTitle: string;
  sectionTitle: string;
  topic: string;
  conceptKey: string;
  skillKey: string;
  coverageCellKey: string;
  armDecisionMode: SyntheticEpisodePlan["armDecisionMode"];
  deliveredDifficulty: DifficultyValue;
  deliveredDepth: DepthValue;
  declaredDifficulty: DifficultyValue;
  declaredDepth: DepthValue;
  effectiveDifficulty: DifficultyValue;
  effectiveDepth: DepthValue;
  masteryBefore: number;
  masteryAfter: number;
  exposureCountBefore: number;
  novelty: number;
  difficultyCapacity: number;
  depthNeed: number;
  difficultyGap: number;
  depthGap: number;
  hardPenalty: number;
  easyPenalty: number;
  insufficientDepthPenalty: number;
  excessiveDepthPenalty: number;
  learningQuality: number;
  learningGain: number;
  immediateBonus: number;
  transferBonus: number;
  retentionDecay: number;
  roleOutcomes: {
    precheck: SyntheticRoleOutcome;
    postcheck: SyntheticRoleOutcome;
    holdout: SyntheticRoleOutcome;
    delayedRecheck: SyntheticRoleOutcome;
  };
  syntheticTimeline: SyntheticEpisodeTimeline;
};

export type SyntheticGenerationSummary = {
  totalEpisodes: number;
  uniqueLearners: number;
  avgAccuracyByRole: Record<string, number | null>;
  avgGainByRole: {
    postcheckMinusPrecheck: number | null;
    holdoutMinusPrecheck: number | null;
    delayedMinusPrecheck: number | null;
  };
  decisionCoverage: Record<
    string,
    {
      episodes: number;
      share: number;
      avgPrecheckAccuracy: number | null;
      avgPostcheckAccuracy: number | null;
      avgHoldoutAccuracy: number | null;
      avgDelayedRecheckAccuracy: number | null;
    }
  >;
  byArm: Record<
    string,
    {
      episodes: number;
      avgPrecheckAccuracy: number | null;
      avgPostcheckAccuracy: number | null;
      avgHoldoutAccuracy: number | null;
      avgDelayedRecheckAccuracy: number | null;
    }
  >;
  bySkill: Record<
    string,
    {
      episodes: number;
      avgLearningGain: number | null;
      avgPostcheckAccuracy: number | null;
      avgHoldoutAccuracy: number | null;
    }
  >;
  byArchetype: Record<
    string,
    {
      learners: number;
      episodes: number;
      avgPrecheckAccuracy: number | null;
      avgPostcheckAccuracy: number | null;
      avgDelayedRecheckAccuracy: number | null;
    }
  >;
};

export type SyntheticDirectionalCheck = {
  key: string;
  status: "pass" | "warn";
  summary: string;
  support: number;
  details: Record<string, number | null>;
};

export type SyntheticSanityReport = {
  schemaVersion: typeof SYNTHETIC_WORLD_SCHEMA_VERSION;
  ok: boolean;
  warnings: string[];
  coverage: {
    difficulty: Record<string, number>;
    depth: Record<string, number>;
    difficultyDepth: Record<string, number>;
    policyArm: Record<string, number>;
    holdoutStrategy: Record<string, number>;
    skillKey: Record<string, number>;
    learnerArchetype: Record<string, number>;
    maxDecisionCellShare: number;
    maxArchetypeShare: number;
  };
  learnerProfileDistribution: {
    count: number;
    byArchetype: Record<string, number>;
    abilityBands: Record<string, number>;
    declaredDifficulty: Record<string, number>;
    effectiveDifficulty: Record<string, number>;
    declaredDepth: Record<string, number>;
    effectiveDepth: Record<string, number>;
  };
  outcomeBaseRates: {
    precheck: number | null;
    postcheck: number | null;
    holdout: number | null;
    delayedRecheck: number | null;
    postcheckMinusPrecheck: number | null;
    holdoutMinusPrecheck: number | null;
    delayedMinusPrecheck: number | null;
  };
  directionalChecks: SyntheticDirectionalCheck[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    centered(scale = 1) {
      return (this.next() - 0.5) * 2 * scale;
    },
    pick<T>(values: readonly T[]) {
      return values[Math.floor(this.next() * values.length)]!;
    },
  };
}

function sampleRange(
  rng: ReturnType<typeof createSeededRandom>,
  range: readonly [number, number],
) {
  return range[0] + (range[1] - range[0]) * rng.next();
}

export function difficultyIndex(value: DifficultyValue) {
  return DIFFICULTY_ORDER.indexOf(value);
}

export function depthIndex(value: DepthValue) {
  return DEPTH_ORDER.indexOf(value);
}

export function difficultyFromIndex(index: number): DifficultyValue {
  return DIFFICULTY_ORDER[clampRange(Math.round(index), 0, DIFFICULTY_ORDER.length - 1)];
}

export function depthFromIndex(index: number): DepthValue {
  return DEPTH_ORDER[clampRange(Math.round(index), 0, DEPTH_ORDER.length - 1)];
}

export function mapDepthIndexToStyle(index: number) {
  const depth = depthFromIndex(index);
  if (depth === "brief") {
    return "concise";
  }
  if (depth === "detailed") {
    return "stepwise";
  }
  return "exploratory";
}

function buildDeclaredIndex(
  effectiveIndex: number,
  rng: ReturnType<typeof createSeededRandom>,
  mismatchProbability: number,
) {
  if (rng.next() >= mismatchProbability) {
    return effectiveIndex;
  }

  const delta = rng.next() < 0.5 ? -1 : 1;
  return clampRange(effectiveIndex + delta, 0, 2);
}

function resolveAbilityBand(value: number) {
  if (value < 0.4) {
    return "low";
  }
  if (value < 0.62) {
    return "medium";
  }
  return "high";
}

function chooseArchetype(learnerIndex: number) {
  return LEARNER_ARCHETYPES[learnerIndex % LEARNER_ARCHETYPES.length]!;
}

export function buildLatentProfile(
  learnerSeed: string,
  learnerIndex: number,
): SyntheticLatentProfile {
  const rng = createSeededRandom(hashString(learnerSeed));
  const archetype = chooseArchetype(learnerIndex);

  const abilityBase = clampRange(sampleRange(rng, archetype.abilityBase), 0.12, 0.9);
  const challengeAppetite = sampleRange(rng, archetype.challengeAppetite);
  const effectiveDifficultyIndex = clampRange(
    Math.round(abilityBase * 2 + challengeAppetite * 1.6 + rng.centered(0.18)),
    0,
    2,
  );
  const effectiveDepthIndex = clampRange(
    Math.round(
      archetype.effectiveDepthIndex +
        (abilityBase < 0.34 ? 0.35 : 0) +
        (abilityBase > 0.72 ? -0.25 : 0) +
        rng.centered(0.22),
    ),
    0,
    2,
  );

  const skillState = Object.fromEntries(
    SKILL_CATALOG.map((skill, skillIndex) => {
      const skillRng = createSeededRandom(
        hashString(`${learnerSeed}:${skill.skillKey}:${skillIndex}`),
      );
      const strengthOffset = clampRange(skillRng.centered(0.2), -0.28, 0.28);
      const mastery = clampRange(
        abilityBase +
          strengthOffset * 0.55 -
          skill.intrinsicDifficultyIndex * 0.06 +
          (skillIndex % 2 === 0 ? 0.02 : -0.01),
        0.08,
        0.9,
      );
      const difficultyShift = clampRange(skillRng.centered(0.75), -0.85, 0.85);
      const depthNeedShift = clampRange(skillRng.centered(0.6), -0.7, 0.7);
      const retentionShift = clampRange(skillRng.centered(0.18), -0.22, 0.22);

      return [
        skill.skillKey,
        {
          mastery,
          strengthOffset,
          difficultyShift,
          depthNeedShift,
          retentionShift,
          exposureCount: 0,
        },
      ];
    }),
  ) as Record<string, SyntheticSkillState>;

  return {
    archetypeKey: archetype.key,
    archetypeLabel: archetype.label,
    archetypeDescription: archetype.description,
    abilityBase,
    challengeAppetite,
    difficultySensitivity: sampleRange(rng, archetype.difficultySensitivity),
    depthSensitivity: sampleRange(rng, archetype.depthSensitivity),
    learningRate: sampleRange(rng, archetype.learningRate),
    retentionStrength: sampleRange(rng, archetype.retentionStrength),
    transferStrength: sampleRange(rng, archetype.transferStrength),
    overexplanationPenalty: sampleRange(rng, archetype.overexplanationPenalty),
    slipProbability: sampleRange(rng, archetype.slipProbability),
    guessProbability: sampleRange(rng, archetype.guessProbability),
    paceMultiplier: sampleRange(rng, archetype.paceMultiplier),
    answerChangeBias: sampleRange(rng, archetype.answerChangeBias),
    noiseScale: sampleRange(rng, archetype.noiseScale),
    declaredDifficultyIndex: buildDeclaredIndex(effectiveDifficultyIndex, rng, 0.34),
    declaredDepthIndex: buildDeclaredIndex(effectiveDepthIndex, rng, 0.38),
    effectiveDifficultyIndex,
    effectiveDepthIndex,
    skillState,
  };
}

function computeEffectiveDecisionState(params: {
  latent: SyntheticLatentProfile;
  skill: SyntheticSkillCatalogEntry;
  skillState: SyntheticSkillState;
}) {
  const novelty = clamp01(1 - params.skillState.exposureCount / 4.5);
  const difficultyCapacity = clampRange(
    params.latent.abilityBase * 0.9 +
      params.skillState.mastery * 0.95 +
      params.latent.challengeAppetite * 0.55 +
      params.skillState.difficultyShift * 0.22 -
      params.skill.intrinsicDifficultyIndex * 0.08,
    0,
    2,
  );
  const effectiveDifficultyIndex = clampRange(
    Math.round(difficultyCapacity),
    0,
    2,
  );
  const depthNeed = clampRange(
    params.latent.effectiveDepthIndex * 0.55 +
      params.skill.intrinsicDepthNeedIndex * 0.42 +
      params.skillState.depthNeedShift * 0.46 +
      novelty * 0.68 +
      Math.max(0, params.skill.intrinsicDifficultyIndex - 0.5) * 0.24 +
      (0.58 - params.skillState.mastery) * 0.34,
    0,
    2,
  );
  const effectiveDepthIndex = clampRange(Math.round(depthNeed), 0, 2);

  return {
    novelty,
    difficultyCapacity,
    depthNeed,
    effectiveDifficultyIndex,
    effectiveDepthIndex,
  };
}

function buildEpisodeTimeline(params: {
  learnerIndex: number;
  episodeIndex: number;
  episodesPerLearner: number;
}) {
  const latestEpisodeOffsetDays = Math.max(0, params.episodesPerLearner - 1);
  const anchor = new Date(
    Date.now() - (latestEpisodeOffsetDays + 6) * DAY_MS,
  );
  const learnerHourOffset =
    (params.learnerIndex % 6) * 2 + Math.floor(params.learnerIndex / 6) * 0.35;
  const base = new Date(
    anchor.getTime() +
      params.episodeIndex * DAY_MS +
      learnerHourOffset * 60 * 60 * 1000,
  );

  const precheckDeliveredAt = new Date(base.getTime() + 5 * 60 * 1000);
  const precheckSubmittedAt = new Date(base.getTime() + 13 * 60 * 1000);
  const learningContentDeliveredAt = new Date(base.getTime() + 28 * 60 * 1000);
  const postcheckDeliveredAt = new Date(base.getTime() + 78 * 60 * 1000);
  const postcheckSubmittedAt = new Date(base.getTime() + 88 * 60 * 1000);
  const holdoutDeliveredAt = new Date(base.getTime() + DAY_MS + 22 * 60 * 1000);
  const holdoutSubmittedAt = new Date(base.getTime() + DAY_MS + 34 * 60 * 1000);
  const delayedRecheckDeliveredAt = new Date(
    base.getTime() + 3 * DAY_MS + 42 * 60 * 1000,
  );
  const delayedRecheckSubmittedAt = new Date(
    base.getTime() + 3 * DAY_MS + 54 * 60 * 1000,
  );

  return {
    episodeCreatedAtIso: base.toISOString(),
    precheckDeliveredAtIso: precheckDeliveredAt.toISOString(),
    precheckSubmittedAtIso: precheckSubmittedAt.toISOString(),
    learningContentDeliveredAtIso: learningContentDeliveredAt.toISOString(),
    postcheckDeliveredAtIso: postcheckDeliveredAt.toISOString(),
    postcheckSubmittedAtIso: postcheckSubmittedAt.toISOString(),
    holdoutDeliveredAtIso: holdoutDeliveredAt.toISOString(),
    holdoutSubmittedAtIso: holdoutSubmittedAt.toISOString(),
    delayedRecheckDeliveredAtIso: delayedRecheckDeliveredAt.toISOString(),
    delayedRecheckSubmittedAtIso: delayedRecheckSubmittedAt.toISOString(),
    delayedMinutes: SYNTHETIC_DELAYED_RECHECK_MINUTES,
  } satisfies SyntheticEpisodeTimeline;
}

function buildCoverageCellIndex(params: {
  learnerIndex: number;
  episodeIndex: number;
  skill: SyntheticSkillCatalogEntry;
}) {
  return (
    params.learnerIndex * 5 +
    params.episodeIndex * 2 +
    params.skill.intrinsicDifficultyIndex * 3 +
    params.skill.intrinsicDepthNeedIndex
  ) % DECISION_CELLS.length;
}

function blendIndex(params: {
  coverageIndex: number;
  targetIndex: number;
  weight: number;
  rng: ReturnType<typeof createSeededRandom>;
}) {
  return clampRange(
    Math.round(
      params.coverageIndex * (1 - params.weight) +
        params.targetIndex * params.weight +
        params.rng.centered(0.18),
    ),
    0,
    2,
  );
}

export function buildEpisodePlan(params: {
  learnerSeed: string;
  learnerIndex: number;
  episodeIndex: number;
  episodesPerLearner: number;
  latent: SyntheticLatentProfile;
}): SyntheticEpisodePlan {
  const skill =
    SKILL_CATALOG[
      (params.episodeIndex + params.learnerIndex * 2) % SKILL_CATALOG.length
    ]!;
  const skillState = params.latent.skillState[skill.skillKey]!;
  const effectiveState = computeEffectiveDecisionState({
    latent: params.latent,
    skill,
    skillState,
  });
  const declaredDifficultyIndex = clampRange(
    Math.round(params.latent.declaredDifficultyIndex + skillState.difficultyShift * 0.15),
    0,
    2,
  );
  const declaredDepthIndex = clampRange(
    Math.round(
      params.latent.declaredDepthIndex +
        skillState.depthNeedShift * 0.2 +
        effectiveState.novelty * 0.1,
    ),
    0,
    2,
  );
  const policyArm =
    POLICY_ARMS[(params.learnerIndex + params.episodeIndex) % POLICY_ARMS.length]!;
  const coverageCell =
    DECISION_CELLS[
      buildCoverageCellIndex({
        learnerIndex: params.learnerIndex,
        episodeIndex: params.episodeIndex,
        skill,
      })
    ]!;
  const decisionRng = createSeededRandom(
    hashString(
      `${params.learnerSeed}:${params.episodeIndex}:${skill.skillKey}:${policyArm}:decision`,
    ),
  );

  let difficultyIdx = difficultyIndex(coverageCell.difficulty);
  let depthIdx = depthIndex(coverageCell.depth);
  let armDecisionMode: SyntheticEpisodePlan["armDecisionMode"] = "coverage_anchor";

  if (policyArm === "baseline") {
    armDecisionMode = "baseline_center_bias";
    difficultyIdx = blendIndex({
      coverageIndex: difficultyIdx,
      targetIndex: 1,
      weight: params.episodeIndex % 4 === 0 ? 0 : 0.46,
      rng: decisionRng,
    });
    depthIdx = blendIndex({
      coverageIndex: depthIdx,
      targetIndex: 1,
      weight: params.episodeIndex % 4 === 0 ? 0 : 0.42,
      rng: decisionRng,
    });
  } else if (policyArm === "self_report") {
    armDecisionMode = params.episodeIndex % 3 === 0 ? "coverage_anchor" : "self_report_blend";
    if (armDecisionMode === "self_report_blend") {
      difficultyIdx = blendIndex({
        coverageIndex: difficultyIdx,
        targetIndex: declaredDifficultyIndex,
        weight: 0.7,
        rng: decisionRng,
      });
      depthIdx = blendIndex({
        coverageIndex: depthIdx,
        targetIndex: declaredDepthIndex,
        weight: 0.68,
        rng: decisionRng,
      });
    }
  } else {
    armDecisionMode = params.episodeIndex % 5 === 0 ? "coverage_anchor" : "predicted_blend";
    if (armDecisionMode === "predicted_blend") {
      difficultyIdx = blendIndex({
        coverageIndex: difficultyIdx,
        targetIndex: effectiveState.effectiveDifficultyIndex,
        weight: 0.76,
        rng: decisionRng,
      });
      depthIdx = blendIndex({
        coverageIndex: depthIdx,
        targetIndex: effectiveState.effectiveDepthIndex,
        weight: 0.72,
        rng: decisionRng,
      });
    }
  }

  const probeSeed =
    params.learnerIndex + params.episodeIndex + skill.intrinsicDepthNeedIndex;
  const hardNovelProbeEligible =
    armDecisionMode === "coverage_anchor" &&
    effectiveState.novelty >= 0.4 &&
    skill.intrinsicDifficultyIndex >= 1;
  const masteredEasyProbeEligible =
    armDecisionMode === "coverage_anchor" && skillState.mastery >= 0.72;

  // Русский комментарий: внутренние probe-эпизоды дают контролируемые срезы по depth/difficulty.
  if (hardNovelProbeEligible && probeSeed % 2 === 0) {
    difficultyIdx = 2;
    depthIdx = probeSeed % DEPTH_ORDER.length;
    armDecisionMode = "hard_novel_depth_probe";
  } else if (masteredEasyProbeEligible && probeSeed % 3 === 1) {
    difficultyIdx = 0;
    depthIdx = (probeSeed % 2) + 1;
    armDecisionMode = "mastered_easy_depth_probe";
  }

  return {
    skill,
    topic:
      skill.topicVariants[
        (params.episodeIndex + params.learnerIndex) % skill.topicVariants.length
      ]!,
    policyArm,
    holdoutStrategy:
      (params.learnerIndex + params.episodeIndex) % 2 === 0
        ? "holdout_unseen"
        : "isomorphic_same_skill",
    coverageCellKey: coverageCell.key,
    armDecisionMode,
    decision: {
      difficulty: difficultyFromIndex(difficultyIdx),
      depth: depthFromIndex(depthIdx),
    },
    declaredDecision: {
      difficulty: difficultyFromIndex(declaredDifficultyIndex),
      depth: depthFromIndex(declaredDepthIndex),
    },
    effectiveDecision: {
      difficulty: difficultyFromIndex(effectiveState.effectiveDifficultyIndex),
      depth: depthFromIndex(effectiveState.effectiveDepthIndex),
    },
    timeline: buildEpisodeTimeline({
      learnerIndex: params.learnerIndex,
      episodeIndex: params.episodeIndex,
      episodesPerLearner: params.episodesPerLearner,
    }),
  };
}

function probabilityFromLatentScore(params: {
  latentScore: number;
  guessProbability: number;
  slipProbability: number;
}) {
  return clamp01(
    params.guessProbability +
      (1 - params.guessProbability - params.slipProbability) *
        sigmoid(params.latentScore),
  );
}

export function buildOutcomeModel(params: {
  learnerSeed: string;
  episodeIndex: number;
  latent: SyntheticLatentProfile;
  skill: SyntheticSkillCatalogEntry;
  skillState: SyntheticSkillState;
  decision: {
    difficulty: DifficultyValue;
    depth: DepthValue;
  };
  holdoutStrategy: SyntheticEpisodePlan["holdoutStrategy"];
}) {
  const rng = createSeededRandom(
    hashString(
      `${params.learnerSeed}:${params.episodeIndex}:${params.skill.skillKey}:${params.decision.difficulty}:${params.decision.depth}:outcome`,
    ),
  );
  const effectiveState = computeEffectiveDecisionState({
    latent: params.latent,
    skill: params.skill,
    skillState: params.skillState,
  });
  const masteryBefore = params.skillState.mastery;
  const difficultyGap =
    difficultyIndex(params.decision.difficulty) - effectiveState.difficultyCapacity;
  const depthGap = depthIndex(params.decision.depth) - effectiveState.depthNeed;
  const hardPenalty =
    Math.max(0, difficultyGap) *
    (0.62 + params.latent.difficultySensitivity + effectiveState.novelty * 0.08);
  const easyPenalty =
    Math.max(0, -difficultyGap) *
    (0.18 + Math.max(0, params.latent.challengeAppetite) * 0.08);
  const insufficientDepthPenalty =
    Math.max(0, -depthGap) *
    (0.28 + params.latent.depthSensitivity + effectiveState.novelty * 0.12);
  const excessiveDepthPenalty =
    Math.max(0, depthGap) *
    (0.1 +
      params.latent.overexplanationPenalty +
      Math.max(0, masteryBefore - 0.58) * 0.14);
  const masteredEasyDetailedPenalty =
    params.decision.difficulty === "easy" &&
    masteryBefore >= 0.72 &&
    params.decision.depth === "detailed"
      ? 0.18 +
        params.latent.overexplanationPenalty * 0.22 +
        Math.max(0, masteryBefore - 0.72) * 0.16
      : 0;
  const stretchBonus =
    difficultyGap >= 0 && difficultyGap <= 0.5
      ? 0.08 + params.latent.challengeAppetite * 0.04
      : 0;
  const depthAlignmentBonus = Math.abs(depthGap) <= 0.45 ? 0.09 : 0;
  const hardNovelDepthAdjustment =
    params.decision.difficulty === "hard"
      ? params.decision.depth === "detailed"
        ? 0.34 + effectiveState.novelty * 0.12
        : params.decision.depth === "standard"
          ? 0.08 + effectiveState.novelty * 0.04
          : -0.24 - effectiveState.novelty * 0.08
      : 0;
  const promptSupport =
    params.decision.depth === "detailed" && effectiveState.novelty > 0.35
      ? 0.08
      : params.decision.depth === "brief" && masteryBefore > 0.72
        ? 0.05
        : 0;
  const baseCompetence =
    params.latent.abilityBase * 0.52 +
    masteryBefore * 1.08 +
    params.skillState.strengthOffset * 0.32 -
    params.skill.intrinsicDifficultyIndex * 0.12;

  const precheckProbability = probabilityFromLatentScore({
    latentScore:
      2.8 * baseCompetence -
      hardPenalty * 1.24 -
      easyPenalty * 0.18 -
      insufficientDepthPenalty * 0.34 -
      excessiveDepthPenalty * 0.08 +
      promptSupport -
      Math.max(0, hardNovelDepthAdjustment * 0.18) +
      -0.55 +
      rng.centered(params.latent.noiseScale),
    guessProbability: params.latent.guessProbability,
    slipProbability: params.latent.slipProbability,
  });

  const learningQuality = clampRange(
    0.92 +
      stretchBonus +
      depthAlignmentBonus -
      hardPenalty * 0.72 -
      easyPenalty * 0.28 -
      insufficientDepthPenalty * 0.88 -
      excessiveDepthPenalty * 0.3 +
      -masteredEasyDetailedPenalty * 0.72 +
      hardNovelDepthAdjustment * 0.62,
    0.18,
    1.34,
  );
  const needFactor = clampRange(
    0.72 + effectiveState.novelty * 0.32 + (1 - precheckProbability) * 0.28,
    0.5,
    1.3,
  );
  const learningGain = clampRange(
    params.latent.learningRate *
      (1 - masteryBefore) *
      learningQuality *
      needFactor +
      rng.centered(params.latent.noiseScale * 0.18),
    0,
    0.32,
  );
  const immediateBonus = clampRange(
    0.04 + Math.max(0, learningQuality - 0.82) * 0.08,
    0.02,
    0.12,
  );
  const transferBonus = clampRange(
    params.latent.transferStrength *
      Math.max(0, learningQuality - 0.58) *
      (0.22 + effectiveState.novelty * 0.22),
    0,
    0.16,
  );
  const retentionDecay = clampRange(
    (1 - params.latent.retentionStrength) * 0.16 +
      hardPenalty * 0.05 +
      excessiveDepthPenalty * 0.03 -
      depthAlignmentBonus * 0.02 -
      params.skillState.retentionShift * 0.03,
    0.03,
    0.22,
  );
  const masteryAfter = clampRange(
    masteryBefore + learningGain * 0.72 + Math.max(0, transferBonus - retentionDecay * 0.1),
    0.05,
    0.98,
  );

  const postcheckProbability = probabilityFromLatentScore({
    latentScore:
      3.05 * (baseCompetence + learningGain + immediateBonus) -
      hardPenalty * 0.95 -
      easyPenalty * 0.12 -
      insufficientDepthPenalty * 0.24 -
      excessiveDepthPenalty * 0.08 +
      -masteredEasyDetailedPenalty * 0.96 +
      hardNovelDepthAdjustment * 0.92 +
      -0.46 +
      rng.centered(params.latent.noiseScale * 0.9),
    guessProbability: params.latent.guessProbability,
    slipProbability: params.latent.slipProbability,
  });

  const holdoutStrategyPenalty =
    params.holdoutStrategy === "holdout_unseen" ? 0.11 : 0.06;
  const holdoutProbability = probabilityFromLatentScore({
    latentScore:
      3 *
        (baseCompetence + learningGain * 0.92 + transferBonus - holdoutStrategyPenalty) -
      hardPenalty * 1.02 -
      insufficientDepthPenalty * 0.28 -
      excessiveDepthPenalty * 0.06 -
      masteredEasyDetailedPenalty * -0.82 +
      effectiveState.novelty * 0.16 +
      hardNovelDepthAdjustment * 0.8 +
      -0.56 +
      rng.centered(params.latent.noiseScale),
    guessProbability: params.latent.guessProbability,
    slipProbability: params.latent.slipProbability + 0.01,
  });

  const delayedProbability = probabilityFromLatentScore({
    latentScore:
      2.92 *
        (baseCompetence + learningGain * 0.84 + transferBonus * 0.7 - retentionDecay) -
      hardPenalty * 1.04 -
      insufficientDepthPenalty * 0.32 -
      excessiveDepthPenalty * 0.08 -
      masteredEasyDetailedPenalty * -0.7 +
      effectiveState.novelty * 0.18 +
      hardNovelDepthAdjustment * 0.72 +
      -0.66 +
      rng.centered(params.latent.noiseScale * 1.08),
    guessProbability: params.latent.guessProbability,
    slipProbability: clampRange(params.latent.slipProbability + 0.015, 0.02, 0.18),
  });

  return {
    masteryBefore,
    masteryAfter,
    exposureCountBefore: params.skillState.exposureCount,
    novelty: effectiveState.novelty,
    difficultyCapacity: effectiveState.difficultyCapacity,
    depthNeed: effectiveState.depthNeed,
    difficultyGap,
    depthGap,
    hardPenalty,
    easyPenalty,
    insufficientDepthPenalty,
    excessiveDepthPenalty,
    learningQuality,
    learningGain,
    immediateBonus,
    transferBonus,
    retentionDecay,
    roleProbabilities: {
      precheck: precheckProbability,
      postcheck: postcheckProbability,
      holdout: holdoutProbability,
      delayedRecheck: delayedProbability,
    },
  } satisfies SyntheticOutcomeModel;
}

export function applyObservedEpisodeUpdate(params: {
  skillState: SyntheticSkillState;
  outcomeModel: SyntheticOutcomeModel;
  precheckAccuracy: number;
  postcheckAccuracy: number;
  holdoutAccuracy: number;
  delayedRecheckAccuracy: number;
}) {
  const observedImprovement =
    params.postcheckAccuracy * 0.48 +
    params.holdoutAccuracy * 0.32 +
    params.delayedRecheckAccuracy * 0.2 -
    params.precheckAccuracy;

  params.skillState.mastery = clampRange(
    params.outcomeModel.masteryBefore +
      params.outcomeModel.learningGain * 0.74 +
      Math.max(0, observedImprovement) * 0.1 -
      Math.max(0, params.precheckAccuracy - params.postcheckAccuracy) * 0.04,
    0.05,
    0.99,
  );
  params.skillState.exposureCount += 1;
}

export function buildLearnerProfileSummary(params: {
  learnerIndex: number;
  externalId: string;
  latent: SyntheticLatentProfile;
}) {
  return {
    learnerIndex: params.learnerIndex,
    externalId: params.externalId,
    archetypeKey: params.latent.archetypeKey,
    abilityBase: params.latent.abilityBase,
    declaredDifficulty: difficultyFromIndex(params.latent.declaredDifficultyIndex),
    declaredDepth: depthFromIndex(params.latent.declaredDepthIndex),
    effectiveDifficulty: difficultyFromIndex(params.latent.effectiveDifficultyIndex),
    effectiveDepth: depthFromIndex(params.latent.effectiveDepthIndex),
  } satisfies SyntheticLearnerProfileSummary;
}

function countBy<T extends string>(values: T[]) {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function averageAccuracy(
  records: SyntheticEpisodeAnalyticsRecord[],
  role: keyof SyntheticEpisodeAnalyticsRecord["roleOutcomes"],
) {
  return average(records.map((record) => record.roleOutcomes[role].accuracy));
}

export function buildGenerationSummary(records: SyntheticEpisodeAnalyticsRecord[]) {
  const byArm = Object.fromEntries(
    POLICY_ARMS.map((arm) => {
      const subset = records.filter((record) => record.policyArm === arm);
      return [
        arm,
        {
          episodes: subset.length,
          avgPrecheckAccuracy: averageAccuracy(subset, "precheck"),
          avgPostcheckAccuracy: averageAccuracy(subset, "postcheck"),
          avgHoldoutAccuracy: averageAccuracy(subset, "holdout"),
          avgDelayedRecheckAccuracy: averageAccuracy(subset, "delayedRecheck"),
        },
      ];
    }),
  );

  const bySkill = Object.fromEntries(
    [...new Set(records.map((record) => record.skillKey))].map((skillKey) => {
      const subset = records.filter((record) => record.skillKey === skillKey);
      return [
        skillKey,
        {
          episodes: subset.length,
          avgLearningGain: average(subset.map((record) => record.learningGain)),
          avgPostcheckAccuracy: averageAccuracy(subset, "postcheck"),
          avgHoldoutAccuracy: averageAccuracy(subset, "holdout"),
        },
      ];
    }),
  );

  const learnerByArchetype = new Map<string, Set<string>>();
  for (const record of records) {
    const bucket = learnerByArchetype.get(record.learnerArchetypeKey) ?? new Set<string>();
    bucket.add(record.learnerExternalId);
    learnerByArchetype.set(record.learnerArchetypeKey, bucket);
  }

  const byArchetype = Object.fromEntries(
    [...learnerByArchetype.entries()].map(([archetypeKey, learnerRefs]) => {
      const subset = records.filter((record) => record.learnerArchetypeKey === archetypeKey);
      return [
        archetypeKey,
        {
          learners: learnerRefs.size,
          episodes: subset.length,
          avgPrecheckAccuracy: averageAccuracy(subset, "precheck"),
          avgPostcheckAccuracy: averageAccuracy(subset, "postcheck"),
          avgDelayedRecheckAccuracy: averageAccuracy(subset, "delayedRecheck"),
        },
      ];
    }),
  );

  const decisionCoverage = Object.fromEntries(
    DECISION_CELLS.map((cell) => {
      const subset = records.filter(
        (record) =>
          record.deliveredDifficulty === cell.difficulty &&
          record.deliveredDepth === cell.depth,
      );
      return [
        cell.key,
        {
          episodes: subset.length,
          share: records.length > 0 ? subset.length / records.length : 0,
          avgPrecheckAccuracy: averageAccuracy(subset, "precheck"),
          avgPostcheckAccuracy: averageAccuracy(subset, "postcheck"),
          avgHoldoutAccuracy: averageAccuracy(subset, "holdout"),
          avgDelayedRecheckAccuracy: averageAccuracy(subset, "delayedRecheck"),
        },
      ];
    }),
  );

  return {
    totalEpisodes: records.length,
    uniqueLearners: new Set(records.map((record) => record.learnerExternalId)).size,
    avgAccuracyByRole: {
      precheck: averageAccuracy(records, "precheck"),
      postcheck: averageAccuracy(records, "postcheck"),
      holdout: averageAccuracy(records, "holdout"),
      delayedRecheck: averageAccuracy(records, "delayedRecheck"),
    },
    avgGainByRole: {
      postcheckMinusPrecheck: average(
        records.map(
          (record) =>
            record.roleOutcomes.postcheck.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
      holdoutMinusPrecheck: average(
        records.map(
          (record) =>
            record.roleOutcomes.holdout.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
      delayedMinusPrecheck: average(
        records.map(
          (record) =>
            record.roleOutcomes.delayedRecheck.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
    },
    decisionCoverage,
    byArm,
    bySkill,
    byArchetype,
  } satisfies SyntheticGenerationSummary;
}

function countDecisionCoverage(records: SyntheticEpisodeAnalyticsRecord[]) {
  return countBy(
    records.map(
      (record) => `${record.deliveredDifficulty}|${record.deliveredDepth}`,
    ),
  );
}

function countAbilityBands(learners: SyntheticLearnerProfileSummary[]) {
  return countBy(learners.map((learner) => resolveAbilityBand(learner.abilityBase)));
}

function computeDirectionalChecks(records: SyntheticEpisodeAnalyticsRecord[]) {
  const lowMastery = records.filter((record) => record.masteryBefore < 0.45);
  const easyLowMastery = lowMastery.filter(
    (record) => record.deliveredDifficulty === "easy",
  );
  const mediumLowMastery = lowMastery.filter(
    (record) => record.deliveredDifficulty === "medium",
  );
  const hardLowMastery = lowMastery.filter(
    (record) => record.deliveredDifficulty === "hard",
  );
  const lowMasteryCheck = {
    key: "difficulty_effect_low_mastery_precheck",
    support: lowMastery.length,
    details: {
      easy: averageAccuracy(easyLowMastery, "precheck"),
      medium: averageAccuracy(mediumLowMastery, "precheck"),
      hard: averageAccuracy(hardLowMastery, "precheck"),
    },
  };

  const hardNovel = records.filter(
    (record) =>
      record.novelty >= 0.4 &&
      record.deliveredDifficulty === "hard" &&
      record.masteryBefore >= 0.25 &&
      record.masteryBefore < 0.65,
  );
  const hardNovelBrief = hardNovel.filter((record) => record.deliveredDepth === "brief");
  const hardNovelStandard = hardNovel.filter(
    (record) => record.deliveredDepth === "standard",
  );
  const hardNovelDetailed = hardNovel.filter(
    (record) => record.deliveredDepth === "detailed",
  );
  const depthCheck = {
    key: "depth_effect_hard_novel_postcheck",
    support: hardNovel.length,
    details: {
      briefSupport: hardNovelBrief.length,
      brief: averageAccuracy(hardNovelBrief, "postcheck"),
      standardSupport: hardNovelStandard.length,
      standard: averageAccuracy(hardNovelStandard, "postcheck"),
      detailedSupport: hardNovelDetailed.length,
      detailed: averageAccuracy(hardNovelDetailed, "postcheck"),
    },
  };

  const masteredEasy = records.filter(
    (record) => record.masteryBefore >= 0.72 && record.deliveredDifficulty === "easy",
  );
  const masteredEasyStandard = masteredEasy.filter(
    (record) => record.deliveredDepth === "standard",
  );
  const masteredEasyDetailed = masteredEasy.filter(
    (record) => record.deliveredDepth === "detailed",
  );
  const overdepthCheck = {
    key: "overdepth_cost_mastered_easy",
    support: masteredEasy.length,
    details: {
      standardAccuracy: averageAccuracy(masteredEasyStandard, "postcheck"),
      detailedAccuracy: averageAccuracy(masteredEasyDetailed, "postcheck"),
      standardDurationMs: average(
        masteredEasyStandard.map(
          (record) => record.roleOutcomes.postcheck.totalDurationMs,
        ),
      ),
      detailedDurationMs: average(
        masteredEasyDetailed.map(
          (record) => record.roleOutcomes.postcheck.totalDurationMs,
        ),
      ),
    },
  };

  const roleSeparationCheck = {
    key: "role_separation_overall",
    support: records.length,
    details: {
      precheck: averageAccuracy(records, "precheck"),
      postcheck: averageAccuracy(records, "postcheck"),
      holdout: averageAccuracy(records, "holdout"),
      delayedRecheck: averageAccuracy(records, "delayedRecheck"),
    },
  };

  const distanceByArm = Object.fromEntries(
    POLICY_ARMS.map((arm) => {
      const subset = records.filter((record) => record.policyArm === arm);
      return [
        arm,
        average(
          subset.map((record) => {
            return (
              Math.abs(
                difficultyIndex(record.deliveredDifficulty) -
                  difficultyIndex(record.effectiveDifficulty),
              ) +
              Math.abs(
                depthIndex(record.deliveredDepth) - depthIndex(record.effectiveDepth),
              )
            );
          }),
        ),
      ];
    }),
  ) as Record<string, number | null>;
  const armAlignmentCheck = {
    key: "predicted_arm_alignment",
    support: records.length,
    details: distanceByArm,
  };

  const maxDecisionCellShare =
    Math.max(...Object.values(countDecisionCoverage(records)).map((count) => count / records.length));
  const dominanceCheck = {
    key: "decision_cell_dominance",
    support: records.length,
    details: {
      maxDecisionCellShare,
    },
  };

  const checks: SyntheticDirectionalCheck[] = [];

  const lowMasteryPass =
    (lowMasteryCheck.details.easy ?? 0) >
      (lowMasteryCheck.details.medium ?? 0) &&
    (lowMasteryCheck.details.medium ?? 0) >
      (lowMasteryCheck.details.hard ?? 0);
  checks.push({
    key: lowMasteryCheck.key,
    status: lowMasteryPass ? "pass" : "warn",
    support: lowMasteryCheck.support,
    summary:
      "Low-mastery learners should have lower precheck success as difficulty increases.",
    details: lowMasteryCheck.details,
  });

  const depthPass =
    (depthCheck.details.standard ?? 0) >= (depthCheck.details.brief ?? 0) + 0.02 &&
    (depthCheck.details.detailed ?? 0) >= (depthCheck.details.brief ?? 0) + 0.02;
  checks.push({
    key: depthCheck.key,
    status: depthPass ? "pass" : "warn",
    support: depthCheck.support,
    summary:
      "In a controlled hard-and-novel slice, brief depth should underperform standard or detailed guidance at postcheck.",
    details: depthCheck.details,
  });

  const overdepthPass =
    (overdepthCheck.details.detailedDurationMs ?? 0) >
      (overdepthCheck.details.standardDurationMs ?? 0) &&
    (overdepthCheck.details.detailedAccuracy ?? 0) <=
      (overdepthCheck.details.standardAccuracy ?? 0) + 0.06;
  checks.push({
    key: overdepthCheck.key,
    status: overdepthPass ? "pass" : "warn",
    support: overdepthCheck.support,
    summary:
      "Excessive depth on easy mastered material should carry time cost without clear accuracy gain.",
    details: overdepthCheck.details,
  });

  const rolePass =
    (roleSeparationCheck.details.postcheck ?? 0) >
      (roleSeparationCheck.details.precheck ?? 0) &&
    (roleSeparationCheck.details.holdout ?? 0) <
      (roleSeparationCheck.details.postcheck ?? 0) &&
    (roleSeparationCheck.details.delayedRecheck ?? 0) <=
      (roleSeparationCheck.details.holdout ?? 0);
  checks.push({
    key: roleSeparationCheck.key,
    status: rolePass ? "pass" : "warn",
    support: roleSeparationCheck.support,
    summary:
      "Immediate postcheck should outperform precheck, while holdout and delayed checks should be harder than postcheck.",
    details: roleSeparationCheck.details,
  });

  const armPass =
    (armAlignmentCheck.details.predicted ?? Number.POSITIVE_INFINITY) <
      (armAlignmentCheck.details.self_report ?? Number.POSITIVE_INFINITY) &&
    (armAlignmentCheck.details.predicted ?? Number.POSITIVE_INFINITY) <
      (armAlignmentCheck.details.baseline ?? Number.POSITIVE_INFINITY);
  checks.push({
    key: armAlignmentCheck.key,
    status: armPass ? "pass" : "warn",
    support: armAlignmentCheck.support,
    summary:
      "Predicted arm should be closer to effective difficulty/depth targets than self-report or baseline.",
    details: armAlignmentCheck.details,
  });

  const dominancePass = (dominanceCheck.details.maxDecisionCellShare ?? 1) <= 0.32;
  checks.push({
    key: dominanceCheck.key,
    status: dominancePass ? "pass" : "warn",
    support: dominanceCheck.support,
    summary: "No single difficulty-depth cell should dominate the dataset.",
    details: dominanceCheck.details,
  });

  return checks;
}

export function buildSanityReport(params: {
  learners: SyntheticLearnerProfileSummary[];
  records: SyntheticEpisodeAnalyticsRecord[];
}) {
  const difficultyCoverage = countBy(
    params.records.map((record) => record.deliveredDifficulty),
  );
  const depthCoverage = countBy(params.records.map((record) => record.deliveredDepth));
  const difficultyDepthCoverage = countDecisionCoverage(params.records);
  const policyArmCoverage = countBy(params.records.map((record) => record.policyArm));
  const holdoutCoverage = countBy(
    params.records.map((record) => record.holdoutStrategy),
  );
  const skillCoverage = countBy(params.records.map((record) => record.skillKey));
  const learnerArchetypeCoverage = countBy(
    params.records.map((record) => record.learnerArchetypeKey),
  );

  const learnerProfileDistribution = {
    count: params.learners.length,
    byArchetype: countBy(params.learners.map((learner) => learner.archetypeKey)),
    abilityBands: countAbilityBands(params.learners),
    declaredDifficulty: countBy(
      params.learners.map((learner) => learner.declaredDifficulty),
    ),
    effectiveDifficulty: countBy(
      params.learners.map((learner) => learner.effectiveDifficulty),
    ),
    declaredDepth: countBy(params.learners.map((learner) => learner.declaredDepth)),
    effectiveDepth: countBy(params.learners.map((learner) => learner.effectiveDepth)),
  };

  const directionalChecks = computeDirectionalChecks(params.records);
  const warnings = directionalChecks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.key}: ${check.summary}`);

  const maxDecisionCellShare =
    params.records.length > 0
      ? Math.max(
          ...Object.values(difficultyDepthCoverage).map(
            (count) => count / params.records.length,
          ),
        )
      : 0;
  const maxArchetypeShare =
    params.learners.length > 0
      ? Math.max(
          ...Object.values(learnerProfileDistribution.byArchetype).map(
            (count) => count / params.learners.length,
          ),
        )
      : 0;

  return {
    schemaVersion: SYNTHETIC_WORLD_SCHEMA_VERSION,
    ok: warnings.length === 0,
    warnings,
    coverage: {
      difficulty: difficultyCoverage,
      depth: depthCoverage,
      difficultyDepth: difficultyDepthCoverage,
      policyArm: policyArmCoverage,
      holdoutStrategy: holdoutCoverage,
      skillKey: skillCoverage,
      learnerArchetype: learnerArchetypeCoverage,
      maxDecisionCellShare,
      maxArchetypeShare,
    },
    learnerProfileDistribution,
    outcomeBaseRates: {
      precheck: averageAccuracy(params.records, "precheck"),
      postcheck: averageAccuracy(params.records, "postcheck"),
      holdout: averageAccuracy(params.records, "holdout"),
      delayedRecheck: averageAccuracy(params.records, "delayedRecheck"),
      postcheckMinusPrecheck: average(
        params.records.map(
          (record) =>
            record.roleOutcomes.postcheck.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
      holdoutMinusPrecheck: average(
        params.records.map(
          (record) =>
            record.roleOutcomes.holdout.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
      delayedMinusPrecheck: average(
        params.records.map(
          (record) =>
            record.roleOutcomes.delayedRecheck.accuracy -
            record.roleOutcomes.precheck.accuracy,
        ),
      ),
    },
    directionalChecks,
  } satisfies SyntheticSanityReport;
}

export function buildSanityMarkdown(report: SyntheticSanityReport) {
  const lines = [
    "# EduAI Native Synthetic World Sanity Report",
    "",
    `- Schema: \`${report.schemaVersion}\``,
    `- Status: ${report.ok ? "ok" : "warnings"}`,
    `- Max decision-cell share: ${report.coverage.maxDecisionCellShare.toFixed(3)}`,
    `- Max learner-archetype share: ${report.coverage.maxArchetypeShare.toFixed(3)}`,
    "",
    "## Coverage",
    "",
    `- Difficulty: ${JSON.stringify(report.coverage.difficulty)}`,
    `- Depth: ${JSON.stringify(report.coverage.depth)}`,
    `- Difficulty-depth: ${JSON.stringify(report.coverage.difficultyDepth)}`,
    `- Policy arms: ${JSON.stringify(report.coverage.policyArm)}`,
    `- Holdout strategies: ${JSON.stringify(report.coverage.holdoutStrategy)}`,
    `- Skills: ${JSON.stringify(report.coverage.skillKey)}`,
    `- Learner archetypes: ${JSON.stringify(report.coverage.learnerArchetype)}`,
    "",
    "## Outcome Base Rates",
    "",
    `- Precheck: ${report.outcomeBaseRates.precheck?.toFixed(4) ?? "n/a"}`,
    `- Postcheck: ${report.outcomeBaseRates.postcheck?.toFixed(4) ?? "n/a"}`,
    `- Holdout: ${report.outcomeBaseRates.holdout?.toFixed(4) ?? "n/a"}`,
    `- Delayed recheck: ${report.outcomeBaseRates.delayedRecheck?.toFixed(4) ?? "n/a"}`,
    `- Postcheck - precheck: ${report.outcomeBaseRates.postcheckMinusPrecheck?.toFixed(4) ?? "n/a"}`,
    `- Holdout - precheck: ${report.outcomeBaseRates.holdoutMinusPrecheck?.toFixed(4) ?? "n/a"}`,
    `- Delayed - precheck: ${report.outcomeBaseRates.delayedMinusPrecheck?.toFixed(4) ?? "n/a"}`,
    "",
    "## Directional Checks",
    "",
  ];

  for (const check of report.directionalChecks) {
    lines.push(
      `- [${check.status.toUpperCase()}] ${check.key}: ${check.summary} (support=${check.support})`,
    );
    lines.push(`  details: ${JSON.stringify(check.details)}`);
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
