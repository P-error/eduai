"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { authFetch, fetchCurrentUser } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { useUiVersion } from "@/components/settings/UiVersionProvider";
import V2StatusPanel from "@/components/v2/V2StatusPanel";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";
import {
  DEFAULT_DEMO_SCENE_ID,
  DEMO_SCENES,
  demoSceneHref,
  getDemoSceneById,
  isDemoPath,
  isDemoSceneId,
} from "@/lib/demo-script";

type MePayload = {
  id?: string;
  personalizationReady?: boolean;
  name?: string | null;
  learnerSummary?: {
    attemptsRecorded?: number;
    attemptsLearningEligible?: number;
    attemptsExcluded?: number;
  } | null;
};

type PredictionsPayload = {
  forTests?: {
    predicted?: {
      expectedAccuracy?: { value: number | null };
    };
  };
};

export default function StatusPanel() {
  const { messages } = useUiLocale();
  const { uiVersion } = useUiVersion();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemo = isDemoPath(pathname);
  const [me, setMe] = useState<MePayload | null>(null);
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const isPublicPath = pathname === "/" || pathname === "/login" || pathname === "/register";
  const rawDemoSceneId = searchParams.get("scene");
  const demoSceneId = isDemoSceneId(rawDemoSceneId)
    ? rawDemoSceneId
    : DEFAULT_DEMO_SCENE_ID;
  const demoScene = getDemoSceneById(demoSceneId);
  const demoSceneIndex = DEMO_SCENES.findIndex((scene) => scene.id === demoScene.id);
  const hasEvidence = demoSceneIndex >= 4;
  const hasAdaptedPractice = demoSceneIndex >= 6;
  const hasAnalytics = demoSceneIndex >= 7;

  useEffect(() => {
    if (isPublicPath || isDemo) {
      return;
    }

    let active = true;
    async function load() {
      const mePayload = await fetchCurrentUser();
      if (!active || !mePayload?.id) {
        return;
      }
      setMe(mePayload);

      const predRes = await authFetch("/api/users/me/predictions");
      if (active && predRes.ok) {
        setPredictions((await predRes.json()) as PredictionsPayload);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [isDemo, isPublicPath]);

  const expectedAccuracy = useMemo(
    () => predictions?.forTests?.predicted?.expectedAccuracy?.value ?? null,
    [predictions],
  );

  if (isDemo) {
    if (uiVersion === "v2") {
      return (
        <V2StatusPanel
          isDemo
          attemptsRecorded={demoSceneIndex + 1}
          attemptsLearningEligible={hasEvidence ? demoSceneIndex - 2 : 0}
          expectedAccuracy={hasAnalytics ? 0.83 : hasAdaptedPractice ? 0.58 : null}
          personalizationReady={hasAdaptedPractice}
        />
      );
    }

    return (
      <aside className="ui-panel ui-panel-tight ui-panel-soft text-sm xl:sticky xl:top-6">
        <p className="ui-eyebrow">Status</p>
        <div className="ui-metric-grid mt-3">
          <div className="ui-metric-item">
            <span>Mode</span>
            <span>Demo</span>
          </div>
          <div className="ui-metric-item">
            <span>Simulated user</span>
            <span>Alex Carter</span>
          </div>
          <div className="ui-metric-item">
            <span>Scene</span>
            <span>
              {demoSceneIndex + 1}/{DEMO_SCENES.length}
            </span>
          </div>
          <div className="ui-metric-item">
            <span>Evidence confidence</span>
            <span>{hasEvidence ? "Medium" : "Low"}</span>
          </div>
          <div className="ui-metric-item">
            <span>Holdout trend</span>
            <span>{hasAnalytics ? "33 -> 58 -> 83%" : hasAdaptedPractice ? "33 -> 83%" : "33%"}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="ui-action-secondary ui-action-xs"
            href={demoSceneHref("profile-updated")}
          >
            Profile
          </Link>
          <Link
            className="ui-action-secondary ui-action-xs"
            href={demoSceneHref("analytics")}
          >
            Analytics
          </Link>
        </div>
      </aside>
    );
  }

  if (isPublicPath || !me?.id) {
    return null;
  }

  if (uiVersion === "v2") {
    return (
      <V2StatusPanel
        attemptsRecorded={me?.learnerSummary?.attemptsRecorded ?? null}
        attemptsLearningEligible={me?.learnerSummary?.attemptsLearningEligible ?? null}
        expectedAccuracy={expectedAccuracy}
        personalizationReady={me?.personalizationReady ?? false}
      />
    );
  }

  return (
    <aside className="ui-panel ui-panel-tight ui-panel-soft text-sm xl:sticky xl:top-6">
      <p className="ui-eyebrow">
        {messages.statusPanel.title}
      </p>
      <div className="ui-metric-grid mt-3">
        <div className="ui-metric-item">
          <span>{messages.statusPanel.recordedAttempts}</span>
          <span>{me?.learnerSummary?.attemptsRecorded ?? "-"}</span>
        </div>
        <div className="ui-metric-item">
          <span>{messages.statusPanel.learningEligibleChecks}</span>
          <span>{me?.learnerSummary?.attemptsLearningEligible ?? "-"}</span>
        </div>
        <div className="ui-metric-item">
          <span>{messages.statusPanel.personalization}</span>
          <span>
            {me?.personalizationReady
              ? messages.common.ready
              : messages.common.growing}
          </span>
        </div>
        <div className="ui-metric-item">
          <span>{messages.profile.excludedAttempts}</span>
          <span>{me?.learnerSummary?.attemptsExcluded ?? "-"}</span>
        </div>
        <div className="ui-metric-item">
          <span>{messages.statusPanel.expectedAccuracy}</span>
          <span>
            {expectedAccuracy == null
              ? "-"
              : `${(expectedAccuracy * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="ui-action-secondary ui-action-xs" href={DEFAULT_LEARNER_ENTRY_HREF}>
          {messages.shell.nav.learn}
        </Link>
      </div>
    </aside>
  );
}
