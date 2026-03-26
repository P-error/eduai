"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch, getAuthToken } from "@/lib/client-auth";

type MePayload = {
  testsTaken?: number;
  personalizationReady?: boolean;
  name?: string | null;
};

type PredictionsPayload = {
  forTests?: {
    predicted?: {
      expectedAccuracy?: { value: number | null };
    };
  };
};

export default function StatusPanel() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      return;
    }

    let active = true;
    async function load() {
      const [meRes, predRes] = await Promise.all([
        authFetch("/api/users/me"),
        authFetch("/api/users/me/predictions"),
      ]);
      if (active && meRes.ok) {
        setMe((await meRes.json()) as MePayload);
      }
      if (active && predRes.ok) {
        setPredictions((await predRes.json()) as PredictionsPayload);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const expectedAccuracy = useMemo(
    () => predictions?.forTests?.predicted?.expectedAccuracy?.value ?? null,
    [predictions],
  );

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
      <div className="mt-3 grid gap-2 text-slate-300">
        <div className="flex justify-between">
          <span>Tests done</span>
          <span>{me?.testsTaken ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span>Adaptation</span>
          <span>{me?.personalizationReady ? "Ready" : "Growing"}</span>
        </div>
        <div className="flex justify-between">
          <span>Expected score</span>
          <span>
            {expectedAccuracy == null
              ? "-"
              : `${(expectedAccuracy * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="rounded-full border border-slate-700 px-3 py-1 text-xs" href="/practice">
          Practice
        </Link>
        <Link className="rounded-full border border-slate-700 px-3 py-1 text-xs" href="/learn">
          Learn
        </Link>
      </div>
    </aside>
  );
}
