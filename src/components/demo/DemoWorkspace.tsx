"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/system/Card";
import PageShell from "@/components/system/PageShell";
import Pill from "@/components/system/Pill";
import Section from "@/components/system/Section";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";
import { cardVariants, reducedMotion } from "@/lib/motion";
import {
  DEFAULT_DEMO_SCENE_ID,
  DEMO_ANALYTICS_BLOCKS,
  DEMO_LEARN_DIALOGUE,
  DEMO_MONTAGE,
  DEMO_PRACTICE_ADAPTED,
  DEMO_PRACTICE_BASELINE,
  DEMO_PROFILE_INITIAL,
  DEMO_PROFILE_UPDATED,
  DEMO_SCENES,
  DEMO_TOPIC_PATH,
  demoSceneHref,
  getDemoSceneById,
  isDemoSceneId,
  type DemoObservationRow,
  type DemoPracticeSnapshot,
  type DemoProfileSnapshot,
  type DemoSceneId,
  type DemoTopicNode,
} from "@/lib/demo-script";

const SURFACE_ACCENT: Record<string, "primary" | "success" | "warning" | "muted"> = {
  profile: "primary",
  topics: "muted",
  practice: "warning",
  learn: "primary",
  analytics: "success",
};

function valuePillTone(
  tone: DemoObservationRow["tone"],
): "primary" | "success" | "warning" | "muted" {
  if (tone === "primary") return "primary";
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "muted";
}

function sceneIndexById(sceneId: DemoSceneId) {
  return DEMO_SCENES.findIndex((scene) => scene.id === sceneId);
}

function sceneProgressValue(sceneId: DemoSceneId) {
  const index = sceneIndexById(sceneId);
  return `${index + 1}/${DEMO_SCENES.length}`;
}

function controlClass(primary = false, disabled = false) {
  return cx(
    primary ? "sys-button-primary" : "sys-button-secondary",
    disabled && "cursor-not-allowed opacity-50",
  );
}

function RowList({
  rows,
  subdued = false,
}: {
  rows: Array<{ label: string; value: string }>;
  subdued?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className={cx(
            "radius-md flex items-center justify-between gap-3 border border-border px-4 py-3 text-sm",
            subdued ? "bg-surface/70" : "bg-surface2/75",
          )}
        >
          <span className="text-muted">{row.label}</span>
          <span className="text-right font-medium text-text">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function ObservationList({ rows }: { rows: DemoObservationRow[] }) {
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="radius-md flex items-center justify-between gap-3 border border-border bg-surface2/75 px-4 py-3 text-sm"
        >
          <span className="text-muted">{row.label}</span>
          <Pill tone={valuePillTone(row.tone)}>{row.value}</Pill>
        </div>
      ))}
    </div>
  );
}

