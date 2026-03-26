"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { SectionCard, StatGrid } from "./_components/ChartBlocks";

type DataQualityPayload = {
  attemptsStack?: Array<{ total: number; eligible: number; excluded: number }>;
};

type PredictionPayload = {
  samples?: { accuracy?: { n: number }; duration?: { n: number } };
  accuracy?: { mae: number | null; rmse: number | null; bias: number | null };
};

export default function AdminOverviewPage() {
  const [quality, setQuality] = useState<DataQualityPayload | null>(null);
  const [pred, setPred] = useState<PredictionPayload | null>(null);

  const qualityTotals = useMemo(() => {
    const rows = quality?.attemptsStack ?? [];
    return rows.reduce(
      (acc, row) => ({
        total: acc.total + (row.total ?? 0),
        eligible: acc.eligible + (row.eligible ?? 0),
        excluded: acc.excluded + (row.excluded ?? 0),
      }),
      { total: 0, eligible: 0, excluded: 0 },
    );
  }, [quality]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [qualityRes, predRes] = await Promise.all([
        authFetch("/api/admin/data-quality-metrics?window=30d&policyMode=any"),
        authFetch("/api/admin/prediction-metrics?window=30d&policyMode=any"),
      ]);
      if (active && qualityRes.ok) {
        setQuality((await qualityRes.json()) as DataQualityPayload);
      }
      if (active && predRes.ok) {
        setPred((await predRes.json()) as PredictionPayload);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Admin Overview</h2>
        <p className="mt-2 text-sm text-slate-300">
          High-level observability for data quality, personalization, predictions, chat, and tests.
        </p>
      </div>

      <SectionCard title="System Snapshot">
        <StatGrid
          items={[
            { label: "Attempts (30d)", value: String(qualityTotals.total) },
            { label: "Eligible (30d)", value: String(qualityTotals.eligible) },
            { label: "Excluded (30d)", value: String(qualityTotals.excluded) },
            {
              label: "Excluded rate",
              value:
                qualityTotals.total === 0
                  ? "-"
                  : `${((qualityTotals.excluded / qualityTotals.total) * 100).toFixed(1)}%`,
            },
            {
              label: "Prediction samples (accuracy)",
              value: String(pred?.samples?.accuracy?.n ?? 0),
            },
            {
              label: "Prediction MAE",
              value: pred?.accuracy?.mae == null ? "-" : pred.accuracy.mae.toFixed(3),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Admin Sections">
        <div className="grid gap-3 md:grid-cols-2">
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/data-quality">
            Data Quality
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/personalization">
            Personalization
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/predictions">
            Predictions
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/prediction-backtest">
            Prediction backtest
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/prediction-calibration">
            Prediction calibration
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/chat">
            Chat
          </Link>
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/tests">
            Tests
          </Link>
        </div>
      </SectionCard>
    </section>
  );
}
