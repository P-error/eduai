"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { SectionCard, StatGrid, TrendTable } from "../_components/ChartBlocks";

type PolicyId =
  | "v1_accuracy_raw_duration_baseline"
  | "v2_accuracy_beta_duration_unified";

type BacktestPayload = {
  engineVersion: string;
  generatedAt: string;
  policyIds: PolicyId[];
  filters: {
    includeExcluded: boolean;
    includeUnknownEligibility: boolean;
    historyWindowAttempts: number;
  };
  timeRange: {
    days: number;
    since?: string;
    until?: string;
  };
  denominators: {
    scanned: {
      total: number;
      learningEligible: number;
      learningExcluded: number;
      learningUnknown: number;
    };
    used: {
      total: number;
      learningEligible: number;
      learningExcluded: number;
      learningUnknown: number;
    };
  };
  execution: {
    attemptsScanned: number;
    attemptsUsed: number;
    runtimeMs: number;
    maxAttempts: number;
  };
  policies: Array<{
    policyId: PolicyId;
    label: string;
    description: string;
    attemptsEvaluated: number;
    accuracy: {
      n: number;
      mae: number | null;
      rmse: number | null;
      bias: number | null;
      calibrationBuckets: Array<{
        bucket: string;
        n: number;
        avgPredicted: number | null;
        avgActual: number | null;
        bias: number | null;
      }>;
    };
    durationMs: {
      n: number;
      mae: number | null;
      rmse: number | null;
      bias: number | null;
      p50AbsError: number | null;
      p90AbsError: number | null;
    };
    stratified: {
      bySubject: Array<{
        label: string;
        attempts: number;
        accuracy: { n: number; mae: number | null; rmse: number | null; bias: number | null };
        durationMs: {
          n: number;
          mae: number | null;
          rmse: number | null;
          bias: number | null;
          p50AbsError: number | null;
          p90AbsError: number | null;
        };
      }>;
      byDifficultyTarget: Array<{
        label: string;
        attempts: number;
        accuracy: { n: number; mae: number | null; rmse: number | null; bias: number | null };
        durationMs: {
          n: number;
          mae: number | null;
          rmse: number | null;
          bias: number | null;
          p50AbsError: number | null;
          p90AbsError: number | null;
        };
      }>;
    };
  }>;
  loggedMode: {
    attemptsEvaluated: number;
    accuracy: { n: number; mae: number | null; rmse: number | null; bias: number | null };
    durationMs: {
      n: number;
      mae: number | null;
      rmse: number | null;
      bias: number | null;
      p50AbsError: number | null;
      p90AbsError: number | null;
    };
    byPredictorVersion: Array<{
      predictorVersion: string;
      durationMs: {
        n: number;
        mae: number | null;
        rmse: number | null;
        bias: number | null;
        p50AbsError: number | null;
        p90AbsError: number | null;
      };
    }>;
  };
};

type FilterState = {
  policyA: PolicyId;
  policyB: PolicyId;
  timeRangeDays: number;
  maxAttempts: number;
  includeExcluded: boolean;
  includeUnknownEligibility: boolean;
};

const POLICY_OPTIONS: Array<{ id: PolicyId; label: string }> = [
  {
    id: "v1_accuracy_raw_duration_baseline",
    label: "Policy A · baseline",
  },
  {
    id: "v2_accuracy_beta_duration_unified",
    label: "Policy B · current",
  },
];

const DEFAULT_FILTERS: FilterState = {
  policyA: "v1_accuracy_raw_duration_baseline",
  policyB: "v2_accuracy_beta_duration_unified",
  timeRangeDays: 30,
  maxAttempts: 1000,
  includeExcluded: false,
  includeUnknownEligibility: false,
};