function SceneFrame({
  sceneId,
  children,
}: {
  sceneId: DemoSceneId;
  children: React.ReactNode;
}) {
  const scene = getDemoSceneById(sceneId);

  return (
    <div className="grid gap-4">
      <Card variant="surface2" className="p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{scene.label}</p>
            <h2 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
              {scene.title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={SURFACE_ACCENT[scene.surface] ?? "muted"}>
              {scene.surface.charAt(0).toUpperCase() + scene.surface.slice(1)}
            </Pill>
            <Pill tone="muted">Scripted showcase</Pill>
          </div>
        </div>
      </Card>

      {children}

      <Card className="border border-sky-200/70 bg-sky-50/80 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Caption</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{scene.caption}</p>
      </Card>
    </div>
  );
}

function TopicTree({
  nodes,
  depth = 0,
}: {
  nodes: DemoTopicNode[];
  depth?: number;
}) {
  return (
    <div className="grid gap-3">
      {nodes.map((node) => (
        <div key={`${depth}-${node.label}`} style={{ marginLeft: depth * 18 }}>
          <div className="radius-md border border-border bg-surface2/80 px-4 py-3">
            <p className="text-sm font-semibold text-text">{node.label}</p>
          </div>
          {node.children.length > 0 ? (
            <div className="mt-3">
              <TopicTree nodes={node.children} depth={depth + 1} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProfileScene({
  snapshot,
  emphasiseDeclared,
}: {
  snapshot: DemoProfileSnapshot;
  emphasiseDeclared?: boolean;
}) {
  return (
    <SceneFrame sceneId={emphasiseDeclared ? "profile-updated" : "profile-start"}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Account and context
          </p>
          <h3 className="mt-2 text-lg font-semibold text-text">Learner setup</h3>
          <div className="mt-4">
            <RowList rows={snapshot.account} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Accessibility</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Usability settings</h3>
          <div className="mt-4">
            <RowList rows={snapshot.accessibility} subdued />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Declared preferences
              </p>
              <h3 className="mt-2 text-lg font-semibold text-text">Self-reported starting point</h3>
            </div>
            {emphasiseDeclared ? <Pill tone="muted">Unchanged</Pill> : null}
          </div>
          <div className="mt-4">
            <RowList rows={snapshot.declaredPreferences} />
          </div>
          {emphasiseDeclared ? (
            <p className="mt-4 text-sm text-muted">
              Alex still keeps the original stated preferences. The system does not rewrite them.
            </p>
          ) : null}
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            System observations
          </p>
          <h3 className="mt-2 text-lg font-semibold text-text">Evidence-driven estimate</h3>
          <div className="mt-4">
            <ObservationList rows={snapshot.systemObservations} />
          </div>
        </Card>
      </div>
    </SceneFrame>
  );
}

function TopicsScene() {
  return (
    <SceneFrame sceneId="topics">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Canonical hierarchy</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Tracked topic path</h3>
          <div className="mt-4">
            <TopicTree nodes={DEMO_TOPIC_PATH} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Why it matters</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Analytics anchor</h3>
          <div className="mt-4 grid gap-3">
            <div className="radius-md border border-border bg-surface2/80 px-4 py-3">
              <p className="text-sm font-medium text-text">Main tracked topic</p>
              <p className="mt-1 text-sm text-muted">Quadratic Equations</p>
            </div>
            <div className="radius-md border border-border bg-surface2/80 px-4 py-3">
              <p className="text-sm font-medium text-text">Core analytics unit</p>
              <p className="mt-1 text-sm text-muted">
                Progress, holdout checks, and recommendations stay attached to this canonical path.
              </p>
            </div>
            <div className="radius-md border border-border bg-surface2/80 px-4 py-3">
              <p className="text-sm font-medium text-text">Demo focus</p>
              <p className="mt-1 text-sm text-muted">
                One topic is enough to make the declared vs effective preference story visible.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </SceneFrame>
  );
}

function PracticeScene({
  sceneId,
  snapshot,
}: {
  sceneId: "practice-baseline" | "practice-adapted";
  snapshot: DemoPracticeSnapshot;
}) {
  return (
    <SceneFrame sceneId={sceneId}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Practice setup</p>
              <h3 className="mt-2 text-lg font-semibold text-text">
                {snapshot.mode} mode on {snapshot.topic}
              </h3>
            </div>
            <Pill tone={sceneId === "practice-adapted" ? "success" : "warning"}>
              {sceneId === "practice-adapted" ? "Adapted" : "Initial"}
            </Pill>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {snapshot.activeSettings.map((row) => (
              <div
                key={row.label}
                className="radius-md border border-border bg-surface2/75 px-4 py-3"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-muted">{row.label}</p>
                <p className="mt-2 text-base font-semibold text-text">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 radius-lg border border-border bg-surface2/75 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Representative item</p>
            <p className="mt-3 text-base leading-7 text-text">{snapshot.prompt}</p>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Session summary</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Short staged outcome</h3>
          <div className="mt-4">
            <ObservationList rows={snapshot.sessionSummary} />
          </div>
        </Card>
      </div>
    </SceneFrame>
  );
}

function LearnScene() {
  return (
    <SceneFrame sceneId="learn">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Guided dialogue</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Short scripted exchange</h3>

          <div className="mt-5 grid gap-3">
            {DEMO_LEARN_DIALOGUE.map((message, index) => (
              <div
                key={`${message.speaker}-${index}`}
                className={cx(
                  "max-w-[92%] radius-lg border px-4 py-3 text-sm leading-6",
                  message.role === "learner"
                    ? "justify-self-end border-border bg-slate-900 text-slate-100"
                    : message.variant === "adapted"
                      ? "border-emerald-200 bg-emerald-50 text-slate-800"
                      : "border-amber-200 bg-amber-50 text-slate-800",
                )}
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  {message.speaker}
                </p>
                <p className="mt-2">{message.body}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Visible adaptation</p>
          <h3 className="mt-2 text-lg font-semibold text-text">Response shift</h3>
          <div className="mt-4 grid gap-3">
            <div className="radius-md border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">First response</p>
              <p className="mt-1 text-sm text-slate-700">Formal, concise, low support.</p>
            </div>
            <div className="radius-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">Second response</p>
              <p className="mt-1 text-sm text-slate-700">
                Friendly-neutral, guided, step-by-step, with a worked example.
              </p>
            </div>
            <div className="radius-md border border-border bg-surface2/80 px-4 py-3">
              <p className="text-sm font-medium text-text">Interpretation</p>
              <p className="mt-1 text-sm text-muted">
                The system keeps the same topic but changes delivery support after a clear request
                for more guidance.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </SceneFrame>
  );
}

function MontageScene() {
  return (
    <SceneFrame sceneId="montage">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card variant="hero" className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Fast-forward montage</p>
          <h3 className="mt-2 text-2xl font-semibold text-text">{DEMO_MONTAGE.title}</h3>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            The demo compresses several additional episodes into one staged summary instead of
            replaying every interaction.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {DEMO_MONTAGE.counters.map((counter) => (
              <div
                key={counter.label}
                className="radius-md border border-border bg-surface2/80 p-4"
              >
                <Stat
                  label={counter.label}
                  value={`${counter.from} -> ${counter.to}`}
                  helper="Scripted progression"
                  valueClassName="text-3xl"
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Signals retained</p>
          <h3 className="mt-2 text-lg font-semibold text-text">What changed over time</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {DEMO_MONTAGE.chips.map((chip) => (
              <Pill key={chip} tone="primary" className="px-3 py-2 text-xs">
                {chip}
              </Pill>
            ))}
          </div>
        </Card>
      </div>
    </SceneFrame>
  );
}

function ProgressBlock() {
  const points = [
    { label: "Early", value: 33 },
    { label: "Mid", value: 58 },
    { label: "Current", value: 83 },
  ];

  return (
    <div className="mt-4">
      <div className="flex items-end gap-4">
        {points.map((point) => (
          <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
            <div className="flex h-44 w-full items-end rounded-[18px] bg-surface2/85 p-3">
              <div
                className="w-full rounded-[12px] bg-[linear-gradient(180deg,hsl(var(--primary)),hsl(var(--accent)))]"
                style={{ height: `${point.value}%` }}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text">{point.value}%</p>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">{point.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsScene() {
  return (
    <SceneFrame sceneId="analytics">
      <Card variant="hero" className="p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Analytics snapshot</p>
            <h3 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
              Evidence from Quadratic Equations
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Declared settings remain visible, but recommendations follow observed learning
              performance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="success">Observed improvement</Pill>
            <Pill tone="primary">Confidence: Medium</Pill>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {DEMO_ANALYTICS_BLOCKS.map((block) => (
          <Card key={block.title} className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">{block.title}</p>
            <h3 className="mt-2 text-lg font-semibold text-text">{block.title}</h3>
            {block.title === "Progress" ? <ProgressBlock /> : null}
            <div className="mt-4">
              <ObservationList rows={block.items} />
            </div>
          </Card>
        ))}
      </div>
    </SceneFrame>
  );
}

function SceneContent({ sceneId }: { sceneId: DemoSceneId }) {
  switch (sceneId) {
    case "profile-start":
      return <ProfileScene snapshot={DEMO_PROFILE_INITIAL} />;
    case "topics":
      return <TopicsScene />;
    case "practice-baseline":
      return <PracticeScene sceneId="practice-baseline" snapshot={DEMO_PRACTICE_BASELINE} />;
    case "learn":
      return <LearnScene />;
    case "montage":
      return <MontageScene />;
    case "profile-updated":
      return <ProfileScene snapshot={DEMO_PROFILE_UPDATED} emphasiseDeclared />;
    case "practice-adapted":
      return <PracticeScene sceneId="practice-adapted" snapshot={DEMO_PRACTICE_ADAPTED} />;
    case "analytics":
      return <AnalyticsScene />;
    default:
      return null;
  }
}

export default function DemoWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const sceneMotion = reducedMotion(Boolean(prefersReducedMotion), cardVariants);
  const [autoplayStarted, setAutoplayStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  const rawSceneId = searchParams.get("scene");
  const currentSceneId = isDemoSceneId(rawSceneId) ? rawSceneId : DEFAULT_DEMO_SCENE_ID;
  const currentIndex = sceneIndexById(currentSceneId);
  const currentScene = getDemoSceneById(currentSceneId);
  const isLastScene = currentIndex === DEMO_SCENES.length - 1;
  const autoplayActive = autoplayStarted && !paused && !isLastScene;

  const goToScene = useCallback(
    (sceneId: DemoSceneId) => {
      startTransition(() => {
        router.replace(demoSceneHref(sceneId), { scroll: false });
      });
    },
    [router],
  );

  useEffect(() => {
    if (rawSceneId || currentSceneId !== DEFAULT_DEMO_SCENE_ID) {
      return;
    }

    startTransition(() => {
      router.replace(demoSceneHref(DEFAULT_DEMO_SCENE_ID), { scroll: false });
    });
  }, [currentSceneId, rawSceneId, router]);

  useEffect(() => {
    if (!autoplayStarted || paused || currentScene.durationMs === 0 || isLastScene) {
      return;
    }

    const timer = window.setTimeout(() => {
      const nextScene = DEMO_SCENES[currentIndex + 1];
      if (!nextScene) {
        setPaused(true);
        return;
      }
      goToScene(nextScene.id);
    }, currentScene.durationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoplayStarted,
    currentIndex,
    currentScene.durationMs,
    currentScene.id,
    goToScene,
    isLastScene,
    paused,
  ]);

  function handleStart() {
    if (isLastScene) {
      return;
    }
    setAutoplayStarted(true);
    setPaused(false);
  }

  function handlePause() {
    setPaused(true);
  }

  function handleNext() {
    const nextScene = DEMO_SCENES[currentIndex + 1];
    if (!nextScene) {
      return;
    }
    goToScene(nextScene.id);
  }

  function handleRestart() {
    setAutoplayStarted(false);
    setPaused(false);
    goToScene(DEFAULT_DEMO_SCENE_ID);
  }

  function handleSkipToAnalytics() {
    setAutoplayStarted(true);
    setPaused(true);
    goToScene("analytics");
  }

  return (
    <PageShell className="py-2">
      <Section>
        <Card variant="hero" className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2">
                <Pill tone="primary">Demo mode</Pill>
                <Pill tone="muted">Simulated data</Pill>
                <Pill tone="muted">No live LLM or model runtime</Pill>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-text md:text-3xl">
                Scripted learner showcase for EduAI
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                This route is a staged demonstration only. It uses a fixed learner, fixed topic,
                and deterministic state transitions to show how declared preferences stay visible
                while evidence-driven observations evolve.
              </p>
            </div>

            <div className="radius-lg border border-border bg-surface2/80 px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current scene</p>
              <p className="mt-2 font-semibold text-text">
                {currentScene.label}: {currentScene.title}
              </p>
              <p className="mt-1 text-muted">Progress {sceneProgressValue(currentSceneId)}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.84fr)]">
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-surface2/90">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--accent)))]"
                  style={{
                    width: `${((currentIndex + 1) / DEMO_SCENES.length) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                {autoplayActive
                  ? "Autoplay is running through the scripted scenes."
                  : "Autoplay is idle. Use Start demo or move scene by scene."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button
                type="button"
                className={controlClass(true, autoplayActive || isLastScene)}
                onClick={handleStart}
                disabled={autoplayActive || isLastScene}
              >
                Start demo
              </button>
              <button
                type="button"
                className={controlClass(false, !autoplayActive)}
                onClick={handlePause}
                disabled={!autoplayActive}
              >
                Pause
              </button>
              <button
                type="button"
                className={controlClass(false, isLastScene)}
                onClick={handleNext}
                disabled={isLastScene}
              >
                Next
              </button>
              <button type="button" className={controlClass(false)} onClick={handleRestart}>
                Restart
              </button>
              <button
                type="button"
                className={controlClass(false, currentSceneId === "analytics")}
                onClick={handleSkipToAnalytics}
                disabled={currentSceneId === "analytics"}
              >
                Skip to analytics
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-border px-3 py-1">
              Hidden from main navigation
            </span>
            <span className="rounded-full border border-border px-3 py-1">
              No real learner session required
            </span>
            <span className="rounded-full border border-border px-3 py-1">
              No production data mutation
            </span>
          </div>
        </Card>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentSceneId}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={sceneMotion}
          >
            <SceneContent sceneId={currentSceneId} />
          </motion.div>
        </AnimatePresence>
      </Section>
    </PageShell>
  );
}
