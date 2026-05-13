"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { SectionCard, StatGrid, TrendTable } from "../_components/ChartBlocks";

type GridSize = "small" | "medium" | "large";

type CalibrationMetrics = {
  attemptsEvaluated: number;
  accuracy: {
    n: number;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
  };
  durationMs: {
    n: number;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    p50AbsError: number | null;
    p90AbsError: number | null;
  };
  calibrationProxy: number | null;
  byDifficultyTarget: Array<{
    label: string;
    attempts: number;
    accuracy: { n: number; rmse: number | null; bias: number | null };
    durationMs: { n: number; rmse: number | null; bias: number | null };
  }>;
};

type CalibrationResponseOk = {
  status: "ok";
  engineVersion: string;
  generatedAt: string;
  defaultParams: {
    params: {
      diffAdjustMag: number;
      betaA: number;
      betaB: number;
      durationPriorQuestions: number;
      durationFullEvidenceQuestions: number;
    };
    calibration: CalibrationMetrics | null;
    holdout: CalibrationMetrics | null;
  };
  bestParams: {
    params: {
      diffAdjustMag: number;
      betaA: number;
      betaB: number;
      durationPriorQuestions: number;
      durationFullEvidenceQuestions: number;
    };
    calibration: CalibrationMetrics;
  } | null;
  bestParamsHoldout: {
    params: {
      diffAdjustMag: number;
      betaA: number;
      betaB: number;
      durationPriorQuestions: number;
      durationFullEvidenceQuestions: number;
    };
    holdout: CalibrationMetrics | null;
  } | null;
  recommendedParams: {
    params: {
      diffAdjustMag: number;
      betaA: number;
      betaB: number;
      durationPriorQuestions: number;
      durationFullEvidenceQuestions: number;
    };
    reason: string;
  };
  stability: {
    unstable: boolean;
    holdoutAccuracyRmseDeltaPct: number | null;
    reason: string;
  };
  rankedTopCandidates: Array<{
    rank: number;
    params: {
      diffAdjustMag: number;
      betaA: number;
      betaB: number;
      durationPriorQuestions: number;
      durationFullEvidenceQuestions: number;
    };
    calibration: CalibrationMetrics;
    holdout: CalibrationMetrics | null;
    objective: {
      tuple: [number, number, number, number, number];
    };
  }>;
  executionStats: {
    runtimeMs: number;
    candidatesEvaluated: number;
    attemptsScanned: number;
    calibrationAttempts: number;
    holdoutAttempts: number;
    calibrationIncluded: number;
    holdoutIncluded: number;
  };
  apply: {
    requested: boolean;
    applied: boolean;
    reason: string;
    path?: string;
  };
};

type CalibrationResponseInsufficient = {
  status: "insufficient_data";
  engineVersion: string;
  generatedAt: string;
  message: string;
  counts: {
    scannedAttempts: number;
    calibrationAttempts: number;
    holdoutAttempts: number;
    calibrationIncluded: number;
    holdoutIncluded: number;
  };
  apply: {
    requested: boolean;
    applied: boolean;
    reason: string;
  };
};

type CalibrationResponse = CalibrationResponseOk | CalibrationResponseInsufficient;

type FilterState = {
  timeRangeDays: number;
  maxAttempts: number;
  includeExcluded: boolean;
  includeUnknownEligibility: boolean;
  grid: GridSize;
  apply: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  timeRangeDays: 30,
  maxAttempts: 1000,
  includeExcluded: false,
  includeUnknownEligibility: false,
  grid: "small",
  apply: false,
};

