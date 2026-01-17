import { prisma } from "@/lib/prisma";
import { MIN_TOTAL_PER_TAG, TAG_AXES } from "@/lib/tags";

type SubjectDelta = {
  subject: string;
  averageDelta: number;
  cohorts: number;
};

export default async function AnalyticsPage() {
  const [userCount, readyCount, retakeCount, attempts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { personalizationReady: true } }),
    prisma.user.count({ where: { testsTaken: { gte: 2 } } }),
    prisma.testAttempt.findMany({
      include: { test: { include: { subject: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const deltaBySubject = new Map<string, { total: number; count: number }>();
  const grouped = new Map<string, typeof attempts>();

  for (const attempt of attempts) {
    const key = `${attempt.userId}:${attempt.test.subjectId}`;
    const list = grouped.get(key) ?? [];
    list.push(attempt);
    grouped.set(key, list);
  }

  for (const attemptsForSubject of grouped.values()) {
    if (attemptsForSubject.length < 2) continue;
    const first = attemptsForSubject[0];
    const last = attemptsForSubject[attemptsForSubject.length - 1];
    const delta = last.score - first.score;
    const subjectName = last.test.subject.name;
    const entry = deltaBySubject.get(subjectName) ?? { total: 0, count: 0 };
    entry.total += delta;
    entry.count += 1;
    deltaBySubject.set(subjectName, entry);
  }

  const subjectDeltas: SubjectDelta[] = Array.from(deltaBySubject.entries())
    .map(([subject, entry]) => ({
      subject,
      averageDelta: entry.count > 0 ? entry.total / entry.count : 0,
      cohorts: entry.count,
    }))
    .sort((a, b) => b.averageDelta - a.averageDelta);

  const stats = await prisma.userTagStat.findMany({
    include: { axis: true },
  });
  const statsByUser = new Map<string, typeof stats>();
  for (const stat of stats) {
    const list = statsByUser.get(stat.userId) ?? [];
    list.push(stat);
    statsByUser.set(stat.userId, list);
  }

  const users = await prisma.user.findMany();

  const mismatchCounts: Record<string, number> = Object.fromEntries(
    TAG_AXES.map((axis) => [axis, 0]),
  );

  for (const user of users) {
    const declared =
      (user.declaredPreferencesJson ?? {}) as Record<string, string>;
    const effective =
      (user.effectivePreferencesJson ?? {}) as Record<string, string>;
    const userStats = statsByUser.get(user.id) ?? [];

    for (const axisKey of TAG_AXES) {
      const declaredTag = declared[axisKey];
      const effectiveTag = effective[axisKey];
      if (!declaredTag || !effectiveTag) continue;

      const totalForAxis = userStats
        .filter((stat) => stat.axis.key === axisKey)
        .reduce((sum, stat) => sum + stat.totalCount, 0);

      if (totalForAxis < MIN_TOTAL_PER_TAG) continue;
      if (declaredTag !== effectiveTag) {
        mismatchCounts[axisKey] += 1;
      }
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Analytics overview</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">Users total</p>
            <p className="mt-2 text-2xl font-semibold">{userCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">
              Personalization ready
            </p>
            <p className="mt-2 text-2xl font-semibold">{readyCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">
              Retake cohort
            </p>
            <p className="mt-2 text-2xl font-semibold">{retakeCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h3 className="text-xl font-semibold">Accuracy delta by subject</h3>
        <div className="mt-4 grid gap-3">
          {subjectDeltas.length === 0 ? (
            <p className="text-sm text-slate-400">No retake data yet.</p>
          ) : (
            subjectDeltas.map((entry) => (
              <div
                key={entry.subject}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
              >
                <span>{entry.subject}</span>
                <span>
                  {(entry.averageDelta * 100).toFixed(1)}% avg delta (
                  {entry.cohorts} cohorts)
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h3 className="text-xl font-semibold">
          H1: Declared vs effective mismatch
        </h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {TAG_AXES.map((axis) => (
            <div
              key={axis}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
            >
              <p className="text-xs uppercase text-slate-400">{axis}</p>
              <p className="mt-2 text-lg font-semibold">
                {mismatchCounts[axis]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
