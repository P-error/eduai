"use client";

import Link from "next/link";

export default function AdminAnalyticsLegacyPage() {
  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-amber-700/50 bg-amber-950/30 p-6">
        <h2 className="text-2xl font-semibold">Admin • Legacy Analytics Deprecated</h2>
        <p className="mt-2 text-sm text-amber-100">
          This legacy page was removed to avoid mixing outdated metrics logic with the current
          eligibility-filtered observability stack.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold">Use these pages instead</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
          <Link className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" href="/admin/tests">
            Tests
          </Link>
        </div>
      </div>
    </section>
  );
}
