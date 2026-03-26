"use client";

import { useEffect, useState } from "react";
import AdminFilters, { type AdminFilterValue } from "../_components/AdminFilters";
import { BarList, SectionCard, TrendTable } from "../_components/ChartBlocks";
import { authFetch } from "@/lib/client-auth";

type Payload = {
  chatEventsPerDay: Array<{ date: string; total: number }>;
  assistantLengthByStyle: Array<{ style: string; avgAssistantChars: number; n: number }>;
  personalizationModeUsage: Array<{ label: string; value: number }>;
  latencyDistribution: Array<{ label: string; value: number }>;
};

const DEFAULT_FILTERS: AdminFilterValue = {
  window: "30d",
  policyMode: "any",
  subjectId: "",
  includeExcluded: false,
};

export default function AdminChatPage() {
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

    authFetch(`/api/admin/chat-metrics?${query.toString()}`)
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
        <h2 className="text-2xl font-semibold">Admin • Chat</h2>
      </div>

      <AdminFilters value={filters} subjects={subjects} onChange={setFilters} />

      <SectionCard title="Chat events per day">
        <TrendTable
          rows={(data?.chatEventsPerDay ?? []).map((row) => ({
            date: row.date,
            events: row.total,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "events", label: "Events" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Average assistant length by explanation style">
        <TrendTable
          rows={(data?.assistantLengthByStyle ?? []).map((row) => ({
            style: row.style,
            avgAssistantChars: Math.round(row.avgAssistantChars),
            n: row.n,
          }))}
          columns={[
            { key: "style", label: "Style" },
            { key: "avgAssistantChars", label: "Avg chars" },
            { key: "n", label: "n" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Personalization mode usage (chat)">
        <BarList rows={data?.personalizationModeUsage ?? []} />
      </SectionCard>

      <SectionCard title="Turn latency distribution">
        <BarList rows={data?.latencyDistribution ?? []} />
      </SectionCard>
    </section>
  );
}
