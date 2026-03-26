"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type PredictionsPayload = {
  forTests?: {
    predicted?: {
      expectedAccuracy?: { value: number | null; confidence: number };
      expectedTotalDurationMs?: { value: number | null; confidence: number };
    };
  };
  notes?: { disclaimer?: string[]; limitations?: string[] };
};

type CalibrationPayload = {
  samples?: { accuracy?: { n: number }; duration?: { n: number } };
  accuracy?: { mae: number | null; bias: number | null };
  durationMs?: { mae: number | null; bias: number | null };
};

function fmtPercent(value: number | null) {
  if (value == null) return "Not enough data yet";
  return `${(value * 100).toFixed(0)}%`;
}

export default function InsightsPage() {
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [calibration, setCalibration] = useState<CalibrationPayload | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [predRes, calRes] = await Promise.all([
        authFetch("/api/users/me/predictions"),
        authFetch("/api/users/me/prediction-metrics?window=30d"),
      ]);
      if (active && predRes.ok) {
        setPredictions((await predRes.json()) as PredictionsPayload);
      }
      if (active && calRes.ok) {
        setCalibration((await calRes.json()) as CalibrationPayload);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Insights</h2>
        <p className="mt-2 text-sm text-slate-300">
          Understand how adaptation works and how confidence grows with your activity.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">How personalization works</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>Personalized mode adapts explanations and practice settings to your recent behavior.</li>
          <li>Standard mode uses stable defaults to provide a neutral baseline.</li>
          <li>Confidence grows with sample size and data quality.</li>
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs uppercase text-slate-400">Expected accuracy</p>
          <p className="mt-2 text-2xl font-semibold">
            {fmtPercent(predictions?.forTests?.predicted?.expectedAccuracy?.value ?? null)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            confidence {predictions?.forTests?.predicted?.expectedAccuracy?.confidence?.toFixed(2) ?? "0.00"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs uppercase text-slate-400">Prediction error (accuracy MAE)</p>
          <p className="mt-2 text-2xl font-semibold">
            {calibration?.accuracy?.mae == null ? "-" : calibration.accuracy.mae.toFixed(3)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            n={calibration?.samples?.accuracy?.n ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs uppercase text-slate-400">Duration error (MAE)</p>
          <p className="mt-2 text-2xl font-semibold">
            {calibration?.durationMs?.mae == null
              ? "-"
              : `${Math.round(calibration.durationMs.mae / 1000)}s`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            n={calibration?.samples?.duration?.n ?? 0}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Notes</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
          {(predictions?.notes?.disclaimer ?? [
            "Predictions are heuristic proxies based on recent activity.",
          ]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded-full border border-slate-700 px-4 py-2 text-sm" href="/practice">
            Practice now
          </Link>
          <Link className="rounded-full border border-slate-700 px-4 py-2 text-sm" href="/learn">
            Ask in chat
          </Link>
        </div>
      </div>
    </section>
  );
}