function formatNumber(value: number | null, digits = 3) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function formatInteger(value: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

function metricValue(metrics: CalibrationMetrics | null, key: "accuracyRmse" | "accuracyBias" | "durationRmse" | "durationBias") {
  if (!metrics) return "-";
  if (key === "accuracyRmse") return formatNumber(metrics.accuracy.rmse, 3);
  if (key === "accuracyBias") return formatNumber(metrics.accuracy.bias, 3);
  if (key === "durationRmse") return formatInteger(metrics.durationMs.rmse);
  return formatInteger(metrics.durationMs.bias);
}

export default function AdminPredictionCalibrationPage() {
  const [draft, setDraft] = useState<FilterState>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      timeRangeDays: String(Math.max(1, Math.floor(filters.timeRangeDays))),
      maxAttempts: String(Math.max(10, Math.floor(filters.maxAttempts))),
      includeExcluded: filters.includeExcluded ? "1" : "0",
      includeUnknownEligibility: filters.includeUnknownEligibility ? "1" : "0",
      grid: filters.grid,
      apply: filters.apply ? "1" : "0",
    });

    authFetch(`/api/admin/prediction-calibration?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              "Failed to run prediction calibration.",
          );
        }
        return response.json();
      })
      .then((json) => {
        if (!active) return;
        setError(null);
        setData(json as CalibrationResponse);
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

  const recommendedJson = useMemo(() => {
    if (!data || data.status !== "ok") return "";
    return JSON.stringify(data.recommendedParams.params, null, 2);
  }, [data]);

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Admin • Prediction Calibration</h2>
        <p className="mt-2 text-sm text-slate-300">
          Deterministic grid search over policy-B parameters with calibration/holdout split.
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
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Grid size</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={draft.grid}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  grid: event.target.value as GridSize,
                }))
              }
            >
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
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
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input
              type="checkbox"
              checked={draft.apply}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  apply: event.target.checked,
                }))
              }
            />
            Apply recommended params
          </label>
          <button
            className="rounded-lg border border-slate-700 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
            type="submit"
          >
            Run calibration
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Execution">
        <StatGrid
          items={[
            { label: "Status", value: error ? "error" : data?.status ?? "ready" },
            { label: "Engine version", value: data?.engineVersion ?? "-" },
            { label: "Generated at", value: data?.generatedAt ?? "-" },
            {
              label: "Candidates evaluated",
              value:
                data && data.status === "ok"
                  ? String(data.executionStats.candidatesEvaluated)
                  : "-",
            },
            {
              label: "Runtime (ms)",
              value: data && data.status === "ok" ? String(data.executionStats.runtimeMs) : "-",
            },
            {
              label: "Applied",
              value:
                data?.apply == null
                  ? "-"
                  : data.apply.applied
                    ? "yes"
                    : "no",
            },
          ]}
        />
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </SectionCard>

      {data && data.status === "insufficient_data" ? (
        <SectionCard title="Insufficient Data">
          <p className="text-sm text-amber-200">{data.message}</p>
          <StatGrid
            items={[
              { label: "Scanned", value: String(data.counts.scannedAttempts) },
              { label: "Calibration rows", value: String(data.counts.calibrationAttempts) },
              { label: "Holdout rows", value: String(data.counts.holdoutAttempts) },
              { label: "Calibration included", value: String(data.counts.calibrationIncluded) },
              { label: "Holdout included", value: String(data.counts.holdoutIncluded) },
              { label: "Apply reason", value: data.apply.reason },
            ]}
          />
        </SectionCard>
      ) : null}

      {data && data.status === "ok" ? (
        <>
          <SectionCard title="Default vs Best vs Holdout">
            <TrendTable
              rows={[
                {
                  set: "default (calibration)",
                  accRmse: metricValue(data.defaultParams.calibration, "accuracyRmse"),
                  accBias: metricValue(data.defaultParams.calibration, "accuracyBias"),
                  durRmse: metricValue(data.defaultParams.calibration, "durationRmse"),
                  durBias: metricValue(data.defaultParams.calibration, "durationBias"),
                },
                {
                  set: "best (calibration)",
                  accRmse: metricValue(data.bestParams?.calibration ?? null, "accuracyRmse"),
                  accBias: metricValue(data.bestParams?.calibration ?? null, "accuracyBias"),
                  durRmse: metricValue(data.bestParams?.calibration ?? null, "durationRmse"),
                  durBias: metricValue(data.bestParams?.calibration ?? null, "durationBias"),
                },
                {
                  set: "default (holdout)",
                  accRmse: metricValue(data.defaultParams.holdout, "accuracyRmse"),
                  accBias: metricValue(data.defaultParams.holdout, "accuracyBias"),
                  durRmse: metricValue(data.defaultParams.holdout, "durationRmse"),
                  durBias: metricValue(data.defaultParams.holdout, "durationBias"),
                },
                {
                  set: "best (holdout)",
                  accRmse: metricValue(data.bestParamsHoldout?.holdout ?? null, "accuracyRmse"),
                  accBias: metricValue(data.bestParamsHoldout?.holdout ?? null, "accuracyBias"),
                  durRmse: metricValue(data.bestParamsHoldout?.holdout ?? null, "durationRmse"),
                  durBias: metricValue(data.bestParamsHoldout?.holdout ?? null, "durationBias"),
                },
              ]}
              columns={[
                { key: "set", label: "Set" },
                { key: "accRmse", label: "Acc RMSE" },
                { key: "accBias", label: "Acc Bias" },
                { key: "durRmse", label: "Dur RMSE (ms)" },
                { key: "durBias", label: "Dur Bias (ms)" },
              ]}
            />
          </SectionCard>

          <SectionCard title="Recommended Params JSON">
            <p className="mb-2 text-sm text-slate-300">Reason: {data.recommendedParams.reason}</p>
            <textarea
              className="min-h-[170px] w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs"
              value={recommendedJson}
              readOnly
            />
            <p className={`mt-2 text-sm ${data.stability.unstable ? "text-amber-300" : "text-emerald-300"}`}>
              Stability: {data.stability.reason}
              {data.stability.holdoutAccuracyRmseDeltaPct != null
                ? ` (${data.stability.holdoutAccuracyRmseDeltaPct.toFixed(2)}%)`
                : ""}
            </p>
          </SectionCard>

          <SectionCard title="Top Candidates">
            <TrendTable
              rows={data.rankedTopCandidates.map((candidate) => ({
                rank: candidate.rank,
                diffAdjustMag: candidate.params.diffAdjustMag.toFixed(3),
                beta: `${candidate.params.betaA.toFixed(2)}/${candidate.params.betaB.toFixed(2)}`,
                priorQ: candidate.params.durationPriorQuestions,
                fullQ: candidate.params.durationFullEvidenceQuestions,
                accRmseCal: formatNumber(candidate.calibration.accuracy.rmse, 3),
                accBiasCal: formatNumber(candidate.calibration.accuracy.bias, 3),
                durRmseCal: formatInteger(candidate.calibration.durationMs.rmse),
                accRmseHold: formatNumber(candidate.holdout?.accuracy.rmse ?? null, 3),
                durRmseHold: formatInteger(candidate.holdout?.durationMs.rmse ?? null),
              }))}
              columns={[
                { key: "rank", label: "Rank" },
                { key: "diffAdjustMag", label: "diffAdjustMag" },
                { key: "beta", label: "betaA/betaB" },
                { key: "priorQ", label: "durationPriorQ" },
                { key: "fullQ", label: "durationFullQ" },
                { key: "accRmseCal", label: "Acc RMSE (cal)" },
                { key: "accBiasCal", label: "Acc Bias (cal)" },
                { key: "durRmseCal", label: "Dur RMSE (cal)" },
                { key: "accRmseHold", label: "Acc RMSE (hold)" },
                { key: "durRmseHold", label: "Dur RMSE (hold)" },
              ]}
            />
          </SectionCard>

          <SectionCard title="Best Candidate • By Difficulty">
            <TrendTable
              rows={(data.bestParams?.calibration.byDifficultyTarget ?? []).map((row) => ({
                difficulty: row.label,
                attempts: row.attempts,
                accRmse: formatNumber(row.accuracy.rmse, 3),
                accBias: formatNumber(row.accuracy.bias, 3),
                durRmse: formatInteger(row.durationMs.rmse),
                durBias: formatInteger(row.durationMs.bias),
              }))}
              columns={[
                { key: "difficulty", label: "Difficulty" },
                { key: "attempts", label: "Attempts" },
                { key: "accRmse", label: "Acc RMSE" },
                { key: "accBias", label: "Acc Bias" },
                { key: "durRmse", label: "Dur RMSE (ms)" },
                { key: "durBias", label: "Dur Bias (ms)" },
              ]}
            />
          </SectionCard>
        </>
      ) : null}
    </section>
  );
}
