export const TAG_AXES = [
  "education_level",
  "tone",
  "style",
  "format",
  "depth",
  "cognitive_level",
  "task_type",
  "micro_complexity",
  "domain",
  "context",
] as const;

export type TagAxisKey = (typeof TAG_AXES)[number];

export const TAG_LEGEND_VERSION = "v1";

export const TAGS_BY_AXIS: Record<TagAxisKey, { key: string; label: string }[]> =
  {
    education_level: [
      { key: "school", label: "School" },
      { key: "undergrad", label: "Undergrad" },
      { key: "advanced", label: "Advanced" },
    ],
    tone: [
      { key: "formal", label: "Formal" },
      { key: "friendly", label: "Friendly" },
      { key: "direct", label: "Direct" },
    ],
    style: [
      { key: "stepwise", label: "Stepwise" },
      { key: "concise", label: "Concise" },
      { key: "exploratory", label: "Exploratory" },
    ],
    format: [
      { key: "mcq", label: "Multiple Choice" },
      { key: "short", label: "Short Answer" },
      { key: "multi", label: "Multi-part" },
    ],
    depth: [
      { key: "surface", label: "Surface" },
      { key: "conceptual", label: "Conceptual" },
      { key: "applied", label: "Applied" },
    ],
    cognitive_level: [
      { key: "recall", label: "Recall" },
      { key: "analyze", label: "Analyze" },
      { key: "create", label: "Create" },
    ],
    task_type: [
      { key: "definition", label: "Definition" },
      { key: "problem", label: "Problem" },
      { key: "comparison", label: "Comparison" },
    ],
    micro_complexity: [
      { key: "single_step", label: "Single Step" },
      { key: "multi_step", label: "Multi Step" },
      { key: "open_ended", label: "Open Ended" },
    ],
    domain: [
      { key: "stem", label: "STEM" },
      { key: "humanities", label: "Humanities" },
      { key: "business", label: "Business" },
    ],
    context: [
      { key: "abstract", label: "Abstract" },
      { key: "real_world", label: "Real World" },
      { key: "exam", label: "Exam Prep" },
    ],
  };

export const MIN_TOTAL_PER_TAG = 3;
export const MIN_AXES_READY = 4;
export const MIN_TESTS_FOR_READY = 3;
