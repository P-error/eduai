import { TAGS_BY_AXIS, TagAxisKey } from "./tags";

export type QuestionTagging = Record<TagAxisKey, string>;

const keywordMap: Partial<Record<TagAxisKey, Record<string, string>>> = {
  cognitive_process: {
    define: "recall",
    list: "recall",
    apply: "apply",
    solve: "apply",
    analyze: "analyze",
    compare: "analyze",
    evaluate: "analyze",
  },
  task_family: {
    definition: "definition",
    compare: "comparison",
    versus: "comparison",
    solve: "problem_solving",
    calculate: "problem_solving",
  },
  context: {
    exam: "abstract",
    theorem: "abstract",
    real: "real_world",
    scenario: "real_world",
    case: "real_world",
  },
};

function pickDefault(axis: TagAxisKey) {
  return TAGS_BY_AXIS[axis][0].key;
}

export function tagQuestion(text: string): QuestionTagging {
  const lower = text.toLowerCase();

  return Object.keys(TAGS_BY_AXIS).reduce((acc, axisKey) => {
    const axis = axisKey as TagAxisKey;
    const rules = keywordMap[axis];
    if (rules) {
      const matched = Object.keys(rules).find((token) => lower.includes(token));
      if (matched) {
        acc[axis] = rules[matched];
        return acc;
      }
    }

    acc[axis] = pickDefault(axis);
    return acc;
  }, {} as QuestionTagging);
}
