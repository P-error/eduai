"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { authFetch } from "@/lib/client-auth";
import { cardVariants, pageVariants, reducedMotion, sectionVariants } from "@/lib/motion";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
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
import { buildAnalyticsNextStepDecision } from "@/lib/analytics-next-step";
import {
  buildAnalyticsSubjectHref,
  resolveAnalyticsSubjectUrlState,
} from "@/lib/analytics-subject-url";

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

type DashboardPayload = {
  summary?: {
    attemptsRecorded?: number;
    attemptsLearningEligible?: number;
    attemptsExcluded?: number;
    recentAccuracy?: {
      value?: number | null;
      sampleSize?: number;
    } | null;
    recentEvidence?: {
      windowSize?: number;
      recorded?: number;
      learningEligible?: number;
      excluded?: number;
    } | null;
    currentDifficultyTarget?: string | null;
    lastRecordedAttemptAt?: string | null;
  } | null;
  attempts?: DashboardAttempt[] | null;
};

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
  const { locale, messages } = useUiLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectFromQuery = searchParams.get("subjectId") ?? "";
  const searchString = searchParams.toString();
  const prefersReducedMotion = useReducedMotion();

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectId, setSubjectId] = useState(subjectFromQuery);
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [attempts, setAttempts] = useState<DashboardAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageMotion = reducedMotion(Boolean(prefersReducedMotion), pageVariants);
  const sectionMotion = reducedMotion(Boolean(prefersReducedMotion), sectionVariants);
  const cardMotion = reducedMotion(Boolean(prefersReducedMotion), cardVariants);

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
          const pendingUrlState = resolveAnalyticsSubjectUrlState({
            pathname,
            search: searchString,
            validSubjectIds: [],
            subjectsLoaded: false,
          });
          setSubjectId(pendingUrlState.selectedSubjectId);
        }
        return;
      }

      const json = (await response.json()) as Array<{ id: string; title: string }>;
      if (!active) return;

      const normalized = json.map((item) => ({ id: item.id, title: item.title }));
      setSubjects(normalized);
      const urlState = resolveAnalyticsSubjectUrlState({
        pathname,
        search: searchString,
        validSubjectIds: normalized.map((item) => item.id),
        subjectsLoaded: true,
      });
      setSubjectId(urlState.selectedSubjectId);

      const currentHref = searchString ? `${pathname}?${searchString}` : pathname;
      if (urlState.replaceHref && urlState.replaceHref !== currentHref) {
        router.replace(urlState.replaceHref, { scroll: false });
      }
    }

    loadSubjects();

    return () => {
      active = false;
    };
  }, [pathname, router, searchString]);

  function handleSubjectChange(nextSubjectId: string) {
    setSubjectId(nextSubjectId);

    const currentHref = searchString ? `${pathname}?${searchString}` : pathname;
    const nextHref = buildAnalyticsSubjectHref(
      pathname,
      searchString,
      nextSubjectId || null,
    );
    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }

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
          setError(messages.analytics.errorFallback);
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
      setDashboard(dashboardJson);
      setAttempts(Array.isArray(dashboardJson.attempts) ? dashboardJson.attempts : []);
      setLoading(false);
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, [locale, messages.analytics.errorFallback, subjectId]);

  const expectedAccuracy = predictions?.forTests?.predicted?.expectedAccuracy ?? null;
  const expectedDuration =
    predictions?.forTests?.predicted?.expectedTotalDurationMs ?? null;

  const dashboardSummary = dashboard?.summary ?? null;
  const recentAccuracy = dashboardSummary?.recentAccuracy ?? null;
  const recentEvidence = dashboardSummary?.recentEvidence ?? null;
  const masterySampleSize =
    typeof recentAccuracy?.sampleSize === "number" &&
    Number.isFinite(recentAccuracy.sampleSize)
      ? recentAccuracy.sampleSize
      : 0;
  const masteryConfidence =
    masterySampleSize > 0
      ? clamp01(masterySampleSize / 20)
      : expectedAccuracy?.confidence ?? 0;
  const masteryValue =
    recentAccuracy?.value ?? expectedAccuracy?.value ?? null;
  const evidenceLabel =
    masterySampleSize > 0
      ? `${recentEvidence?.learningEligible ?? masterySampleSize} ${messages.analytics.evidenceRecentAttempts}`
      : messages.analytics.evidenceForecastFallback;

  const lastActivity = dashboardSummary?.lastRecordedAttemptAt ?? attempts[0]?.createdAt ?? null;
  const recentChange = useMemo(() => {
    const row = attempts.find((attempt) => attempt.difficulty?.changed === true);
    if (!row) {
      return {
        changed: false,
        reason: null,
        at: null,
      };
    }
    return {
      changed: true,
      reason: row.difficulty?.reason ?? null,
      at: row.createdAt,
    };
  }, [attempts]);

  const currentDifficulty =
    dashboardSummary?.currentDifficultyTarget ?? attempts[0]?.difficulty?.next ?? null;
  const selectedSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const nextStepDecision = buildAnalyticsNextStepDecision({
    subjectId,
    topicLabel: selectedSubject?.title ?? null,
    summary: dashboardSummary,
    attempts,
  });
  const nextStep = (() => {
    if (nextStepDecision.kind === "weak_topic" && nextStepDecision.topicLabel) {
      return {
        title: messages.analytics.nextStepWeakTitle.replace(
          "{topic}",
          nextStepDecision.topicLabel,
        ),
        body: messages.analytics.nextStepWeakBody,
        cta: messages.analytics.nextStepLearnCta,
        href: nextStepDecision.learnHref,
      };
    }

    if (nextStepDecision.kind === "practice_instability") {
      return {
        title: messages.analytics.nextStepPracticeTitle,
        body: messages.analytics.nextStepPracticeBody,
        cta: messages.analytics.nextStepPracticeCta,
        href: nextStepDecision.practiceHref,
      };
    }

    if (nextStepDecision.kind === "continue_learning") {
      return {
        title: messages.analytics.nextStepFallbackTitle,
        body: messages.analytics.nextStepFallbackBody,
        cta: messages.analytics.nextStepLearnCta,
        href: nextStepDecision.learnHref,
      };
    }

    return {
        title: messages.analytics.nextStepDataTitle,
        body: messages.analytics.nextStepDataBody,
        cta: messages.analytics.nextStepLearnCta,
        href: nextStepDecision.learnHref,
      };
  })();

  return (
    <PageShell className="py-2">
      <motion.div initial="hidden" animate="visible" variants={pageMotion}>
        <Section>
          <motion.div variants={sectionMotion}>
            <Card variant="surface2" className="p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    {messages.shell.nav.analytics}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
                    {messages.analytics.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    {messages.analytics.subtitle}
                  </p>
                </div>

                <label className="grid gap-1 text-sm text-muted">
                  {messages.analytics.topicFocus}
                  <select
                    className="radius-md border border-border bg-surface px-3 py-2 text-sm text-text"
                    value={subjectId}
                    onChange={(event) => handleSubjectChange(event.target.value)}
                  >
                    <option value="">{messages.common.allTopics}</option>
                    {subjectId && !subjects.some((subject) => subject.id === subjectId) ? (
                      <option value={subjectId}>{subjectId}</option>
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
              <Card
                variant="danger"
                className="p-4 text-sm text-danger"
                role="alert"
              >
                <p className="font-medium">{error}</p>
                <p className="mt-2">{messages.analytics.errorNextStep}</p>
                <div className="mt-3">
                  <Link className="sys-button-secondary" href="/learn">
                    {messages.analytics.nextStepLearnCta}
                  </Link>
                </div>
              </Card>
            </motion.div>
          ) : null}

          <motion.div variants={cardMotion}>
            <Card variant="hero" className="p-6 md:p-7" role="status" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    {messages.analytics.nextStepTitle}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-text">
                    {nextStep.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    {nextStep.body}
                  </p>
                </div>
                <Link className="sys-button-primary shrink-0" href={nextStep.href}>
                  {nextStep.cta}
                </Link>
              </div>
            </Card>
          </motion.div>

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

              <motion.div variants={cardMotion}>
                <Card variant="surface2" className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    {messages.analytics.currentScopeSummary}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm text-muted">
                    <div className="flex items-center justify-between gap-3">
                      <span>{messages.common.recordedAttempts}</span>
                      <span className="text-text">
                        {dashboardSummary?.attemptsRecorded ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{messages.common.learningUpdates}</span>
                      <span className="text-text">
                        {dashboardSummary?.attemptsLearningEligible ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{messages.profile.excludedAttempts}</span>
                      <span className="text-text">
                        {dashboardSummary?.attemptsExcluded ?? 0}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </motion.div>

          {loading ? (
            <motion.div variants={cardMotion}>
              <Card className="p-4 text-sm text-muted" role="status" aria-live="polite">
                <p className="font-medium text-text">{messages.analytics.loading}</p>
                <p className="mt-2">{messages.analytics.loadingBody}</p>
              </Card>
            </motion.div>
          ) : null}

          {!loading && attempts.length === 0 ? (
            <motion.div variants={cardMotion}>
              <Card variant="hero" className="p-6" role="status">
                <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
                  <svg
                    viewBox="0 0 180 120"
                    className="h-24 w-36"
                    role="img"
                    aria-label={messages.analytics.noAttemptsIllustration}
                  >
                    <rect x="12" y="22" width="120" height="74" rx="12" fill="hsl(var(--surface2))" />
                    <rect x="22" y="36" width="62" height="8" rx="4" fill="hsl(var(--border))" />
                    <rect x="22" y="50" width="98" height="8" rx="4" fill="hsl(var(--border))" />
                    <rect x="22" y="64" width="44" height="8" rx="4" fill="hsl(var(--border))" />
                    <circle cx="138" cy="52" r="26" fill="hsl(var(--primary) / 0.18)" />
                    <path d="M126 53l8 8 16-18" stroke="hsl(var(--primary))" strokeWidth="4" fill="none" strokeLinecap="round" />
                  </svg>

                  <div>
                    <p className="text-lg font-semibold text-text">{messages.analytics.emptyTitle}</p>
                    <p className="mt-1 text-sm text-muted">
                      {messages.analytics.emptyBody}
                    </p>
                    <div className="mt-4">
                      <Link className="sys-button-primary" href="/learn">
                        {messages.analytics.startFirstEpisode}
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
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    {messages.analytics.moreViews}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {messages.analytics.moreViewsBody}
                  </p>
                </div>
                <Pill tone="muted">{messages.analytics.readOnlyPill}</Pill>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-3">
                {messages.analytics.moreViewsCards.map((item) => (
                  <div key={item} className="rounded-2xl border border-border bg-surface p-4">
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <Link className="sys-button-secondary" href="/practice">
                  {messages.common.openPractice}
                </Link>
                <Link className="sys-button-secondary" href="/topics">
                  {messages.common.openTopics}
                </Link>
              </div>
            </Card>
          </motion.div>
        </Section>
      </motion.div>
    </PageShell>
  );
}
