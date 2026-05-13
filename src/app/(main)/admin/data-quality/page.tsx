"use client";

import { useEffect, useMemo, useState } from "react";
import AdminFilters, { type AdminFilterValue } from "../_components/AdminFilters";
import { BarList, SectionCard, TrendTable } from "../_components/ChartBlocks";
import { authFetch } from "@/lib/client-auth";

type Payload = {
  attemptsStack: Array<{ date: string; total: number; eligible: number; excluded: number }>;
  excludedReasonsTop: Array<{ label: string; value: number }>;
  taggingSourceDistribution: Array<{ label: string; value: number }>;
  complianceTrend: Array<{ date: string; pass: number; fail: number; passRate: number }>;
  retryTrend: Array<{ date: string; total: number; retry: number; retryRate: number }>;
  avgWarningsTrend: Array<{ date: string; avgWarnings: number }>;
};

const DEFAULT_FILTERS: AdminFilterValue = {
  window: "30d",
  policyMode: "any",
  subjectId: "",
  includeExcluded: false,
};

export default function AdminDataQualityPage() {
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

    authFetch(`/api/admin/data-quality-metrics?${query.toString()}`)
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

  const totals = useMemo(() => {
    if (!data) return { total: 0, eligible: 0, excluded: 0 };
    return data.attemptsStack.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        eligible: acc.eligible + row.eligible,
        excluded: acc.excluded + row.excluded,
      }),
      { total: 0, eligible: 0, excluded: 0 },
    );
  }, [data]);

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Admin • Data Quality</h2>
      </div>

      <AdminFilters value={filters} subjects={subjects} onChange={setFilters} />

      <SectionCard title="Attempts: total vs eligible vs excluded">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Total: {totals.total}</div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Eligible: {totals.eligible}</div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Excluded: {totals.excluded}</div>
        </div>
        <div className="mt-3">
          <TrendTable
            rows={(data?.attemptsStack ?? []).map((row) => ({
              date: row.date,
              total: row.total,
              eligible: row.eligible,
              excluded: row.excluded,
            }))}
            columns={[
              { key: "date", label: "Date" },
              { key: "total", label: "Total" },
              { key: "eligible", label: "Eligible" },
              { key: "excluded", label: "Excluded" },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard title="Excluded reasons top">
        <BarList rows={data?.excludedReasonsTop ?? []} />
      </SectionCard>

      <SectionCard title="Tagging source distribution">
        <BarList rows={data?.taggingSourceDistribution ?? []} />
      </SectionCard>

      <SectionCard title="Compliance pass/fail over time">
        <TrendTable
          rows={(data?.complianceTrend ?? []).map((row) => ({
            date: row.date,
            pass: row.pass,
            fail: row.fail,
            passRate: `${(row.passRate * 100).toFixed(1)}%`,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "pass", label: "Pass" },
            { key: "fail", label: "Fail" },
            { key: "passRate", label: "Pass rate" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Retry rate over time">
        <TrendTable
          rows={(data?.retryTrend ?? []).map((row) => ({
            date: row.date,
            retry: row.retry,
            total: row.total,
            retryRate: `${(row.retryRate * 100).toFixed(1)}%`,
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "retry", label: "Retries" },
            { key: "total", label: "Total" },
            { key: "retryRate", label: "Retry rate" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Average schema warnings over time">
        <TrendTable
          rows={(data?.avgWarningsTrend ?? []).map((row) => ({
            date: row.date,
            avgWarnings: row.avgWarnings.toFixed(2),
          }))}
          columns={[
            { key: "date", label: "Date" },
            { key: "avgWarnings", label: "Avg warnings" },
          ]}
        />
      </SectionCard>
    </section>
  );
}
