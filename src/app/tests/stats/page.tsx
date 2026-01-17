import { prisma } from "@/lib/prisma";
import { TAG_AXES } from "@/lib/tags";
import {
  computeEffectivePreferences,
  isPersonalizationReady,
} from "@/lib/statistics";

export default async function TestStatsPage() {
  const user = await prisma.user.findFirst({
    include: {
      attempts: {
        include: { test: { include: { subject: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>No users yet. Generate and submit a test first.</p>
      </div>
    );
  }

  const stats = await prisma.userTagStat.findMany({
    where: { userId: user.id },
    include: { axis: true, tag: true },
  });

  const byAxis = new Map<string, typeof stats>();
  for (const stat of stats) {
    const list = byAxis.get(stat.axis.key) ?? [];
    list.push(stat);
    byAxis.set(stat.axis.key, list);
  }

  const declared =
    (user.declaredPreferencesJson ?? {}) as Record<string, string>;
  const effective =
    (user.effectivePreferencesJson ?? {}) as Record<string, string>;
  const { axesReady } = computeEffectivePreferences(
    stats.map((stat) => ({
      axisKey: stat.axis.key,
      tagKey: stat.tag.key,
      correctCount: stat.correctCount,
      totalCount: stat.totalCount,
    })),
  );
  const computedReady = isPersonalizationReady(axesReady, user.testsTaken);

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Personalization stats</h2>
        <p className="mt-2 text-sm text-slate-300">
          Tests taken: {user.testsTaken} · Ready:{" "}
          {user.personalizationReady ? "Yes" : "No"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Axes ready: {axesReady} · Computed ready:{" "}
          {computedReady ? "Yes" : "No"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold">Declared preferences</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {TAG_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{declared[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold">Effective preferences</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {TAG_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{effective[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Tag stats by axis</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {TAG_AXES.map((axis) => {
            const axisStats = byAxis.get(axis) ?? [];
            return (
              <div
                key={axis}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
              >
                <p className="text-xs uppercase text-slate-400">{axis}</p>
                {axisStats.length === 0 ? (
                  <p className="mt-2 text-slate-500">No data yet.</p>
                ) : (
                  <div className="mt-2 grid gap-1">
                    {axisStats.map((stat) => (
                      <div key={stat.id} className="flex justify-between">
                        <span>{stat.tag.key}</span>
                        <span>
                          {stat.correctCount}/{stat.totalCount} (
                          {stat.totalCount > 0
                            ? Math.round(
                                (stat.correctCount / stat.totalCount) * 100,
                              )
                            : 0}
                          %)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Recent test attempts</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {user.attempts.length === 0 ? (
            <p className="text-slate-500">No attempts yet.</p>
          ) : (
            user.attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex flex-wrap items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    {attempt.test.subject.name}
                  </p>
                  <p>{attempt.test.topic}</p>
                </div>
                <span>{Math.round(attempt.score * 100)}%</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
