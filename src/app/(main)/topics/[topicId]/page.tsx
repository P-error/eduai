"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  buildCustomPracticeHref,
  launchOwnerPathEpisode,
} from "@/lib/learner-orchestration";
import {
  formatLearningExclusionReasonLabel,
  localizeErrorMessage,
} from "@/lib/ui-locale";
import type { LearningExclusionReasonCode } from "@/lib/learning-evidence-contract";

type SubjectStats = {
  subject: {
    id: string;
    title: string;
    description: string | null;
    collectionId: string | null;
    collectionName?: string | null;
  };
  totals: {
    attemptsRecorded: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    recentAccuracy: {
      value: number | null;
      sampleSize: number;
    };
    recentEvidence: {
      windowSize: number;
      recorded: number;
      learningEligible: number;
      excluded: number;
    };
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
  };
  attempts: {
    id: string;
    score: number;
    createdAt: string;
    topic: string;
    learningEligible: boolean;
    exclusionReasonCode: LearningExclusionReasonCode | null;
  }[];
};

type Section = {
  id: string;
  title: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
};

type SectionAction =
  | { kind: "renameSection"; id: string; currentTitle: string }
  | { kind: "deleteSection"; id: string; title: string };

export default function SubjectDetailsPage() {
  const { locale, messages } = useUiLocale();
  const params = useParams<{ subjectId?: string; topicId?: string }>();
  const router = useRouter();
  const topicId = params.topicId ?? params.subjectId ?? "";
  const [data, setData] = useState<SubjectStats | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [recommendation, setRecommendation] = useState<{
    preset: {
      subjectId: string;
      sectionId: string | null;
      topic: string;
      questionCount: number;
      mode: "quiz" | "exam" | "practice";
      uxPreset?: Record<string, string>;
      pedagogyPreset?: Record<string, string>;
    };
    rationale: string;
    dataStatus: "OK" | "INSUFFICIENT";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [sectionParentId, setSectionParentId] = useState("");
  const [startingKey, setStartingKey] = useState<string | null>(null);
  const [sectionAction, setSectionAction] = useState<SectionAction | null>(null);
  const [sectionActionValue, setSectionActionValue] = useState("");
  const [sectionActionBusy, setSectionActionBusy] = useState(false);
  const sectionActionPrimaryRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const sectionActionOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSubject() {
      setLoading(true);
      const [subjectRes, sectionsRes, recRes] = await Promise.all([
        authFetch(`/api/subjects/${topicId}/stats`),
        authFetch(`/api/subjects/${topicId}/sections`),
        authFetch(`/api/subjects/${topicId}/recommendation`),
      ]);

      if (!subjectRes.ok) {
        const json = await subjectRes.json().catch(() => ({}));
        if (active) {
          setError(localizeErrorMessage(json, locale, messages.topicDetails.errorLoad));
          setLoading(false);
        }
        return;
      }

      const json = (await subjectRes.json()) as SubjectStats;
      const sectionsJson = sectionsRes.ok
        ? ((await sectionsRes.json()) as Section[])
        : [];
      const recJson = recRes.ok ? await recRes.json() : null;

      if (active) {
        setData(json);
        setSections(sectionsJson);
        if (recJson?.ok) {
          setRecommendation({
            preset: recJson.preset,
            rationale: recJson.rationale,
            dataStatus: recJson.dataStatus,
          });
        }
        setLoading(false);
      }
    }
    loadSubject();
    return () => {
      active = false;
    };
  }, [locale, messages.topicDetails.errorLoad, topicId]);

  useEffect(() => {
    if (!sectionAction) {
      sectionActionOpenerRef.current?.focus();
      sectionActionOpenerRef.current = null;
      return;
    }

    sectionActionPrimaryRef.current?.focus();
  }, [sectionAction]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title);
    });
  }, [sections]);

  const sectionLookup = useMemo(() => {
    const map = new Map<string, Section>();
    sections.forEach((section) => map.set(section.id, section));
    return map;
  }, [sections]);

  const sectionDepth = useMemo(() => {
    const cache = new Map<string, number>();
    const computeDepth = (section: Section): number => {
      if (!section.parentId) return 0;
      if (cache.has(section.id)) return cache.get(section.id) ?? 0;
      const parent = sectionLookup.get(section.parentId);
      const depth = parent ? computeDepth(parent) + 1 : 1;
      cache.set(section.id, depth);
      return depth;
    };
    sections.forEach((section) => cache.set(section.id, computeDepth(section)));
    return cache;
  }, [sections, sectionLookup]);

  const sectionPath = useMemo(() => {
    const cache = new Map<string, string>();
    const computePath = (section: Section): string => {
      if (cache.has(section.id)) return cache.get(section.id) ?? section.title;
      const segments: string[] = [section.title];
      let current = section;
      let guard = 0;
      while (current.parentId && guard < 10) {
        const parent = sectionLookup.get(current.parentId);
        if (!parent) break;
        segments.unshift(parent.title);
        current = parent;
        guard += 1;
      }
      const path = segments.join(" → ");
      cache.set(section.id, path);
      return path;
    };
    sections.forEach((section) => cache.set(section.id, computePath(section)));
    return cache;
  }, [sections, sectionLookup]);

  async function refreshSections() {
    const response = await authFetch(
      `/api/subjects/${topicId}/sections`,
    );
    if (!response.ok) return;
    const json = (await response.json()) as Section[];
    setSections(json);
  }

  async function createSection(event: React.FormEvent) {
    event.preventDefault();
    setActionError(null);
    const response = await authFetch(
      `/api/subjects/${topicId}/sections`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sectionTitle,
        description: sectionDescription || null,
        parentId: sectionParentId || null,
        sortOrder: sortedSections.length,
      }),
    },
    );
    if (!response.ok) {
      return;
    }
    setSectionTitle("");
    setSectionDescription("");
    setSectionParentId("");
    await refreshSections();
  }

  async function handleStartEpisode(params: {
    actionKey: string;
    subjectId: string;
    subjectTitle: string;
    sectionId?: string | null;
    sectionTitle?: string | null;
    topic?: string | null;
    questionCount?: number;
  }) {
    setStartingKey(params.actionKey);
    setActionError(null);

    try {
      const launch = await launchOwnerPathEpisode(authFetch, {
        subjectId: params.subjectId,
        subjectTitle: params.subjectTitle,
        sectionId: params.sectionId ?? null,
        sectionTitle: params.sectionTitle ?? null,
        topic: params.topic ?? null,
        questionCount: params.questionCount,
      });
      router.push(launch.href);
    } catch (requestError) {
      setActionError(localizeErrorMessage(requestError, locale, messages.learn.errorStart));
    } finally {
      setStartingKey(null);
    }
  }

  function openSectionAction(action: SectionAction) {
    const opener = document.activeElement;
    sectionActionOpenerRef.current = opener instanceof HTMLElement ? opener : null;
    setSectionAction(action);
    setSectionActionValue(
      action.kind === "renameSection" ? action.currentTitle : "",
    );
    setActionError(null);
  }

  function closeSectionAction() {
    if (sectionActionBusy) return;
    setSectionAction(null);
    setSectionActionValue("");
  }

  async function submitSectionAction(event: React.FormEvent) {
    event.preventDefault();
    if (!sectionAction) return;
    const nextTitle = sectionActionValue.trim();
    if (sectionAction.kind === "renameSection" && !nextTitle) return;

    setSectionActionBusy(true);
    setActionError(null);
    try {
      const response =
        sectionAction.kind === "renameSection"
          ? await authFetch(`/api/subjects/${topicId}/sections/${sectionAction.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: nextTitle }),
            })
          : await authFetch(`/api/subjects/${topicId}/sections/${sectionAction.id}`, {
              method: "DELETE",
            });
      const json = await response.json().catch(() => null);
      if (!response.ok || json?.ok === false) {
        setActionError(
          localizeErrorMessage(json, locale, messages.topicDetails.errorAction),
        );
        return;
      }

      setSectionAction(null);
      setSectionActionValue("");
      await refreshSections();
    } finally {
      setSectionActionBusy(false);
    }
  }

  async function moveSection(sectionId: string, direction: "up" | "down") {
    const index = sortedSections.findIndex((section) => section.id === sectionId);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sortedSections.length) return;
    const current = sortedSections[index];
    const target = sortedSections[swapIndex];
    await Promise.all([
      authFetch(`/api/subjects/${topicId}/sections/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      }),
      authFetch(`/api/subjects/${topicId}/sections/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      }),
    ]);
    await refreshSections();
  }

  async function startRecommendedTest() {
    if (!recommendation) return;
    await handleStartEpisode({
      actionKey: "recommended",
      subjectId: recommendation.preset.subjectId,
      subjectTitle: data?.subject.title ?? recommendation.preset.topic,
      sectionId: recommendation.preset.sectionId ?? null,
      topic: recommendation.preset.topic,
      questionCount: recommendation.preset.questionCount,
    });
  }

  if (loading) {
    return (
      <div className="ui-panel ui-panel-tight" role="status" aria-live="polite">
        <p className="ui-title-md text-base">{messages.topicDetails.loading}</p>
        <p className="ui-copy-sm mt-2">{messages.topicDetails.loadingBody}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="ui-panel ui-panel-danger ui-panel-tight" role="alert">
        <p className="font-medium">
          {error ?? messages.topicDetails.notFound}
        </p>
        <p className="mt-2 text-sm">{messages.topicDetails.errorNextStep}</p>
        <div className="mt-3">
          <Link className="ui-action-secondary ui-action-sm" href="/topics">
            {messages.topics.backToTopics}
          </Link>
        </div>
      </div>
    );
  }

  const sectionActionIsRename = sectionAction?.kind === "renameSection";
  const sectionActionIsDestructive = sectionAction?.kind === "deleteSection";
  const sectionActionTitle =
    sectionAction?.kind === "renameSection"
      ? messages.topicDetails.actionRenameSectionTitle
      : sectionAction?.kind === "deleteSection"
        ? messages.topicDetails.actionDeleteSectionTitle
        : "";
  const sectionActionSubmitLabel =
    sectionAction?.kind === "deleteSection"
      ? messages.topicDetails.confirmDelete
      : messages.topicDetails.saveSection;

  return (
    <section className="grid gap-6">
      <div className="ui-panel ui-panel-hero ui-panel-body">
        <p className="ui-eyebrow">{messages.shell.nav.topics}</p>
        <h2 className="ui-title-lg mt-3">{data.subject.title}</h2>
        <p className="ui-copy-sm mt-2 max-w-3xl">
          {data.subject.description ?? messages.common.noDescriptionYet}
        </p>
        {data.subject.collectionName ? (
          <p className="ui-meta mt-2">
            {data.subject.collectionName}
          </p>
        ) : null}
        {actionError ? (
          <p
            className="ui-panel ui-panel-danger ui-panel-tight mt-3 text-sm"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <button
            className="ui-action-primary ui-action-sm"
            type="button"
            onClick={() =>
              void handleStartEpisode({
                actionKey: "topic",
                subjectId: data.subject.id,
                subjectTitle: data.subject.title,
              })
            }
            disabled={startingKey != null}
          >
            {startingKey === "topic"
              ? messages.learn.startLoading
              : messages.topics.startEpisode}
          </button>
          <Link
            className="ui-action-secondary ui-action-sm"
            href="/topics"
          >
            {messages.topics.backToTopics}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="ui-panel ui-panel-body">
          <h3 className="ui-title-md">{messages.topicDetails.totals}</h3>
          <div className="ui-metric-grid mt-4">
            <div className="ui-metric-item">
              <span>{messages.common.recordedAttempts}</span>
              <span>{data.totals.attemptsRecorded}</span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.common.learningUpdates}</span>
              <span>{data.totals.attemptsLearningEligible}</span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.profile.excludedAttempts}</span>
              <span>{data.totals.attemptsExcluded}</span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.profile.recentAccuracy}</span>
              <span>
                {data.totals.recentAccuracy.sampleSize > 0
                  ? `${(Number(data.totals.recentAccuracy.value ?? 0) * 100).toFixed(1)}%`
                  : messages.common.notEnoughDataYet}
              </span>
            </div>
          </div>
          <p className="ui-meta mt-4">
            {messages.common.learningUpdates}: n={data.totals.recentEvidence.learningEligible}
          </p>
        </div>
        <div className="ui-panel ui-panel-body">
          <h3 className="ui-title-md">{messages.topicDetails.recentAttempts}</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {data.attempts.length === 0 ? (
              <div className="ui-panel ui-panel-tight ui-panel-soft">
                <p className="font-medium">{messages.topicDetails.noAttempts}</p>
                <p className="ui-copy-sm mt-2">{messages.topicDetails.noAttemptsBody}</p>
              </div>
            ) : (
              data.attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="ui-panel ui-panel-tight"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{attempt.topic}</span>
                    <span>{Math.round(attempt.score * 100)}%</span>
                  </div>
                  <p className="ui-meta mt-1">
                    {attempt.learningEligible
                      ? messages.common.learningUpdates
                      : `${messages.profile.excludedAttempts}: ${formatLearningExclusionReasonLabel(
                          attempt.exclusionReasonCode,
                          locale,
                        )}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="ui-panel ui-panel-body">
          <h3 className="ui-title-md">{messages.topicDetails.recommendedEpisode}</h3>
          <p className="ui-copy-sm mt-2">
            {recommendation?.dataStatus === "INSUFFICIENT"
              ? messages.topicDetails.noRecommendation
              : recommendation?.rationale ?? messages.topicDetails.recommendationLoading}
          </p>
          <button
            className="ui-action-primary ui-action-sm mt-4"
            type="button"
            onClick={() => void startRecommendedTest()}
            disabled={!recommendation || startingKey != null}
          >
            {startingKey === "recommended"
              ? messages.learn.startLoading
              : messages.topicDetails.startRecommendedEpisode}
          </button>
        </div>
      </div>

      <div className="ui-panel ui-panel-body">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="ui-title-md">{messages.topicDetails.structure}</h3>
            <p className="ui-copy-sm mt-1">
              {messages.topicDetails.sectionPathNote}
            </p>
          </div>
          <button
            className="ui-action-secondary ui-action-sm"
            type="button"
            onClick={() => {
              const input = document.getElementById("section-title");
              if (input instanceof HTMLInputElement) {
                input.focus();
              }
            }}
          >
            {messages.topicDetails.addSubtopic}
          </button>
        </div>
        <form onSubmit={createSection} className="ui-form-grid mt-4">
          <label className="ui-label">
            {messages.topics.topicTitle}
            <input
              id="section-title"
              className="ui-input"
              value={sectionTitle}
              onChange={(event) => setSectionTitle(event.target.value)}
              required
            />
          </label>
          <label className="ui-label">
            {messages.topicDetails.descriptionOptional}
            <textarea
              rows={2}
              className="ui-textarea"
              value={sectionDescription}
              onChange={(event) => setSectionDescription(event.target.value)}
            />
          </label>
          <label className="ui-label">
            {messages.topicDetails.parentSection}
            <select
              className="ui-select"
              value={sectionParentId}
              onChange={(event) => setSectionParentId(event.target.value)}
            >
              <option value="">{messages.common.noParent}</option>
              {sortedSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ui-action-primary w-full sm:w-auto"
            type="submit"
          >
            {messages.topicDetails.addSection}
          </button>
        </form>

        <div className="mt-6 grid gap-2 text-sm">
          {sortedSections.length === 0 ? (
            <div className="ui-panel ui-panel-tight ui-panel-soft text-sm">
              <p className="font-medium">{messages.topicDetails.emptySubtopics}</p>
              <p className="ui-copy-sm mt-2">{messages.topicDetails.emptySubtopicsBody}</p>
              <button
                className="ui-action-secondary ui-action-sm mt-3"
                type="button"
                onClick={() => {
                  const input = document.getElementById("section-title");
                  if (input instanceof HTMLInputElement) {
                    input.focus();
                  }
                }}
              >
                {messages.topicDetails.addSubtopic}
              </button>
            </div>
          ) : (
            sortedSections.map((section, index) => (
              <div
                key={section.id}
                className="ui-panel ui-panel-tight flex flex-wrap items-center justify-between gap-3"
                style={{
                  marginLeft: `${(sectionDepth.get(section.id) ?? 0) * 12}px`,
                }}
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-chip">
                      {messages.topicDetails.subtopic}
                    </span>
                    <p className="font-semibold">{section.title}</p>
                  </div>
                  <p className="ui-meta mt-1">
                    {sectionPath.get(section.id)}
                  </p>
                  {section.description ? (
                    <p className="ui-meta mt-1">
                      {section.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    className="ui-action-primary ui-action-xs"
                    type="button"
                    onClick={() =>
                      void handleStartEpisode({
                        actionKey: `section:${section.id}`,
                        subjectId: data.subject.id,
                        subjectTitle: data.subject.title,
                        sectionId: section.id,
                        sectionTitle: section.title,
                      })
                    }
                    disabled={startingKey != null}
                  >
                    {startingKey === `section:${section.id}`
                      ? messages.learn.startLoading
                      : messages.topics.startEpisode}
                  </button>
                  <a
                    className="ui-action-secondary ui-action-xs"
                    href={buildCustomPracticeHref({
                      subjectId: data.subject.id,
                      sectionId: section.id,
                      topic: section.title,
                    })}
                  >
                    {messages.topicDetails.practiceThisSubtopic}
                  </a>
                  <details className="relative">
                    <summary className="ui-action-secondary ui-action-xs cursor-pointer">
                      ⋯
                    </summary>
                    <div className="ui-panel absolute right-0 z-10 mt-2 grid w-40 gap-1 p-2 text-xs shadow-xl">
                      <button
                        className="ui-action-ghost ui-action-xs justify-start"
                        type="button"
                        onClick={() => moveSection(section.id, "up")}
                        disabled={index === 0}
                      >
                        {messages.topicDetails.moveUp}
                      </button>
                      <button
                        className="ui-action-ghost ui-action-xs justify-start"
                        type="button"
                        onClick={() => moveSection(section.id, "down")}
                        disabled={index === sortedSections.length - 1}
                      >
                        {messages.topicDetails.moveDown}
                      </button>
                      <button
                        className="ui-action-ghost ui-action-xs justify-start"
                        type="button"
                        onClick={() =>
                          openSectionAction({
                            kind: "renameSection",
                            id: section.id,
                            currentTitle: section.title,
                          })
                        }
                      >
                        {messages.topics.rename}
                      </button>
                      <button
                        className="ui-action-ghost ui-action-xs justify-start text-danger"
                        type="button"
                        onClick={() =>
                          openSectionAction({
                            kind: "deleteSection",
                            id: section.id,
                            title: section.title,
                          })
                        }
                      >
                        {messages.topics.delete}
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {sectionAction ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !sectionActionBusy) {
              event.preventDefault();
              closeSectionAction();
            }
          }}
        >
          <form
            className="ui-panel ui-panel-body w-full max-w-md"
            role={sectionActionIsDestructive ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="section-action-title"
            aria-describedby={
              !sectionActionIsRename ? "section-action-description" : undefined
            }
            onSubmit={submitSectionAction}
          >
            <h3 id="section-action-title" className="ui-title-md">
              {sectionActionTitle}
            </h3>
            {sectionActionIsRename ? (
              <label className="ui-label mt-4">
                {messages.topics.topicTitle}
                <input
                  ref={(node) => {
                    sectionActionPrimaryRef.current = node;
                  }}
                  className="ui-input"
                  value={sectionActionValue}
                  onChange={(event) => setSectionActionValue(event.target.value)}
                  autoFocus
                  required
                />
              </label>
            ) : (
              <p id="section-action-description" className="ui-copy-sm mt-3">
                {messages.topicDetails.confirmDeleteSectionBody.replace(
                  "{title}",
                  sectionAction.title,
                )}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={(node) => {
                  if (!sectionActionIsRename) {
                    sectionActionPrimaryRef.current = node;
                  }
                }}
                className="ui-action-secondary"
                type="button"
                onClick={closeSectionAction}
                disabled={sectionActionBusy}
              >
                {messages.common.cancel}
              </button>
              <button
                className="ui-action-primary"
                type="submit"
                disabled={
                  sectionActionBusy ||
                  (sectionActionIsRename && !sectionActionValue.trim())
                }
              >
                {sectionActionBusy
                  ? messages.common.saving
                  : sectionActionSubmitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
