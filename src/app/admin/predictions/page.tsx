"use client";

import { useEffect, useState } from "react";
import AdminFilters, { type AdminFilterValue } from "../_components/AdminFilters";
import { BarList, SectionCard, StatGrid, TrendTable } from "../_components/ChartBlocks";
import { authFetch } from "@/lib/client-auth";

type PredictionMetrics = {
  samples: {
    accuracy: { n: number; excluded: number; reasonsTop: Array<{ reason: string; count: number }> };
    duration: { n: number; excluded: number; reasonsTop: Array<{ reason: string; count: number }> };
  };
  accuracy: {
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    overRate: number | null;
    underRate: number | null;
    byBucket: Array<{ bucket: string; n: number; predAvg: number | null; actualAvg: number | null; bias: number | null }>;
  };
  durationMs: {
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    byBucket: Array<{ bucket: string; n: number; predAvg: number | null; actualAvg: number | null; bias: number | null }>;
  };
  byPolicyMode: Array<{
    policyMode: string;
    accuracy: { n: number; mae: number | null; bias: number | null };
    durationMs: { n: number; mae: number | null; bias: number | null };
  }>;
};

const DEFAULT_FILTERS: AdminFilterValue = {
  window: "30d",
  policyMode: "any",
  subjectId: "",
  includeExcluded: false,
};

export default function AdminPredictionsPage() {
  const [filters, setFilters] = useState<AdminFilterValue>(DEFAULT_FILTERS);
  const [subjects, setSubjects] = useState<Array<{ id: string; title: string }>>([]);
  const [data, setData] = useState<PredictionMetrics | null>(null);

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

    authFetch(`/api/admin/prediction-metrics?${query.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (active) setData(json as PredictionMetrics | null);
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
        <h2 className="text-2xl font-semibold">Admin • Predictions</h2>
      </div>

      <AdminFilters value={filters} subjects={subjects} onChange={setFilters} />

      <SectionCard title="Core error metrics">
        <StatGrid
          items={[
            { label: "Accuracy MAE", value: data?.accuracy.mae == null ? "-" : data.accuracy.mae.toFixed(3) },
            { label: "Accuracy RMSE", value: data?.accuracy.rmse == null ? "-" : data.accuracy.rmse.toFixed(3) },
            { label: "Accuracy bias", value: data?.accuracy.bias == null ? "-" : data.accuracy.bias.toFixed(3) },
            { label: "Duration MAE (ms)", value: data?.durationMs.mae == null ? "-" : data.durationMs.mae.toFixed(0) },
            { label: "Duration RMSE (ms)", value: data?.durationMs.rmse == null ? "-" : data.durationMs.rmse.toFixed(0) },
            { label: "Duration bias (ms)", value: data?.durationMs.bias == null ? "-" : data.durationMs.bias.toFixed(0) },
          ]}
        />
      </SectionCard>

      <SectionCard title="Samples and exclusions">
        <StatGrid
          items={[
            { label: "Accuracy n", value: String(data?.samples.accuracy.n ?? 0) },
            { label: "Accuracy excluded", value: String(data?.samples.accuracy.excluded ?? 0) },
            { label: "Duration n", value: String(data?.samples.duration.n ?? 0) },
            { label: "Duration excluded", value: String(data?.samples.duration.excluded ?? 0) },
            {
              label: "Over-rate",
              value: data?.accuracy.overRate == null ? "-" : `${(data.accuracy.overRate * 100).toFixed(1)}%`,
            },
            {
              label: "Under-rate",
              value: data?.accuracy.underRate == null ? "-" : `${(data.accuracy.underRate * 100).toFixed(1)}%`,
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Accuracy excluded reasons">
        <BarList
          rows={(data?.samples.accuracy.reasonsTop ?? []).map((row) => ({
            label: row.reason,
            value: row.count,
          }))}
        />
      </SectionCard>

      <SectionCard title="Duration excluded reasons">
        <BarList
          rows={(data?.samples.duration.reasonsTop ?? []).map((row) => ({
            label: row.reason,
            value: row.count,
          }))}
        />
      </SectionCard>

      <SectionCard title="Accuracy calibration buckets">
        <TrendTable
          rows={(data?.accuracy.byBucket ?? []).map((row) => ({
            bucket: row.bucket,
            n: row.n,
            predAvg: row.predAvg == null ? "-" : row.predAvg.toFixed(3),
            actualAvg: row.actualAvg == null ? "-" : row.actualAvg.toFixed(3),
            bias: row.bias == null ? "-" : row.bias.toFixed(3),
          }))}
          columns={[
            { key: "bucket", label: "Bucket" },
            { key: "n", label: "n" },
            { key: "predAvg", label: "Pred avg" },
            { key: "actualAvg", label: "Actual avg" },
            { key: "bias", label: "Bias" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Duration calibration buckets">
        <TrendTable
          rows={(data?.durationMs.byBucket ?? []).map((row) => ({
            bucket: row.bucket,
            n: row.n,
            predAvg: row.predAvg == null ? "-" : row.predAvg.toFixed(0),
            actualAvg: row.actualAvg == null ? "-" : row.actualAvg.toFixed(0),
            bias: row.bias == null ? "-" : row.bias.toFixed(0),
          }))}
          columns={[
            { key: "bucket", label: "Bucket" },
            { key: "n", label: "n" },
            { key: "predAvg", label: "Pred avg (ms)" },
            { key: "actualAvg", label: "Actual avg (ms)" },
            { key: "bias", label: "Bias (ms)" },
          ]}
        />
      </SectionCard>

      <SectionCard title="By policy mode">
        <TrendTable
          rows={(data?.byPolicyMode ?? []).map((row) => ({
            policyMode: row.policyMode,
            accN: row.accuracy.n,
            accMae: row.accuracy.mae == null ? "-" : row.accuracy.mae.toFixed(3),
            accBias: row.accuracy.bias == null ? "-" : row.accuracy.bias.toFixed(3),
            durN: row.durationMs.n,
            durMae: row.durationMs.mae == null ? "-" : row.durationMs.mae.toFixed(0),
            durBias: row.durationMs.bias == null ? "-" : row.durationMs.bias.toFixed(0),
          }))}
          columns={[
            { key: "policyMode", label: "Policy mode" },
            { key: "accN", label: "Acc n" },
            { key: "accMae", label: "Acc MAE" },
            { key: "accBias", label: "Acc bias" },
            { key: "durN", label: "Dur n" },
            { key: "durMae", label: "Dur MAE" },
            { key: "durBias", label: "Dur bias" },
          ]}
        />
      </SectionCard>
    </section>
  );
}
