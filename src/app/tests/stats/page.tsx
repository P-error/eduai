"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { TAG_AXES } from "@/lib/tags";

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
    subject: string;
    topic: string;
  }[];
};

export default function TestStatsPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadStats() {
      setLoading(true);
      setError(null);
      const response = await authFetch("/api/users/me/stats");
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        if (active) {
          setError(json.message ?? "Failed to load stats.");
          setLoading(false);
        }
        return;
      }
      const json = (await response.json()) as StatsPayload;
      if (active) {
        setStats(json);
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
          <h3 className="text-lg font-semibold">Declared preferences</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {TAG_AXES.map((axis) => (
              <div key={axis} className="flex justify-between">
                <span className="text-slate-400">{axis}</span>
                <span>{stats.declaredPreferences[axis] ?? "-"}</span>
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
                <span>{stats.effectivePreferences[axis] ?? "-"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Tag stats by axis</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {TAG_AXES.map((axis) => {
            const axisStats = tagStatsByAxis.get(axis) ?? [];
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
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {stats.attempts.length === 0 ? (
            <p className="text-slate-500">No attempts yet.</p>
          ) : (
            stats.attempts.map((attempt) => (
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
