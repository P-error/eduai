import { prisma } from "@/lib/prisma";
import {
  MIN_TOTAL_PER_TAG,
  PED_AXES,
  RECOMMENDATION_EPSILON_PED,
  TAGS_BY_AXIS,
  UX_AXES,
} from "@/lib/tags";

export type RecommendationPreset = {
  subjectId: string;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  uxPreset: Record<string, string>;
  pedagogyPreset: Record<string, string>;
  meta?: {
    exploration: boolean;
    epsilon: number;
    randomAxes: string[];
  };
};

export type RecommendationResult = {
  ok: boolean;
  preset: RecommendationPreset;
  rationale: string;
  dataStatus: "INSUFFICIENT" | "OK";
};

export const V2_BASELINE_UX_PRESET: Record<string, string> = {
  tone: "formal",
  explanation_style: "stepwise",
  response_format: "mcq",
};

const PED_DEFAULTS: Record<string, string> = {
  difficulty_target: "medium",
  cognitive_process: "apply",
  task_family: "problem_solving",
  context: "abstract",
};

export const V2_BASELINE_PEDAGOGY_PRESET: Record<string, string> = {
  ...PED_DEFAULTS,
};

const EXPLORATION_AXES = [
  "cognitive_process",
  "task_family",
  "context",
] as const;

function pickRandomTag(axisKey: (typeof EXPLORATION_AXES)[number]) {
  const options = TAGS_BY_AXIS[axisKey];
  return options[Math.floor(Math.random() * options.length)]?.key ?? options[0].key;
}

export async function getSubjectRecommendation(
  userId: string,
  subjectId: string,
): Promise<RecommendationResult> {
  const [subject, user, attempts] = await Promise.all([
    prisma.subject.findFirst({ where: { id: subjectId, userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.testAttempt.aggregate({
      where: { userId, test: { subjectId } },
      _count: { id: true },
      _avg: { score: true },
    }),
  ]);

  if (!subject || !user) {
    return {
      ok: false,
      preset: {
        subjectId,
        sectionId: null,
        topic: "",
        questionCount: 5,
        mode: "practice",
        uxPreset: {},
        pedagogyPreset: { ...PED_DEFAULTS },
        meta: {
          exploration: false,
          epsilon: RECOMMENDATION_EPSILON_PED,
          randomAxes: [],
        },
      },
      rationale: "Subject not found.",
      dataStatus: "INSUFFICIENT",
    };
  }

  const stats = await prisma.userTagStat.findMany({
    where: { userId },
    include: { axis: true, tag: true },
  });

  const weakByAxis: Record<string, string> = {};
  for (const axisKey of PED_AXES) {
    if (axisKey === "difficulty_target") continue;
    const axisStats = stats.filter((stat) => stat.axis.key === axisKey);
    const eligible = axisStats.filter(
      (stat) => stat.totalCount >= MIN_TOTAL_PER_TAG,
    );
    if (eligible.length === 0) continue;
    const sorted = eligible
      .map((stat) => ({
        tagKey: stat.tag.key,
        accuracy:
          stat.totalCount > 0 ? stat.correctCount / stat.totalCount : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
    weakByAxis[axisKey] = sorted[0].tagKey;
  }

  const hasAttempts = (attempts._count.id ?? 0) > 0;
  const dataStatus =
    hasAttempts && Object.keys(weakByAxis).length > 0 ? "OK" : "INSUFFICIENT";

  const effective =
    (user.effectivePreferencesJson ?? {}) as Record<string, string>;

  const uxPreset: Record<string, string> = {};
  for (const axis of UX_AXES) {
    if (effective[axis]) uxPreset[axis] = effective[axis];
  }

  const pedagogyPreset: Record<string, string> = {
    ...PED_DEFAULTS,
    difficulty_target:
      effective.difficulty_target ?? PED_DEFAULTS.difficulty_target,
  };

  for (const axis of EXPLORATION_AXES) {
    pedagogyPreset[axis] =
      weakByAxis[axis] ?? effective[axis] ?? PED_DEFAULTS[axis];
  }

  const exploration = Math.random() < RECOMMENDATION_EPSILON_PED;
  const randomAxes: string[] = [];
  if (exploration) {
    for (const axis of EXPLORATION_AXES) {
      pedagogyPreset[axis] = pickRandomTag(axis);
      randomAxes.push(axis);
    }
  }

  const preset: RecommendationPreset = {
    subjectId: subject.id,
    sectionId: null,
    topic: subject.title,
    questionCount: dataStatus === "OK" ? 8 : 5,
    mode: "practice",
    uxPreset,
    pedagogyPreset,
    meta: {
      exploration,
      epsilon: RECOMMENDATION_EPSILON_PED,
      randomAxes,
    },
  };

  const rationale =
    dataStatus === "INSUFFICIENT"
      ? "Insufficient personalized evidence; using baseline pedagogy preset."
      : `${exploration ? "Exploration applied" : "Weak-axis targeting"}: ${Object.entries(
          pedagogyPreset,
        )
          .filter(([axis]) => axis !== "difficulty_target")
          .map(([axis, tag]) => `${axis}=${tag}`)
          .join(", ")}. UX preset sourced from effective preferences.`;

  return { ok: true, preset, rationale, dataStatus };
}

export async function getUserPresetForChat(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      effectivePreferencesJson: true,
    },
  });

  const effective =
    (user?.effectivePreferencesJson ?? {}) as Record<string, string>;

  const uxPreset: Record<string, string> = {
    ...V2_BASELINE_UX_PRESET,
  };
  for (const axis of UX_AXES) {
    if (effective[axis]) {
      uxPreset[axis] = effective[axis];
    }
  }

  const pedagogyPreset: Record<string, string> = {
    ...V2_BASELINE_PEDAGOGY_PRESET,
    difficulty_target:
      effective.difficulty_target ??
      V2_BASELINE_PEDAGOGY_PRESET.difficulty_target,
  };

  return {
    uxPreset,
    pedagogyPreset,
  };
}
