"use client";

import { useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import AttemptEvidenceSummary from "@/components/learner/AttemptEvidenceSummary";
import { buildPracticeResultCtaHierarchy } from "@/lib/learner-orchestration";
import type { LearnerAttemptEvidenceContract } from "@/lib/learning-evidence-contract";
import {
  formatAxisLabel,
  formatDifficultyFallback,
  formatDifficultyLabel,
  formatLearningExclusionReasonLabel,
} from "@/lib/ui-locale";

type Question = {
  prompt: string;
  options: string[];
  explanation?: string;
};

export default function TestRunner({
  testId,
  subjectId,
  sectionId,
  title,
  questions,
}: {
  testId: string;
  subjectId: string;
  sectionId: string | null;
  title: string;
  questions: Question[];
}) {
  const { locale, messages } = useUiLocale();
  const [answers, setAnswers] = useState<number[]>(
    () => new Array(questions.length).fill(-1),
  );
  const [result, setResult] = useState<null | {
    score: number;
    byTag: Record<string, Record<string, { accuracy: number }>>;
    meta?: {
      predictionVsActual?: {
        expectedAccuracy: number | null;
        actualAccuracy: number;
        expectedTotalDurationMs: number | null;
        actualTotalDurationMs: number | null;
      };
      nextDifficultySuggestion?: {
        value: string | null;
        reason: string;
      };
      evidence?: LearnerAttemptEvidenceContract;
      dataQuality?: {
        excludedFromLearning: boolean;
        reasonCode: string | null;
        reasonLabel: string | null;
      };
    } | null;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt] = useState<number>(() => Date.now());
  const [answerChangeCount, setAnswerChangeCount] = useState(0);
  const [firstAnswerMs, setFirstAnswerMs] = useState<Array<number | null>>(
    () => new Array(questions.length).fill(null),
  );

  const answeredCount = useMemo(
    () => answers.filter((answer) => answer >= 0).length,
    [answers],
  );
  const resultCtaHierarchy = buildPracticeResultCtaHierarchy({
    subjectId,
    sectionId,
    topic: title,
  });
  const exclusionReason = result?.meta?.evidence
    ? formatLearningExclusionReasonLabel(
        result.meta.evidence.learning.exclusionReasonCode,
        locale,
      )
    : null;

  async function handleSubmit() {
    setLoading(true);
    const totalDurationMs = Math.max(0, Date.now() - startedAt);
    const perQuestionFirstAnswerMs = firstAnswerMs.map((value) =>
      value == null ? totalDurationMs : value,
    );
    const response = await authFetch(`/api/tests/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        totalDurationMs,
        perQuestionFirstAnswerMs,
        answerChangeCount,
      }),
    });
    const json = await response.json();
    setResult(json);
    setLoading(false);
  }

  return (
    <section className="grid gap-6">
      <div className="ui-panel ui-panel-soft ui-panel-tight text-sm">
        <p className="ui-eyebrow">
          {messages.testRunner.customPractice}
        </p>
        <p className="ui-copy-sm mt-2">
          {messages.testRunner.customPracticeBody}
        </p>
        <p className="ui-meta mt-2">
          {messages.testRunner.practiceDoesNotReplaceEpisode}
        </p>
      </div>
      <div className="ui-panel ui-panel-body">
        <h2 className="ui-title-lg">{title}</h2>
        <p className="ui-copy-sm mt-2">
          {messages.testRunner.answerAll}
        </p>
        <p className="ui-meta mt-3">
          {messages.learn.answered} {answeredCount} / {questions.length}
        </p>
      </div>
      <div className="grid gap-6">
        {questions.map((question, index) => (
          <div
            key={index}
            className="ui-panel ui-panel-tight"
          >
            <p className="ui-meta">
              {messages.testRunner.question} {index + 1}
            </p>
            <h3 className="ui-title-md mt-2 text-lg">{question.prompt}</h3>
            <div className="mt-4 grid gap-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className="ui-copy-sm flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    name={`q-${index}`}
                    value={optionIndex}
                    checked={answers[index] === optionIndex}
                    onChange={() =>
                      setAnswers((prev) => {
                        setAnswerChangeCount((value) => value + 1);
                        setFirstAnswerMs((timings) => {
                          if (timings[index] != null) return timings;
                          const next = [...timings];
                          next[index] = Math.max(0, Date.now() - startedAt);
                          return next;
                        });
                        const next = [...prev];
                        next[index] = optionIndex;
                        return next;
                      })
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ui-panel ui-panel-tight flex flex-wrap items-center gap-3">
        <button
          className="ui-action-primary"
          onClick={handleSubmit}
          disabled={loading || answeredCount < questions.length}
        >
          {loading ? messages.testRunner.submitting : messages.testRunner.submit}
        </button>
        {answeredCount < questions.length ? (
          <p className="ui-meta" role="status" aria-live="polite">
            {messages.testRunner.submitDisabledHint}
          </p>
        ) : null}
      </div>
      {result ? (
        <div className="ui-panel ui-panel-body">
          <h3 className="ui-title-md">
            {messages.testRunner.score}: {(result.score * 100).toFixed(0)}%
          </h3>
          <p className="ui-copy-sm mt-2">{messages.testRunner.attemptRecorded}</p>

          {result.meta?.evidence ? (
            <div className="mt-4">
              <AttemptEvidenceSummary contract={result.meta.evidence} />
            </div>
          ) : null}

          <details className="ui-panel ui-panel-tight ui-panel-soft mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-text">
              {messages.testRunner.evidenceTechnicalDetails}
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="ui-panel ui-panel-tight">
                <p className="ui-eyebrow">
                  {messages.testRunner.predictionVsActual}
                </p>
                <div className="ui-detail-list mt-3">
                  <div className="ui-detail-row">
                    <span>{messages.practice.expectedAccuracy}</span>
                    <span>
                      {result.meta?.predictionVsActual?.expectedAccuracy == null
                        ? "-"
                        : `${(result.meta.predictionVsActual.expectedAccuracy * 100).toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="ui-detail-row">
                    <span>{messages.testRunner.actualAccuracy}</span>
                    <span>
                      {result.meta?.predictionVsActual?.actualAccuracy == null
                        ? "-"
                        : `${(result.meta.predictionVsActual.actualAccuracy * 100).toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="ui-detail-row">
                    <span>{messages.practice.expectedTime}</span>
                    <span>
                      {result.meta?.predictionVsActual?.expectedTotalDurationMs == null
                        ? "-"
                        : `${Math.round(
                            result.meta.predictionVsActual.expectedTotalDurationMs / 1000,
                          )} ${messages.common.sec}`}
                    </span>
                  </div>
                  <div className="ui-detail-row">
                    <span>{messages.testRunner.actualTime}</span>
                    <span>
                      {result.meta?.predictionVsActual?.actualTotalDurationMs == null
                        ? "-"
                        : `${Math.round(
                            result.meta.predictionVsActual.actualTotalDurationMs / 1000,
                          )} ${messages.common.sec}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ui-panel ui-panel-tight">
                <p className="ui-eyebrow">{messages.testRunner.nextSuggestion}</p>
                <p className="ui-copy-sm mt-3 font-medium">
                  {messages.testRunner.suggestedNextDifficulty}:{" "}
                  {result.meta?.nextDifficultySuggestion?.value
                    ? formatDifficultyLabel(result.meta.nextDifficultySuggestion.value, locale)
                    : formatDifficultyFallback(locale)}
                </p>
                <p className="ui-meta mt-2">
                  {result.meta?.nextDifficultySuggestion?.reason ??
                    messages.testRunner.nextSuggestionBody}
                </p>
                {exclusionReason ? (
                  <p className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                    {messages.testRunner.excludedFromLearning} {exclusionReason}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm">
              {Object.keys(result.byTag).length === 0 ? (
                <p className="ui-meta">{messages.testRunner.noTagStats}</p>
              ) : (
                Object.entries(result.byTag).map(([axisKey, tags]) => (
                  <div
                    key={axisKey}
                    className="ui-panel ui-panel-tight"
                  >
                    <p className="ui-eyebrow">
                      {formatAxisLabel(axisKey, locale)}
                    </p>
                    <div className="ui-detail-list mt-3">
                      {Object.entries(tags).map(([tagKey, stats]) => (
                        <div key={tagKey} className="ui-detail-row">
                          <span>{tagKey}</span>
                          <span>{(stats.accuracy * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </details>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              className="ui-action-primary ui-action-sm"
              href={resultCtaHierarchy.primaryHref}
            >
              {messages.testRunner.openLearnerEpisodeFlow}
            </a>
            <a
              className="ui-action-secondary ui-action-sm"
              href={resultCtaHierarchy.secondaryHref}
            >
              {messages.testRunner.openCustomPractice}
            </a>
            <a className="ui-action-secondary ui-action-sm" href="/analytics">
              {messages.common.openAnalytics}
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
