import { prisma } from "@/lib/prisma";
import { MIN_TOTAL_PER_TAG, TAG_AXES } from "@/lib/tags";

export type RecommendationPreset = {
  subjectId: string;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  delivery: Record<string, string>;
};

export type RecommendationResult = {
  ok: boolean;
  preset: RecommendationPreset;
  rationale: string;
  dataStatus: "INSUFFICIENT" | "OK";
};

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
        delivery: {},
      },
      rationale: "Subject not found.",
      dataStatus: "INSUFFICIENT",
    };
  }

  const stats = await prisma.userTagStat.findMany({
    where: { userId },
    include: { axis: true, tag: true },
  });

  const axisWeak: {
    axisKey: string;
    tagKey: string;
    accuracy: number;
  }[] = [];

  for (const axisKey of TAG_AXES) {
    const axisStats = stats.filter((stat) => stat.axis.key === axisKey);
    const eligible = axisStats.filter(
      (stat) => stat.totalCount >= MIN_TOTAL_PER_TAG,
    );
    if (eligible.length === 0) continue;
    const sorted = eligible
      .map((stat) => ({
        axisKey,
        tagKey: stat.tag.key,
        accuracy:
          stat.totalCount > 0 ? stat.correctCount / stat.totalCount : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
    axisWeak.push(sorted[0]);
  }

  const hasAttempts = (attempts._count.id ?? 0) > 0;
  const dataStatus = hasAttempts && axisWeak.length > 0 ? "OK" : "INSUFFICIENT";

  const effective =
    (user.effectivePreferencesJson ?? {}) as Record<string, string>;

  const delivery: Record<string, string> = {};
  for (const axis of ["tone", "style", "format", "depth"]) {
    if (effective[axis]) delivery[axis] = effective[axis];
  }

  if (dataStatus === "OK") {
    axisWeak
      .filter((entry) =>
        ["cognitive_level", "task_type", "micro_complexity"].includes(
          entry.axisKey,
        ),
      )
      .slice(0, 3)
      .forEach((entry) => {
        delivery[entry.axisKey] = entry.tagKey;
      });
  }

  const preset: RecommendationPreset = {
    subjectId: subject.id,
    sectionId: null,
    topic: subject.title,
    questionCount: dataStatus === "OK" ? 8 : 5,
    mode: "practice",
    delivery,
  };

  const focusText =
    dataStatus === "OK"
      ? axisWeak
          .slice(0, 2)
          .map((entry) => `${entry.axisKey}=${entry.tagKey}`)
          .join(", ")
      : "";

  const deliveryText = Object.keys(delivery).length
    ? Object.entries(delivery)
        .map(([axis, tag]) => `${axis}=${tag}`)
        .join(", ")
    : "";

  const rationale =
    dataStatus === "INSUFFICIENT"
      ? "Недостаточно данных — рекомендован базовый тест."
      : `Фокус: ${focusText}. Подача: ${deliveryText}.`;

  return { ok: true, preset, rationale, dataStatus };
}
