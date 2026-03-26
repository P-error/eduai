"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { authFetch, getAuthToken } from "@/lib/client-auth";
import { cardVariants, pageVariants, reducedMotion, sectionVariants } from "@/lib/motion";
import PageShell from "@/components/system/PageShell";
import Section from "@/components/system/Section";
import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import ForecastCard from "@/components/dashboard/ForecastCard";
import TrendMiniChart from "@/components/dashboard/TrendMiniChart";
import MasterySummaryCard from "@/components/dashboard/MasterySummaryCard";
import DifficultyStatusCard from "@/components/dashboard/DifficultyStatusCard";
import ConsistencyPanel from "@/components/dashboard/ConsistencyPanel";
import type { DashboardAttempt } from "@/components/dashboard/types";

type SubjectOption = {
  id: string;
  title: string;
};

type PredictionsPayload = {
  forTests?: {
    predicted?: {
      expectedAccuracy?: { value: number | null; confidence: number; basis: string };
      expectedTotalDurationMs?: {
        value: number | null;
        confidence: number;
        basis: string;
      };
    };
  };
};

type ProfilePayload = {
  pedagogy?: {
    currentDifficultyTarget?: string | null;
    recentAccuracy?: {
      value: number | null;
      sampleSize: number;
    };
  };
};

type DashboardPayload = {
  attempts: DashboardAttempt[];
};

const SUBJECT_STORAGE_KEY = "eduai.dashboard.subjectId";

