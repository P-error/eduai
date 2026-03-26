export const UX_AXES = [
  "tone",
  "explanation_style",
  "response_format",
] as const;

export const PED_AXES = [
  "difficulty_target",
  "cognitive_process",
  "task_family",
  "context",
] as const;

export const ALL_AXES = [...UX_AXES, ...PED_AXES] as const;

export type UxAxisKey = (typeof UX_AXES)[number];
export type PedAxisKey = (typeof PED_AXES)[number];
export type TagAxisKey = (typeof ALL_AXES)[number];

export const TAG_LEGEND_VERSION = "v2";
export const AXIS_SCHEMA_VERSION = 2;

export const TAGS_BY_AXIS: Record<TagAxisKey, { key: string; label: string }[]> =
  {
    tone: [
      { key: "formal", label: "Formal" },
      { key: "friendly", label: "Friendly" },
      { key: "direct", label: "Direct" },
    ],
    explanation_style: [
      { key: "stepwise", label: "Stepwise" },
      { key: "concise", label: "Concise" },
      { key: "exploratory", label: "Exploratory" },
    ],
    response_format: [
      { key: "mcq", label: "Multiple Choice" },
      { key: "short", label: "Short Answer" },
      { key: "multipart", label: "Multi-part" },
    ],
    difficulty_target: [
      { key: "easy", label: "Easy" },
      { key: "medium", label: "Medium" },
      { key: "hard", label: "Hard" },
    ],
    cognitive_process: [
      { key: "recall", label: "Recall" },
      { key: "apply", label: "Apply" },
      { key: "analyze", label: "Analyze" },
    ],
    task_family: [
      { key: "definition", label: "Definition" },
      { key: "problem_solving", label: "Problem Solving" },
      { key: "comparison", label: "Comparison" },
    ],
    context: [
      { key: "abstract", label: "Abstract" },
      { key: "real_world", label: "Real World" },
    ],
  };

export const MIN_TOTAL_PER_TAG = 5;
export const MIN_AXES_READY = 4;
export const MIN_TESTS_FOR_READY = 5;
export const LOW_N_THRESHOLD = 10;

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"] as const;
export const TARGET_SCORE_BAND = {
  low: 0.65,
  high: 0.8,
} as const;

export const MIN_ATTEMPTS_PER_DIFF = 5;
export const DIFF_COOLDOWN_ATTEMPTS = 3;

export const RECOMMENDATION_EPSILON_PED = 0.1;

export const UX_AVG_THRESHOLD = 0.6;
export const UX_MIN_AXIS_THRESHOLD = 0.5;
export const MAX_RETRIES = 2;

export const EXPECTED_TIME_MS: Record<
  (typeof DIFFICULTY_ORDER)[number],
  Record<"mcq" | "short" | "multipart", number>
> = {
  easy: {
    mcq: 70_000,
    short: 90_000,
    multipart: 120_000,
  },
  medium: {
    mcq: 100_000,
    short: 130_000,
    multipart: 170_000,
  },
  hard: {
    mcq: 130_000,
    short: 170_000,
    multipart: 220_000,
  },
};
