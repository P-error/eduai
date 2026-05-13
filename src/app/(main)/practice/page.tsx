"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";
import {
  formatDifficultyLabel,
  localizeErrorMessage,
} from "@/lib/ui-locale";

type PredictionsPayload = {
  forTests?: {
    recommendedPreset?: {
      pedagogyPreset?: { difficulty_target?: string };
    };
    predicted?: {
      expectedAccuracy?: { value: number | null; confidence: number };
      expectedTotalDurationMs?: { value: number | null; confidence: number };
    };
    nextDifficultySuggestion?: { value: string | null; reason: string };
  };
};

export default function PracticePage() {
  const { locale, messages } = useUiLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [sections, setSections] = useState<
    { id: string; title: string; parentId: string | null }[]
  >([]);
  const [sectionId, setSectionId] = useState("");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const mode = "practice";
  const [personalizationMode, setPersonalizationMode] = useState<"on" | "off">("on");
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSubjects() {
      const response = await authFetch("/api/subjects");
      if (!response.ok) return;
      const json = (await response.json()) as { id: string; title: string }[];
      if (!active) return;

      setSubjects(json);
      const requested = searchParams.get("subjectId");
      const initial =
        (requested && json.find((subject) => subject.id === requested)?.id) ||
        json[0]?.id ||
        "";
      setSubjectId(initial);
      const selected = json.find((subject) => subject.id === initial);
      const requestedTopic = searchParams.get("topic");
      setTopic(requestedTopic?.trim() || selected?.title || "");
    }
    loadSubjects();
    return () => {
      active = false;
    };
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    async function loadSections() {
      if (!subjectId) {
        setSections([]);
        setSectionId("");
        return;
      }
      const response = await authFetch(`/api/subjects/${subjectId}/sections`);
      if (!response.ok) return;
      const json = (await response.json()) as {
        id: string;
        title: string;
        parentId: string | null;
      }[];
      if (!active) return;
      setSections(json);
      const requested = searchParams.get("sectionId");
      const initial =
        (requested && json.find((section) => section.id === requested)?.id) || "";
      setSectionId(initial);
    }
    loadSections();
    return () => {
      active = false;
    };
  }, [searchParams, subjectId]);

  useEffect(() => {
    let active = true;
    async function loadPredictions() {
      if (!subjectId) {
        if (active) {
          setPredictions(null);
        }
        return;
      }

      const query = `?subjectId=${encodeURIComponent(subjectId)}`;
      const response = await authFetch(`/api/users/me/predictions${query}`);
      if (!response.ok) return;
      const json = (await response.json()) as PredictionsPayload;
      if (!active) return;
      setPredictions(json);
    }
    loadPredictions();
    return () => {
      active = false;
    };
  }, [subjectId]);

  const expectedAccuracy = predictions?.forTests?.predicted?.expectedAccuracy;
  const expectedDuration = predictions?.forTests?.predicted?.expectedTotalDurationMs;
  const nextDifficulty = predictions?.forTests?.nextDifficultySuggestion;

  const expectedTimeLabel = useMemo(() => {
    const value = expectedDuration?.value;
    if (value == null) return messages.common.notEnoughDataYet;
    return `${Math.round(value / 1000)} ${messages.common.sec}`;
  }, [expectedDuration?.value, messages.common.notEnoughDataYet, messages.common.sec]);
  const hasTopics = subjects.length > 0;
  const needsTopicSetup = !hasTopics || !subjectId;
  const recommendationPlaceholder = needsTopicSetup
    ? messages.practice.addTopicFirst
    : messages.practice.recommendationPlaceholder;

  async function startPractice(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!subjectId) {
      setError(messages.practice.selectTopicFirst);
      setLoading(false);
      return;
    }

    const response = await authFetch("/api/tests/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId,
        sectionId: sectionId || null,
        topic,
        questionCount,
        mode,
        personalizationMode,
      }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(localizeErrorMessage(json, locale, messages.practice.failedGenerate));
      setLoading(false);
      return;
    }

    const json = await response.json();
    router.push(`/tests/${json.id}`);
  }

  return (
    <section className="grid gap-6">
      <div className="ui-panel ui-panel-hero ui-panel-body">
        <p className="ui-eyebrow">
          {messages.shell.nav.practice}
        </p>
        <h2 className="ui-title-lg mt-3">{messages.practice.quickTitle}</h2>
        <p className="ui-copy-sm mt-2 max-w-3xl">
          {messages.practice.subtitle}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="ui-action-primary px-4 text-sm" href="#quick-practice-form">
            {messages.practice.primaryCta}
          </a>
          <Link className="ui-action-secondary ui-action-sm" href={DEFAULT_LEARNER_ENTRY_HREF}>
            {messages.practice.fullEpisodeCta}
          </Link>
        </div>
      </div>

      <div className="ui-panel ui-panel-body ui-panel-soft">
        <p className="ui-eyebrow">{messages.practice.learnVsPracticeTitle}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="ui-panel ui-panel-tight">
            <h3 className="ui-title-md text-base">{messages.practice.coreTitle}</h3>
            <p className="ui-copy-sm mt-2">{messages.practice.coreBody}</p>
          </div>
          <div className="ui-panel ui-panel-tight">
            <h3 className="ui-title-md text-base">{messages.practice.quickPracticeTitle}</h3>
            <p className="ui-copy-sm mt-2">{messages.practice.quickPracticeBody}</p>
          </div>
        </div>
      </div>

      <div id="quick-practice-form" className="ui-panel ui-panel-body">
        <h3 className="ui-title-md">{messages.practice.buildCustomSet}</h3>
        <p className="ui-copy-sm mt-2 max-w-3xl">{messages.practice.formBody}</p>
        {!hasTopics ? (
          <div
            className="ui-panel ui-panel-tight ui-panel-soft mt-4 text-sm"
            role="status"
            aria-live="polite"
          >
            <p className="ui-title-md text-base">{messages.practice.noTopicsTitle}</p>
            <p className="ui-copy-sm">{messages.practice.noTopicsBody}</p>
            <div className="mt-3">
              <Link
                className="ui-action-secondary ui-action-sm"
                href="/topics"
              >
                {messages.common.openTopics}
              </Link>
            </div>
          </div>
        ) : null}
        <form onSubmit={startPractice} className="ui-form-grid mt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="ui-copy-sm">{messages.practice.mode}:</span>
            <button
              type="button"
              onClick={() => setPersonalizationMode("on")}
              className="ui-segment"
              data-active={personalizationMode === "on"}
            >
              {messages.practice.personalized}
            </button>
            <button
              type="button"
              onClick={() => setPersonalizationMode("off")}
              className="ui-segment"
              data-active={personalizationMode === "off"}
            >
              {messages.practice.standard}
            </button>
          </div>

          <label className="ui-label">
            {messages.practice.topic}
            <select
              className="ui-select"
              value={subjectId}
              onChange={(event) => {
                const nextSubjectId = event.target.value;
                setSubjectId(nextSubjectId);
                const selected = subjects.find((subject) => subject.id === nextSubjectId);
                if (selected) setTopic(selected.title);
              }}
              required
            >
              <option value="">{messages.common.selectTopic}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            {messages.practice.practiceFocus}
            <input
              className="ui-input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={messages.practice.placeholderTopic}
              required
            />
          </label>

          <label className="ui-label">
            {messages.practice.subtopicOptional}
            <select
              className="ui-select"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">{messages.common.noSection}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-label">
            {messages.practice.questionCount}
            <input
              type="number"
              min={1}
              max={20}
              className="ui-input"
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              required
            />
          </label>

          {error ? (
            <div className="ui-panel ui-panel-danger ui-panel-tight text-sm" role="alert">
              <p>{error}</p>
              <p className="mt-2">{messages.practice.generationErrorNextStep}</p>
              <div className="mt-3">
                <Link className="ui-action-secondary ui-action-sm" href={DEFAULT_LEARNER_ENTRY_HREF}>
                  {messages.practice.fullEpisodeCta}
                </Link>
              </div>
            </div>
          ) : null}
          {!subjectId ? (
            <p className="ui-copy-sm" role="status">
              {messages.practice.disabledNeedTopic}
            </p>
          ) : null}
          <button
            type="submit"
            className="ui-action-primary w-full sm:w-auto"
            disabled={loading || !subjectId}
          >
            {loading ? messages.practice.generating : messages.practice.startSet}
          </button>
        </form>

        <details className="ui-panel ui-panel-tight ui-panel-soft mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-text">
            {messages.practice.optionalHints}
          </summary>
          <div className="ui-metric-grid mt-4 md:grid-cols-2">
            <div className="ui-metric-item">
              <span>{messages.practice.nextDifficulty}</span>
              <span>
                {nextDifficulty?.value
                  ? formatDifficultyLabel(nextDifficulty.value, locale)
                  : recommendationPlaceholder}
              </span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.practice.expectedAccuracy}</span>
              <span>
                {needsTopicSetup
                  ? recommendationPlaceholder
                  : expectedAccuracy?.value == null
                    ? messages.common.notEnoughDataYet
                    : `${(expectedAccuracy.value * 100).toFixed(0)}%`}
              </span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.practice.expectedTime}</span>
              <span>{needsTopicSetup ? recommendationPlaceholder : expectedTimeLabel}</span>
            </div>
            <div className="ui-metric-item">
              <span>{messages.practice.recommendationConfidence}</span>
              <span>
                {needsTopicSetup
                  ? messages.common.na
                  : expectedAccuracy
                    ? expectedAccuracy.confidence.toFixed(2)
                    : messages.common.low.toLowerCase()}
              </span>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