function readStoredSubjectId() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SUBJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSubjectId(subjectId: string) {
  if (typeof window === "undefined") return;
  try {
    if (subjectId) {
      localStorage.setItem(SUBJECT_STORAGE_KEY, subjectId);
    } else {
      localStorage.removeItem(SUBJECT_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function queryWithSubject(path: string, subjectId: string, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra ?? {});
  if (subjectId) {
    params.set("subjectId", subjectId);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectFromQuery = searchParams.get("subjectId") ?? "";
  const prefersReducedMotion = useReducedMotion();

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [attempts, setAttempts] = useState<DashboardAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageMotion = reducedMotion(Boolean(prefersReducedMotion), pageVariants);
  const sectionMotion = reducedMotion(Boolean(prefersReducedMotion), sectionVariants);
  const cardMotion = reducedMotion(Boolean(prefersReducedMotion), cardVariants);

  useEffect(() => {
    if (getAuthToken()) return;
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSubjects() {
      const response = await authFetch("/api/subjects");
      if (response.status === 401) {
        if (active) {
          window.location.href = "/login";
        }
        return;
      }
      if (!response.ok) {
        if (active) {
          setSubjects([]);
        }
        return;
      }

      const json = (await response.json()) as Array<{ id: string; title: string }>;
      if (!active) return;

      const normalized = json.map((item) => ({ id: item.id, title: item.title }));
      setSubjects(normalized);

      const allowed = new Set(normalized.map((item) => item.id));
      const fromQuery = subjectFromQuery && allowed.has(subjectFromQuery)
        ? subjectFromQuery
        : null;
      const fromStorage = (() => {
        const stored = readStoredSubjectId();
        return stored && allowed.has(stored) ? stored : null;
      })();

      const initial = fromQuery ?? fromStorage ?? normalized[0]?.id ?? "";
      setSubjectId(initial);
    }

    loadSubjects();

    return () => {
      active = false;
    };
  }, [subjectFromQuery]);

  useEffect(() => {
    writeStoredSubjectId(subjectId);

    const params = new URLSearchParams(searchParams.toString());
    if (!subjectId) {
      if (!params.has("subjectId")) return;
      params.delete("subjectId");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
      return;
    }

    if (params.get("subjectId") === subjectId) return;

    params.set("subjectId", subjectId);
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams, subjectId]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const response = await authFetch("/api/users/me/profile");
      if (response.status === 401) {
        if (active) {
          window.location.href = "/login";
        }
        return;
      }
      if (!response.ok) {
        if (active) {
          setError("Failed to load profile summary.");
        }
        return;
      }

      const json = (await response.json()) as ProfilePayload;
      if (!active) return;
      setProfile(json);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      setLoading(true);
      setError(null);

      const [predictionResponse, dashboardResponse] = await Promise.all([
        authFetch(queryWithSubject("/api/users/me/predictions", subjectId)),
        authFetch(queryWithSubject("/api/users/me/dashboard", subjectId, { limit: "20" })),
      ]);

      if (predictionResponse.status === 401 || dashboardResponse.status === 401) {
        if (active) {
          window.location.href = "/login";
        }
        return;
      }

      if (!predictionResponse.ok || !dashboardResponse.ok) {
        if (active) {
          setError("Failed to load dashboard data.");
          setLoading(false);
        }
        return;
      }

      const [predictionJson, dashboardJson] = await Promise.all([
        predictionResponse.json() as Promise<PredictionsPayload>,
        dashboardResponse.json() as Promise<DashboardPayload>,
      ]);

      if (!active) return;
      setPredictions(predictionJson);
      setAttempts(Array.isArray(dashboardJson.attempts) ? dashboardJson.attempts : []);
      setLoading(false);
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, [subjectId]);

  const expectedAccuracy = predictions?.forTests?.predicted?.expectedAccuracy ?? null;
  const expectedDuration =
    predictions?.forTests?.predicted?.expectedTotalDurationMs ?? null;

  const masterySampleSize = profile?.pedagogy?.recentAccuracy?.sampleSize ?? 0;
  const masteryConfidence =
    masterySampleSize > 0
      ? clamp01(masterySampleSize / 20)
      : expectedAccuracy?.confidence ?? 0;
  const masteryValue =
    profile?.pedagogy?.recentAccuracy?.value ?? expectedAccuracy?.value ?? null;
  const evidenceLabel =
    masterySampleSize > 0
      ? `${masterySampleSize} recent attempts`
      : "forecast fallback";

  const lastActivity = attempts[0]?.createdAt ?? null;
  const recentChange = useMemo(() => {
    const row = attempts.find((attempt) => attempt.difficulty.changed);
    if (!row) {
      return {
        changed: false,
        reason: null,
        at: null,
      };
    }
    return {
      changed: true,
      reason: row.difficulty.reason,
      at: row.createdAt,
    };
  }, [attempts]);

  const currentDifficulty =
    profile?.pedagogy?.currentDifficultyTarget ?? attempts[0]?.difficulty.next ?? null;

  return (
    <PageShell className="py-2">
      <motion.div initial="hidden" animate="visible" variants={pageMotion}>
        <Section>
          <motion.div variants={sectionMotion}>
            <Card variant="surface2" className="p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
                  <h2 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
                    Prediction visibility at a glance
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    Forecasts, confidence, and trend quality in one place before each practice run.
                  </p>
                </div>

                <label className="grid gap-1 text-sm text-muted">
                  Subject focus
                  <select
                    className="radius-md border border-border bg-surface px-3 py-2 text-sm text-text"
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                  >
                    {subjects.length === 0 ? (
                      <option value="">All subjects</option>
                    ) : null}
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>
          </motion.div>

          {error ? (
            <motion.div variants={cardMotion}>
              <Card variant="danger" className="p-4 text-sm text-danger">
                {error}
              </Card>
            </motion.div>
          ) : null}

          <motion.div variants={sectionMotion} className="grid gap-5 xl:grid-cols-3">
            <div className="grid gap-5 xl:col-span-2">
              <motion.div variants={cardMotion}>
                <ForecastCard
                  expectedAccuracy={expectedAccuracy}
                  expectedDurationMs={expectedDuration}
                />
              </motion.div>

              <motion.div variants={cardMotion}>
                <TrendMiniChart attempts={attempts} />
              </motion.div>
            </div>

            <div className="grid gap-5">
              <motion.div variants={cardMotion}>
                <MasterySummaryCard
                  mastery={masteryValue}
                  confidence={masteryConfidence}
                  evidenceLabel={evidenceLabel}
                  lastActivityAt={lastActivity}
                />
              </motion.div>

              <motion.div variants={cardMotion}>
                <DifficultyStatusCard
                  currentDifficulty={currentDifficulty}
                  recentChange={recentChange}
                />
              </motion.div>

              <motion.div variants={cardMotion}>
                <ConsistencyPanel attempts={attempts} />
              </motion.div>
            </div>
          </motion.div>

          {loading ? (
            <motion.div variants={cardMotion}>
              <Card className="p-4 text-sm text-muted">Loading dashboard data...</Card>
            </motion.div>
          ) : null}

          {!loading && attempts.length === 0 ? (
            <motion.div variants={cardMotion}>
              <Card variant="hero" className="p-6">
                <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
                  <svg
                    viewBox="0 0 180 120"
                    className="h-24 w-36"
                    role="img"
                    aria-label="No attempts illustration"
                  >
                    <rect x="12" y="22" width="120" height="74" rx="12" fill="hsl(var(--surface2))" />
                    <rect x="22" y="36" width="62" height="8" rx="4" fill="hsl(var(--border))" />
                    <rect x="22" y="50" width="98" height="8" rx="4" fill="hsl(var(--border))" />
                    <rect x="22" y="64" width="44" height="8" rx="4" fill="hsl(var(--border))" />
                    <circle cx="138" cy="52" r="26" fill="hsl(var(--primary) / 0.18)" />
                    <path d="M126 53l8 8 16-18" stroke="hsl(var(--primary))" strokeWidth="4" fill="none" strokeLinecap="round" />
                  </svg>

                  <div>
                    <p className="text-lg font-semibold text-text">No data yet</p>
                    <p className="mt-1 text-sm text-muted">
                      Complete your first practice test to unlock trend and consistency metrics.
                    </p>
                    <div className="mt-4">
                      <Link className="sys-button-primary" href="/practice">
                        Start first practice
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ) : null}

          <motion.div variants={cardMotion}>
            <Card variant="surface2" className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">More views</p>
                  <p className="mt-1 text-sm text-muted">
                    Open progress detail or broader insights.
                  </p>
                </div>
                <Pill tone="muted">Read-only analytics view</Pill>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <Link className="sys-button-secondary" href="/progress">
                  View progress
                </Link>
                <Link className="sys-button-secondary" href="/insights">
                  View insights
                </Link>
              </div>
            </Card>
          </motion.div>
        </Section>
      </motion.div>
    </PageShell>
  );
}