function formatNumber(value: number | null, digits = 3) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function formatInteger(value: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

export default function AdminPredictionBacktestPage() {
  const [draft, setDraft] = useState<FilterState>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [data, setData] = useState<BacktestPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      policyA: filters.policyA,
      policyB: filters.policyB,
      timeRangeDays: String(Math.max(1, Math.floor(filters.timeRangeDays))),
      maxAttempts: String(Math.max(10, Math.floor(filters.maxAttempts))),
      includeExcluded: filters.includeExcluded ? "1" : "0",
      includeUnknownEligibility: filters.includeUnknownEligibility ? "1" : "0",
    });

    authFetch(`/api/admin/prediction-backtest?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              "Failed to load prediction backtest data.",
          );
        }
        return response.json();
      })
      .then((json) => {
        if (!active) return;
        setError(null);
        setData(json as BacktestPayload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unknown error");
      });

    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Admin • Prediction Backtest</h2>
        <p className="mt-2 text-sm text-slate-300">
          Replay evaluation with strict prior-only history per attempt.
        </p>
      </div>

      <SectionCard title="Filters">
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({
              ...draft,
              timeRangeDays: Math.max(1, Math.floor(draft.timeRangeDays)),
              maxAttempts: Math.max(10, Math.floor(draft.maxAttempts)),
            });
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Policy A</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={draft.policyA}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  policyA: event.target.value as PolicyId,
                }))
              }
            >
              {POLICY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Policy B</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={draft.policyB}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  policyB: event.target.value as PolicyId,
                }))
              }
            >
              {POLICY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Range (days)</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              type="number"
              min={1}
              max={365}
              value={draft.timeRangeDays}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  timeRangeDays: Number(event.target.value || 30),
                }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Max attempts</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              type="number"
              min={10}
              max={5000}
              value={draft.maxAttempts}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  maxAttempts: Number(event.target.value || 1000),
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={draft.includeExcluded}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  includeExcluded: event.target.checked,
                }))
              }
            />
            Include excluded attempts
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={draft.includeUnknownEligibility}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  includeUnknownEligibility: event.target.checked,
                }))
              }
            />
            Include unknown eligibility
          </label>

          <button
            className="rounded-lg border border-slate-700 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
            type="submit"
          >
            Run backtest
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Execution">
        <StatGrid
          items={[
            { label: "Status", value: error ? "error" : "ready" },
            { label: "Engine version", value: data?.engineVersion ?? "-" },
            { label: "Generated at", value: data?.generatedAt ?? "-" },
            { label: "Attempts scanned", value: String(data?.execution.attemptsScanned ?? 0) },
            { label: "Attempts used", value: String(data?.execution.attemptsUsed ?? 0) },
            { label: "Runtime (ms)", value: String(data?.execution.runtimeMs ?? 0) },
          ]}
        />
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </SectionCard>

      <SectionCard title="Policy Summary">
        <TrendTable
          rows={(data?.policies ?? []).map((policy) => ({
            policy: policy.label,
            attempts: policy.attemptsEvaluated,
            accMae: formatNumber(policy.accuracy.mae, 3),
            accRmse: formatNumber(policy.accuracy.rmse, 3),
            accBias: formatNumber(policy.accuracy.bias, 3),
            durMae: formatInteger(policy.durationMs.mae),
            durRmse: formatInteger(policy.durationMs.rmse),
            durBias: formatInteger(policy.durationMs.bias),
          }))}
          columns={[
            { key: "policy", label: "Policy" },
            { key: "attempts", label: "Attempts" },
            { key: "accMae", label: "Acc MAE" },
            { key: "accRmse", label: "Acc RMSE" },
            { key: "accBias", label: "Acc Bias" },
            { key: "durMae", label: "Dur MAE (ms)" },
            { key: "durRmse", label: "Dur RMSE (ms)" },
            { key: "durBias", label: "Dur Bias (ms)" },
          ]}
        />
      </SectionCard>

      {(data?.policies ?? []).map((policy) => (
        <SectionCard key={`${policy.policyId}-calibration`} title={`${policy.label} · Accuracy Calibration`}>
          <TrendTable
            rows={policy.accuracy.calibrationBuckets.map((bucket) => ({
              bucket: bucket.bucket,
              n: bucket.n,
              predicted: formatNumber(bucket.avgPredicted, 3),
              actual: formatNumber(bucket.avgActual, 3),
              bias: formatNumber(bucket.bias, 3),
            }))}
            columns={[
              { key: "bucket", label: "Bucket" },
              { key: "n", label: "n" },
              { key: "predicted", label: "Pred avg" },
              { key: "actual", label: "Actual avg" },
              { key: "bias", label: "Bias" },
            ]}
          />
        </SectionCard>
      ))}

      {(data?.policies ?? []).map((policy) => (
        <SectionCard key={`${policy.policyId}-difficulty`} title={`${policy.label} · By Difficulty`}>
          <TrendTable
            rows={policy.stratified.byDifficultyTarget.map((row) => ({
              difficulty: row.label,
              attempts: row.attempts,
              accMae: formatNumber(row.accuracy.mae, 3),
              accBias: formatNumber(row.accuracy.bias, 3),
              durMae: formatInteger(row.durationMs.mae),
              durBias: formatInteger(row.durationMs.bias),
            }))}
            columns={[
              { key: "difficulty", label: "Difficulty" },
              { key: "attempts", label: "Attempts" },
              { key: "accMae", label: "Acc MAE" },
              { key: "accBias", label: "Acc Bias" },
              { key: "durMae", label: "Dur MAE (ms)" },
              { key: "durBias", label: "Dur Bias (ms)" },
            ]}
          />
        </SectionCard>
      ))}

      <SectionCard title="Logged Mode · By predictorVersion">
        <TrendTable
          rows={(data?.loggedMode.byPredictorVersion ?? []).map((row) => ({
            predictorVersion: row.predictorVersion,
            n: row.durationMs.n,
            durMae: formatInteger(row.durationMs.mae),
            durRmse: formatInteger(row.durationMs.rmse),
            durBias: formatInteger(row.durationMs.bias),
          }))}
          columns={[
            { key: "predictorVersion", label: "predictorVersion" },
            { key: "n", label: "n" },
            { key: "durMae", label: "Dur MAE (ms)" },
            { key: "durRmse", label: "Dur RMSE (ms)" },
            { key: "durBias", label: "Dur Bias (ms)" },
          ]}
        />
      </SectionCard>
    </section>
  );
}
