"use client";

import { useEffect, useState } from "react";
import AdminFilters, { type AdminFilterValue } from "../_components/AdminFilters";
import { BarList, SectionCard, TrendTable } from "../_components/ChartBlocks";
import { authFetch } from "@/lib/client-auth";

type Payload = {
  testsGeneratedPerDay: Array<{ date: string; total: number }>;
  completionTrend: Array<{ date: string; generated: number; completed: number; completionRate: number }>;
  avgScoreByDifficulty: Array<{ difficulty: string; avgScore: number; n: number }>;
  predictionErrorTrend: Array<{ date: string; mae: number | null; n: number }>;
  predictedVsActualScatter: Array<{ predicted: number; actual: number; diff: number }>;
};

const DEFAULT_FILTERS: AdminFilterValue = {
  window: "30d",
  policyMode: "any",
  subjectId: "",
  includeExcluded: false,
};

export default function AdminTestsPage() {
  const [filters, setFilters] = useState<AdminFilterValue>(DEFAULT_FILTERS);
  const [subjects, setSubjects] = useState<Array<{ id: string; title: string }>>([]);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let active = true;
    authFetch("/api/subjects")
      .then((response) => (response.ok ? response.json() : []))
      .then((json) => {
        if (active) setSubjects((json ?? []) as Array<{ id: string; title: string }>);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      window: filters.window,
      policyMode: filters.policyMode,
      includeExcluded: filters.includeExcluded ? "1" : "0",
    });
    if (filters.subjectId) query.set("subjectId", filters.subjectId);

    authFetch(`/api/admin/tests-metrics?${query.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (active) setData(json as Payload | null);
      })
      .catch(() => {
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Admin • Tests</h2>
      </div>

      <AdminFilters value={filters} subjects={subjects} onChange={setFilters} />

      <SectionCard title="Tests generated per day">
        <TrendTable
          rows={(data?.testsGeneratedPerDay ?? []).map((row) => ({
            date: row.date,
            total: row.total,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "total", label: "Generated" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Completion trend">
        <TrendTable
          rows={(data?.completionTrend ?? []).map((row) => ({
            date: row.date,
            generated: row.generated,
            completed: row.completed,
            completionRate: `${(row.completionRate * 100).toFixed(1)}%`,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "generated", label: "Generated" },
            { key: "completed", label: "Completed" },
            { key: "completionRate", label: "Completion rate" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Average score by difficulty">
        <BarList
          rows={(data?.avgScoreByDifficulty ?? []).map((row) => ({
            label: `${row.difficulty} (n=${row.n})`,
            value: Math.round(row.avgScore * 100),
          }))}
          valueLabel={(value) => `${value}%`}
        />
      </SectionCard>

      <SectionCard title="Prediction error trend (MAE)">
        <TrendTable
          rows={(data?.predictionErrorTrend ?? []).map((row) => ({
            date: row.date,
            mae: row.mae == null ? "-" : row.mae.toFixed(3),
            n: row.n,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "mae", label: "MAE" },
            { key: "n", label: "n" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Predicted vs Actual (sample scatter rows)">
        <TrendTable
          rows={(data?.predictedVsActualScatter ?? []).slice(0, 40).map((row, idx) => ({
            idx: idx + 1,
            predicted: row.predicted.toFixed(3),
            actual: row.actual.toFixed(3),
            diff: row.diff.toFixed(3),
          }))}
          columns={[
            { key: "idx", label: "#" },
            { key: "predicted", label: "Predicted" },
            { key: "actual", label: "Actual" },
            { key: "diff", label: "Diff" },
          ]}
        />
      </SectionCard>
    </section>
  );
}
