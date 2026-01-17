"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { TAG_AXES } from "@/lib/tags";

type AnalyticsPayload = {
  userCount: number;
  readyCount: number;
  retakeCount: number;
  subjectDeltas: {
    subject: string;
    averageDelta: number;
    cohorts: number;
  }[];
  subjectSummaries: {
    subject: string;
    totalAttempts: number;
    avgScore: number;
  }[];
  cohorts: { label: string; total: number; ready: number }[];
  axisSummaries: {
    axisKey: string;
    tags: { tagKey: string; accuracy: number; total: number }[];
  }[];
  mismatchCounts: Record<string, number>;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      const response = await authFetch("/api/admin/analytics");
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        if (active) {
          setError(json.message ?? "Failed to load analytics.");
        }
        return;
      }
      const json = (await response.json()) as AnalyticsPayload;
      if (active) {
        setData(json);
      }
    }
    loadAnalytics();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-slate-200">Error: {error}</p>
        <p className="mt-2 text-sm text-slate-400">
          Admin access required.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Analytics overview</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">Users total</p>
            <p className="mt-2 text-2xl font-semibold">{data.userCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">
              Personalization ready
            </p>
            <p className="mt-2 text-2xl font-semibold">{data.readyCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase text-slate-400">
              Retake cohort
            </p>
            <p className="mt-2 text-2xl font-semibold">{data.retakeCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h3 className="text-xl font-semibold">Accuracy delta by subject</h3>
        <div className="mt-4 grid gap-3">
          {data.subjectDeltas.length === 0 ? (
            <p className="text-sm text-slate-400">No retake data yet.</p>
          ) : (
            data.subjectDeltas.map((entry) => (
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
        <h3 className="text-xl font-semibold">Subject performance</h3>
        <div className="mt-4 grid gap-3">
          {data.subjectSummaries.length === 0 ? (
            <p className="text-sm text-slate-400">No attempts yet.</p>
          ) : (
            data.subjectSummaries.map((entry) => (
              <div
                key={entry.subject}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
              >
                <span>{entry.subject}</span>
                <span>
                  {entry.totalAttempts} attempts ·{" "}
                  {(entry.avgScore * 100).toFixed(1)}% avg
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h3 className="text-xl font-semibold">Readiness cohorts</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.cohorts.map((cohort) => (
            <div
              key={cohort.label}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
            >
              <p className="text-xs uppercase text-slate-400">{cohort.label}</p>
              <p className="mt-2 text-lg font-semibold">
                {cohort.ready} / {cohort.total} ready
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h3 className="text-xl font-semibold">Axis accuracy summary</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.axisSummaries.length === 0 ? (
            <p className="text-sm text-slate-400">No tag stats yet.</p>
          ) : (
            data.axisSummaries.map((axis) => (
              <div
                key={axis.axisKey}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
              >
                <p className="text-xs uppercase text-slate-400">
                  {axis.axisKey}
                </p>
                <div className="mt-2 grid gap-1">
                  {axis.tags.map((tag) => (
                    <div key={tag.tagKey} className="flex justify-between">
                      <span>{tag.tagKey}</span>
                      <span>
                        {(tag.accuracy * 100).toFixed(0)}% ({tag.total})
                      </span>
                    </div>
                  ))}
                </div>
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
                {data.mismatchCounts[axis]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
