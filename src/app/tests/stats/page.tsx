"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { LOW_N_THRESHOLD, PED_AXES, UX_AXES } from "@/lib/tags";

type StatsPayload = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    testsTaken: number;
    personalizationReady: boolean;
  };
  declaredPreferences: Record<string, string>;
  effectivePreferences: Record<string, string>;
  axesReady: number;
  computedReady: boolean;
  tagStats: {
    axisKey: string;
    tagKey: string;
    correctCount: number;
    totalCount: number;
  }[];
  attempts: {
    id: string;
    score: number;
    createdAt: string;
    subjectId: string;
    sectionId: string | null;
    subject: string;
    topic: string;
  }[];
  policyMetrics?: {
    averageUxReward: number | null;
    uxRewardSamples: number;
    difficultyTransitions: number;
    explorationCount: number;
    explorationRate: number;
    attemptsAnalyzed: number;
  };
};

export default function TestStatsPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [sections, setSections] = useState<
    { id: string; title: string; parentId: string | null }[]
  >([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  useEffect(() => {
    let active = true;
    async function loadStats() {
      setLoading(true);
      setError(null);
      const [statsRes, subjectsRes] = await Promise.all([
        authFetch("/api/users/me/stats"),
        authFetch("/api/subjects"),
      ]);

      if (!statsRes.ok) {
        const json = await statsRes.json().catch(() => ({}));
        if (active) {
          setError(json.message ?? "Failed to load stats.");
          setLoading(false);
        }
        return;
      }

      const json = (await statsRes.json()) as StatsPayload;
      const subjectsJson = subjectsRes.ok
        ? ((await subjectsRes.json()) as { id: string; title: string }[])
        : [];

      if (active) {
        setStats(json);
        setSubjects(subjectsJson);
        setLoading(false);
      }
    }

    loadStats();
    return () => {
      active = false;
    };
  }, []);

  const tagStatsByAxis = useMemo(() => {
    const map = new Map<string, StatsPayload["tagStats"]>();
    if (!stats) return map;
    for (const stat of stats.tagStats) {
      const list = map.get(stat.axisKey) ?? [];
      list.push(stat);
      map.set(stat.axisKey, list);
    }
    return map;
  }, [stats]);

  useEffect(() => {
    let active = true;
    async function loadSections() {
      if (!subjectFilter) {
        setSections([]);
        setSectionFilter("");
        return;
      }
      const response = await authFetch(
        `/api/subjects/${subjectFilter}/sections`,
      );
      if (!response.ok) return;
      const json = (await response.json()) as {
        id: string;
        title: string;
        parentId: string | null;
      }[];
      if (active) {
        setSections(json);
        setSectionFilter("");
      }
    }
    loadSections();
    return () => {
      active = false;
    };
  }, [subjectFilter]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading stats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-slate-200">Error: {error}</p>
        <p className="mt-2 text-sm text-slate-400">
          Log in first to access stats.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>No stats yet.</p>
      </div>
    );
  }

  const filteredAttempts = stats.attempts.filter((attempt) => {
    if (subjectFilter && attempt.subjectId !== subjectFilter) return false;
    if (sectionFilter && attempt.sectionId !== sectionFilter) return false;
    return true;
  });

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Personalization stats</h2>
        <p className="mt-2 text-sm text-slate-300">
          Tests taken: {stats.user.testsTaken} · Ready:{" "}
          {stats.user.personalizationReady ? "Yes" : "No"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Axes ready: {stats.axesReady} · Computed ready:{" "}
          {stats.computedReady ? "Yes" : "No"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold">Declared preferences (UX)</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {UX_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{stats.declaredPreferences[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
          <h4 className="mt-4 text-xs uppercase text-slate-500">Pedagogy</h4>
          <div className="mt-2 grid gap-2 text-sm">
            {PED_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{stats.declaredPreferences[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold">Effective preferences (UX)</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {UX_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{stats.effectivePreferences[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
          <h4 className="mt-4 text-xs uppercase text-slate-500">Pedagogy</h4>
          <div className="mt-2 grid gap-2 text-sm">
            {PED_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{stats.effectivePreferences[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Policy transparency</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          <div className="flex justify-between">
            <span>Average UX reward</span>
            <span>
              {stats.policyMetrics?.averageUxReward != null
                ? stats.policyMetrics.averageUxReward.toFixed(3)
                : "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>UX reward samples</span>
            <span>{stats.policyMetrics?.uxRewardSamples ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Difficulty transitions</span>
            <span>{stats.policyMetrics?.difficultyTransitions ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Exploration rate</span>
            <span>
              {(((stats.policyMetrics?.explorationRate ?? 0) * 100).toFixed(1))}%
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Tag stats by axis</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[...UX_AXES, ...PED_AXES].map((axis) => {
            const axisStats = tagStatsByAxis.get(axis) ?? [];
            const totalSamples = axisStats.reduce(
              (sum, stat) => sum + stat.totalCount,
              0,
            );
            return (
              <div
                key={axis}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
              >
                <p className="text-xs uppercase text-slate-400">{axis}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  samples: {totalSamples}
                  {totalSamples < LOW_N_THRESHOLD ? " · low-N warning" : ""}
                </p>
                {axisStats.length === 0 ? (
                  <p className="mt-2 text-slate-500">No data yet.</p>
                ) : (
                  <div className="mt-2 grid gap-1">
                    {axisStats.map((stat) => (
                      <div key={`${stat.axisKey}-${stat.tagKey}`} className="flex justify-between">
                        <span>{stat.tagKey}</span>
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
        <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <label className="grid gap-2">
            Subject filter
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            Section filter
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
              disabled={!subjectFilter}
            >
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {filteredAttempts.length === 0 ? (
            <p className="text-slate-500">No attempts yet.</p>
          ) : (
            filteredAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex flex-wrap items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div>
                  <p className="text-xs uppercase text-slate-500">
                    {attempt.subject}
                  </p>
                  <p>{attempt.topic}</p>
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
