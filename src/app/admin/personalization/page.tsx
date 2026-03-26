"use client";

import { useEffect, useState } from "react";
import AdminFilters, { type AdminFilterValue } from "../_components/AdminFilters";
import { BarList, SectionCard, TrendTable } from "../_components/ChartBlocks";
import { authFetch } from "@/lib/client-auth";

type Payload = {
  uxPresetToneTrend: Array<{ date: string; distribution: Array<{ label: string; value: number }> }>;
  uxPresetStyleTrend: Array<{ date: string; distribution: Array<{ label: string; value: number }> }>;
  uxConfidenceDistribution: Array<{ bucket: string; value: number }>;
  difficultyTransitionsTrend: Array<{ date: string; transitions: number }>;
  explorationTrend: Array<{ date: string; total: number; explored: number; explorationRate: number }>;
  abUsageShare: Array<{ label: string; value: number }>;
};

const DEFAULT_FILTERS: AdminFilterValue = {
  window: "30d",
  policyMode: "any",
  subjectId: "",
  includeExcluded: false,
};

export default function AdminPersonalizationPage() {
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

    authFetch(`/api/admin/personalization-metrics?${query.toString()}`)
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
        <h2 className="text-2xl font-semibold">Admin • Personalization</h2>
      </div>

      <AdminFilters value={filters} subjects={subjects} onChange={setFilters} />

      <SectionCard title="A/B usage share (Personalized vs Standard vs Manual)">
        <BarList rows={data?.abUsageShare ?? []} />
      </SectionCard>

      <SectionCard title="UX preset tone distribution over time">
        <TrendTable
          rows={(data?.uxPresetToneTrend ?? []).map((row) => ({
            date: row.date,
            top: row.distribution[0]?.label ?? "-",
            topCount: row.distribution[0]?.value ?? 0,
            variants: row.distribution.length,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "top", label: "Top tone" },
            { key: "topCount", label: "Top count" },
            { key: "variants", label: "Variants" },
          ]}
        />
      </SectionCard>

      <SectionCard title="UX preset explanation style distribution over time">
        <TrendTable
          rows={(data?.uxPresetStyleTrend ?? []).map((row) => ({
            date: row.date,
            top: row.distribution[0]?.label ?? "-",
            topCount: row.distribution[0]?.value ?? 0,
            variants: row.distribution.length,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "top", label: "Top style" },
            { key: "topCount", label: "Top count" },
            { key: "variants", label: "Variants" },
          ]}
        />
      </SectionCard>

      <SectionCard title="UX preference confidence distribution">
        <BarList
          rows={(data?.uxConfidenceDistribution ?? []).map((row) => ({
            label: row.bucket,
            value: row.value,
          }))}
        />
      </SectionCard>

      <SectionCard title="Difficulty transitions over time">
        <TrendTable
          rows={(data?.difficultyTransitionsTrend ?? []).map((row) => ({
            date: row.date,
            transitions: row.transitions,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "transitions", label: "Transitions" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Exploration rate observed over time">
        <TrendTable
          rows={(data?.explorationTrend ?? []).map((row) => ({
            date: row.date,
            explored: row.explored,
            total: row.total,
            explorationRate: `${(row.explorationRate * 100).toFixed(1)}%`,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "explored", label: "Explored" },
            { key: "total", label: "Total" },
            { key: "explorationRate", label: "Rate" },
          ]}
        />
      </SectionCard>
    </section>
  );
}
