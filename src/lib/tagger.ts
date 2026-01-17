import { TAGS_BY_AXIS, TagAxisKey } from "./tags";

export type QuestionTagging = Record<TagAxisKey, string>;

const keywordMap: Partial<Record<TagAxisKey, Record<string, string>>> = {
  domain: {
    math: "stem",
    physics: "stem",
    chemistry: "stem",
    history: "humanities",
    literature: "humanities",
    economics: "business",
    finance: "business",
  },
  depth: {
    "why": "conceptual",
    "how": "conceptual",
    "apply": "applied",
    "calculate": "applied",
  },
  cognitive_level: {
    "define": "recall",
    "list": "recall",
    "compare": "analyze",
    "evaluate": "analyze",
    "design": "create",
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
