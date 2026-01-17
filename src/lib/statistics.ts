import { MIN_AXES_READY, MIN_TESTS_FOR_READY, MIN_TOTAL_PER_TAG } from "./tags";

type TagStat = {
  axisKey: string;
  tagKey: string;
  correctCount: number;
  totalCount: number;
};

export function computeEffectivePreferences(stats: TagStat[]) {
  const byAxis = new Map<
    string,
    { tagKey: string; accuracy: number; total: number }[]
  >();

  stats.forEach((stat) => {
    const accuracy =
      stat.totalCount > 0 ? stat.correctCount / stat.totalCount : 0;
    const entries = byAxis.get(stat.axisKey) ?? [];
    entries.push({
      tagKey: stat.tagKey,
      accuracy,
      total: stat.totalCount,
    });
    byAxis.set(stat.axisKey, entries);
  });

  const effective: Record<string, string> = {};
  let axesReady = 0;

  for (const [axisKey, entries] of byAxis.entries()) {
    const eligible = entries.filter((entry) => entry.total >= MIN_TOTAL_PER_TAG);
    if (eligible.length === 0) continue;

    const sorted = [...eligible].sort((a, b) => b.accuracy - a.accuracy);
    effective[axisKey] = sorted[0].tagKey;
    axesReady += 1;
  }

  return { effective, axesReady };
}

export function isPersonalizationReady(
  axesReady: number,
  testsTaken: number,
) {
  return axesReady >= MIN_AXES_READY && testsTaken >= MIN_TESTS_FOR_READY;
}
