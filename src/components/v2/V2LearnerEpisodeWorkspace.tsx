"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";
import { cx } from "@/lib/cx";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import AttemptEvidenceSummary from "@/components/learner/AttemptEvidenceSummary";
import V2Button, { v2ButtonClass } from "@/components/v2/V2Button";
import V2Card from "@/components/v2/V2Card";
import V2EmptyState from "@/components/v2/V2EmptyState";
import V2ErrorState from "@/components/v2/V2ErrorState";
import V2MetricCard from "@/components/v2/V2MetricCard";
import V2PageHeader from "@/components/v2/V2PageHeader";
import V2PersonalizationSummary from "@/components/v2/V2PersonalizationSummary";
import { normalizeLearningExclusionReason } from "@/lib/learning-evidence-contract";
import {
  advanceLearnerEpisode,
  buildPendingStartFingerprint,
  clearPendingLearnerEpisodeStartKey,
  clearStoredActiveLearnerEpisodeId,
  loadLearnerEpisode,
  readStoredActiveLearnerEpisodeId,
  reservePendingLearnerEpisodeStartKey,
  sendLearnerEpisodeDialogueTurn,
  startLearnerEpisode,
  submitLearnerEpisodeTest,
  writeStoredActiveLearnerEpisodeId,
  type LearnerEpisodeSequenceRole,
  type LearnerEpisodeState,
  type LearnerEpisodeStep,
  type LearnerEpisodeSubmitResult,
} from "@/lib/learner-episode-client";
import {
  formatLearningExclusionReasonLabel,
  getUiDateLocale,
  localizeErrorMessage,
} from "@/lib/ui-locale";

type SubjectOption = {
  id: string;
  title: string;
};

type SectionOption = {
  id: string;
  title: string;
  parentId: string | null;
};

type ExperienceMode = "adaptive" | "baseline";
type EpisodeStartFlow = "full" | "explanation_first";

type SubmissionSnapshot = {
  testId: string;
  role: LearnerEpisodeSequenceRole;
  result: LearnerEpisodeSubmitResult;
};

const LEARNING_DIALOGUE_MAX_CHARS = 600;

const ROLE_LABELS: Record<LearnerEpisodeSequenceRole, string> = {
  precheck: "Входная проверка",
  learning_content: "Объяснение",
  postcheck: "Итоговая проверка",
  holdout: "Контрольная проверка",
  delayed_recheck: "Повторная проверка",
};

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-";
  return `${(value * 100).toFixed(0)}%`;
}

function formatDuration(value: number | null | undefined, unit: string) {
  if (value == null) return "-";
  return `${Math.round(value / 1000)} ${unit}`;
}

function formatSettingValue(value: string | null | undefined) {
  if (!value) return "-";
  return value.replaceAll("_", " ");
}

function roleLabel(role: LearnerEpisodeSequenceRole | null | undefined) {
  return role ? ROLE_LABELS[role] : "Учебный эпизод";
}

function modeLabel(arm: string | null | undefined) {
  if (arm === "baseline") return "обычный режим";
  if (arm === "predicted") return "персонализированный режим";
  if (arm === "self_report") return "режим по выбранным настройкам";
  return "учебный режим";
}

function statusLabel(step: LearnerEpisodeStep) {
  if (step.status === "awaiting_test_submission") return "Нужно ответить на вопросы";
  if (step.status === "acknowledge_learning_content") return "Прочитай объяснение";
  if (step.status === "pending_materialization") return "Готов следующий шаг";
  if (step.status === "waiting_delay") return "Следующая проверка будет позже";
  if (step.status === "completed") return "Эпизод завершён";
  return "Готово к продолжению";
}

function isTestStep(step: LearnerEpisodeStep): step is Extract<
  LearnerEpisodeStep,
  { contentKind: "generated_test" }
> {
  return step.contentKind === "generated_test";
}

function isLearningContentStep(step: LearnerEpisodeStep): step is Extract<
  LearnerEpisodeStep,
  { contentKind: "chat_session" }
> {
  return step.contentKind === "chat_session";
}

function replaceEpisodeParam(episodeId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (episodeId) {
    url.searchParams.set("episode", episodeId);
  } else {
    url.searchParams.delete("episode");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function findNextPendingRole(state: LearnerEpisodeState) {
  return (
    state.currentStep.sequenceRole ??
    state.episode.sequence.expected.find(
      (role) => !state.episode.sequence.completed.includes(role),
    ) ??
    null
  );
}

function V2ProgressTracker({ state }: { state: LearnerEpisodeState }) {
  const currentRole = state.currentStep.sequenceRole;

  return (
    <div className="v2-progress-grid">
      {state.episode.sequence.expected.map((role) => {
        const completed = state.episode.sequence.completed.includes(role);
        const active = currentRole === role && !completed;

        return (
          <div
            key={role}
            className="v2-progress-step"
            data-active={active}
            data-completed={completed}
          >
            <span>{completed ? "Готово" : active ? "Сейчас" : "Дальше"}</span>
            <strong>{roleLabel(role)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function SubmissionSummary({
  onContinue,
  submission,
}: {
  onContinue: () => void;
  submission: SubmissionSnapshot;
}) {
  const { locale, messages } = useUiLocale();
  const prediction = submission.result.meta?.predictionVsActual ?? null;
  const nextSuggestion = submission.result.meta?.nextDifficultySuggestion ?? null;
  const evidence = submission.result.meta?.evidence ?? null;
  const dataQuality = submission.result.meta?.dataQuality ?? null;
  const isLearningEligible =
    evidence?.learning.eligible ?? !dataQuality?.excludedFromLearning;
  const exclusionReason =
    evidence?.learning.exclusionReasonCode ??
    normalizeLearningExclusionReason(dataQuality?.reasonCode ?? null);

  return (
    <V2Card tone="success" className="v2-result-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="v2-eyebrow">Результат записан</p>
          <h3 className="v2-title-md mt-2">{roleLabel(submission.role)}</h3>
          <p className="v2-copy-sm mt-2">
            {isLearningEligible
              ? "Система учла эту попытку для дальнейшей адаптации."
              : "Попытка не учтена для обучения системы."}
          </p>
        </div>
        <div className="v2-score-badge">{formatPercent(submission.result.score)}</div>
      </div>

      <div className="v2-metric-row mt-5">
        <V2MetricCard
          label="Ожидаемая точность"
          value={formatPercent(prediction?.expectedAccuracy ?? null)}
        />
        <V2MetricCard
          label="Фактическая точность"
          value={formatPercent(prediction?.actualAccuracy ?? null)}
        />
      </div>

      {!isLearningEligible ? (
        <p className="v2-warning-note mt-4">
          Причина:{" "}
          {formatLearningExclusionReasonLabel(exclusionReason, locale) ??
            dataQuality?.reasonLabel ??
            "качество попытки не прошло проверку"}
        </p>
      ) : null}

      {nextSuggestion?.value ? (
        <p className="v2-copy-sm mt-4">
          Следующая сложность: {formatSettingValue(nextSuggestion.value)}.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <V2Button type="button" onClick={onContinue}>
          Продолжить
        </V2Button>
        <Link
          className={v2ButtonClass({ variant: "secondary" })}
          href="/analytics"
        >
          Открыть аналитику
        </Link>
      </div>

      {evidence ? (
        <details className="v2-details mt-5">
          <summary>Технические детали</summary>
          <div className="mt-3">
            <AttemptEvidenceSummary contract={evidence} />
          </div>
        </details>
      ) : null}

      <details className="v2-details mt-4">
        <summary>Сравнение ожидания и результата</summary>
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Ожидаемое время:{" "}
            {formatDuration(
              prediction?.expectedTotalDurationMs ?? null,
              messages.common.sec,
            )}
          </p>
          <p>
            Фактическое время:{" "}
            {formatDuration(
              prediction?.actualTotalDurationMs ?? null,
              messages.common.sec,
            )}
          </p>
          <p>{nextSuggestion?.reason ?? "Для изменения сложности пока мало данных."}</p>
        </div>
      </details>
    </V2Card>
  );
}

function OutcomeCard({
  outcome,
}: {
  outcome: LearnerEpisodeState["episode"]["primaryOutcomes"][number];
}) {
  const { locale, messages } = useUiLocale();

  return (
    <V2Card>
      <p className="v2-eyebrow">{roleLabel(outcome.sequenceRole)}</p>
      <p className="v2-metric-value mt-2">{formatPercent(outcome.accuracy)}</p>
      <p className="v2-copy-sm mt-2">
        {outcome.questionCount ?? "-"} {messages.common.questions} ·{" "}
        {formatDuration(outcome.totalDurationMs, messages.common.sec)}
      </p>
      <p className="v2-meta mt-3">
        {outcome.learningEligible === false
          ? "Не учтено системой"
          : outcome.learningEligible === true
            ? "Учтено системой"
            : "Статус не указан"}
      </p>
      {outcome.learningEligible === false ? (
        <p className="v2-warning-note mt-2">
          {formatLearningExclusionReasonLabel(
            outcome.learningSkipReason ?? null,
            locale,
          ) ?? "Причина не указана"}
        </p>
      ) : null}
    </V2Card>
  );
}

export default function V2LearnerEpisodeWorkspace() {
  const { locale, messages } = useUiLocale();
  const dateLocale = getUiDateLocale(locale);
  const searchParams = useSearchParams();
  const requestedSubjectId = searchParams.get("subjectId") ?? "";
  const requestedEpisodeId = searchParams.get("episode") ?? "";

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [topic, setTopic] = useState("");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("adaptive");
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [episodeLoading, setEpisodeLoading] = useState(true);
  const [startingEpisode, setStartingEpisode] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "continue" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [episodeState, setEpisodeState] = useState<LearnerEpisodeState | null>(null);
  const [submission, setSubmission] = useState<SubmissionSnapshot | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [answerChangeCount, setAnswerChangeCount] = useState(0);
  const [firstAnswerMs, setFirstAnswerMs] = useState<Array<number | null>>([]);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [dialogueInput, setDialogueInput] = useState("");
  const [dialogueBusy, setDialogueBusy] = useState(false);
  const [showResumeNotice, setShowResumeNotice] = useState(false);

  const activeStep = episodeState?.currentStep ?? null;
  const activeTest = activeStep && isTestStep(activeStep) ? activeStep.test : null;
  const activeLearningContent =
    activeStep && isLearningContentStep(activeStep) ? activeStep.learningContent : null;
  const activeTestId = activeTest?.id ?? null;
  const activeQuestionCount = activeTest?.questions.length ?? 0;
  const answeredCount = answers.filter((answer) => answer >= 0).length;
  const hasTopics = subjects.length > 0;
  const subjectLabel =
    subjects.find((candidate) => candidate.id === episodeState?.episode.subjectId)?.title ??
    subjects.find((candidate) => candidate.id === subjectId)?.title ??
    null;
  const nextRole = episodeState ? findNextPendingRole(episodeState) : null;

  useEffect(() => {
    let active = true;

    async function loadSubjects() {
      setSubjectsLoading(true);
      const response = await authFetch("/api/subjects");
      if (!response.ok) {
        if (active) {
          setSubjects([]);
          setSubjectsLoading(false);
        }
        return;
      }

      const json = (await response.json()) as SubjectOption[];
      if (!active) return;

      setSubjects(json);
      const preferredSubjectId =
        (requestedSubjectId && json.find((item) => item.id === requestedSubjectId)?.id) ||
        json[0]?.id ||
        "";
      setSubjectId((current) => current || preferredSubjectId);
      setTopic((current) => {
        if (current.trim().length > 0) return current;
        const selected = json.find((item) => item.id === preferredSubjectId);
        return selected?.title ?? "";
      });
      setSubjectsLoading(false);
    }

    loadSubjects();

    return () => {
      active = false;
    };
  }, [requestedSubjectId]);

  useEffect(() => {
    let active = true;

    async function loadSections() {
      if (!subjectId) {
        setSections([]);
        setSectionId("");
        return;
      }

      const response = await authFetch(`/api/subjects/${subjectId}/sections`);
      if (!response.ok) {
        if (active) {
          setSections([]);
          setSectionId("");
        }
        return;
      }

      const json = (await response.json()) as SectionOption[];
      if (!active) return;
      setSections(json);
      setSectionId((current) => (json.some((item) => item.id === current) ? current : ""));
    }

    loadSections();

    return () => {
      active = false;
    };
  }, [subjectId]);

  useEffect(() => {
    let active = true;
    const candidateEpisodeId =
      requestedEpisodeId || readStoredActiveLearnerEpisodeId() || "";

    async function restoreEpisode() {
      if (!candidateEpisodeId) {
        const latestResponse = await authFetch(
          "/api/evaluation/episodes?status=active&limit=1",
        );
        if (!latestResponse.ok) {
          if (active) setEpisodeLoading(false);
          return;
        }

        const latestPayload = (await latestResponse.json()) as {
          episodes?: Array<{ episodeId?: string }>;
        };
        const latestEpisodeId = latestPayload.episodes?.[0]?.episodeId ?? "";
        if (!latestEpisodeId) {
          if (active) setEpisodeLoading(false);
          return;
        }

        try {
          const state = await loadLearnerEpisode(authFetch, latestEpisodeId);
          if (!active) return;
          setEpisodeState(state);
          setError(null);
          setShowResumeNotice(true);
          clearPendingLearnerEpisodeStartKey();
          writeStoredActiveLearnerEpisodeId(state.episode.episodeId);
          replaceEpisodeParam(state.episode.episodeId);
        } catch {
          if (!active) return;
          setShowResumeNotice(false);
          clearPendingLearnerEpisodeStartKey();
          clearStoredActiveLearnerEpisodeId();
          replaceEpisodeParam(null);
          setEpisodeState(null);
        } finally {
          if (active) setEpisodeLoading(false);
        }
        return;
      }

      try {
        const state = await loadLearnerEpisode(authFetch, candidateEpisodeId);
        if (!active) return;
        setEpisodeState(state);
        setError(null);
        setShowResumeNotice(true);
        clearPendingLearnerEpisodeStartKey();
        writeStoredActiveLearnerEpisodeId(state.episode.episodeId);
        replaceEpisodeParam(state.episode.episodeId);
      } catch {
        if (!active) return;
        setShowResumeNotice(false);
        clearPendingLearnerEpisodeStartKey();
        clearStoredActiveLearnerEpisodeId();
        replaceEpisodeParam(null);
        setEpisodeState(null);
      } finally {
        if (active) setEpisodeLoading(false);
      }
    }

    restoreEpisode();

    return () => {
      active = false;
    };
  }, [requestedEpisodeId]);

  useEffect(() => {
    if (!activeTestId) {
      setAnswers([]);
      setAnswerChangeCount(0);
      setFirstAnswerMs([]);
      setStartedAt(Date.now());
      return;
    }

    setAnswers(new Array(activeQuestionCount).fill(-1));
    setAnswerChangeCount(0);
    setFirstAnswerMs(new Array(activeQuestionCount).fill(null));
    setStartedAt(Date.now());
  }, [activeQuestionCount, activeTestId]);

  useEffect(() => {
    setDialogueInput("");
    setDialogueBusy(false);
  }, [activeLearningContent?.sessionId]);

  async function startEpisode(flow: EpisodeStartFlow) {
    if (!subjectId || !topic.trim()) {
      setError(messages.learn.chooseTopicAndFocus);
      return;
    }

    const expectedSequenceRoles =
      flow === "explanation_first"
        ? (["learning_content", "postcheck"] satisfies LearnerEpisodeSequenceRole[])
        : undefined;
    const includeHoldout = flow === "full";

    setStartingEpisode(true);
    setError(null);
    setSubmission(null);
    try {
      const clientKey = reservePendingLearnerEpisodeStartKey(
        buildPendingStartFingerprint({
          subjectId,
          sectionId: sectionId || null,
          topic: topic.trim(),
          mode: "practice",
          personalizationMode: experienceMode === "adaptive" ? "on" : "off",
          includeHoldout,
          expectedSequenceRoles,
        }),
      );
      const state = await startLearnerEpisode(authFetch, {
        subjectId,
        sectionId: sectionId || null,
        topic: topic.trim(),
        clientKey,
        questionCount: 3,
        mode: "practice",
        personalizationMode: experienceMode === "adaptive" ? "on" : "off",
        assignmentArm: experienceMode === "adaptive" ? "predicted" : "baseline",
        includeHoldout,
        expectedSequenceRoles,
      });
      setEpisodeState(state);
      setShowResumeNotice(false);
      clearPendingLearnerEpisodeStartKey();
      writeStoredActiveLearnerEpisodeId(state.episode.episodeId);
      replaceEpisodeParam(state.episode.episodeId);
    } catch (requestError) {
      setError(localizeErrorMessage(requestError, locale, messages.learn.errorStart));
    } finally {
      setStartingEpisode(false);
    }
  }

  async function handleStartEpisode(event: FormEvent) {
    event.preventDefault();
    await startEpisode("full");
  }

  async function handleContinueEpisode(acknowledgeLearningContent = false) {
    if (!episodeState) return;

    setBusyAction("continue");
    setError(null);
    try {
      const state = await advanceLearnerEpisode(
        authFetch,
        episodeState.episode.episodeId,
        acknowledgeLearningContent,
      );
      setEpisodeState(state);
      setSubmission(null);
      writeStoredActiveLearnerEpisodeId(state.episode.episodeId);
      replaceEpisodeParam(state.episode.episodeId);
    } catch (requestError) {
      setError(localizeErrorMessage(requestError, locale, messages.learn.errorContinue));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitTest() {
    if (!episodeState || !activeStep || !isTestStep(activeStep) || !activeTest) return;

    setBusyAction("submit");
    setError(null);
    try {
      const totalDurationMs = Math.max(0, Date.now() - startedAt);
      const perQuestionFirstAnswerMs = firstAnswerMs.map((value) =>
        value == null ? totalDurationMs : value,
      );
      const result = await submitLearnerEpisodeTest(authFetch, activeTest.id, {
        answers,
        totalDurationMs,
        perQuestionFirstAnswerMs,
        answerChangeCount,
      });
      const refreshedState = await loadLearnerEpisode(
        authFetch,
        episodeState.episode.episodeId,
      );
      setSubmission({
        testId: activeTest.id,
        role: activeStep.sequenceRole,
        result,
      });
      setEpisodeState(refreshedState);
      writeStoredActiveLearnerEpisodeId(refreshedState.episode.episodeId);
      replaceEpisodeParam(refreshedState.episode.episodeId);
    } catch (requestError) {
      setError(localizeErrorMessage(requestError, locale, messages.learn.errorSubmit));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendDialogueTurn() {
    if (
      !episodeState ||
      !activeLearningContent ||
      dialogueBusy ||
      activeLearningContent.dialogueBudget.reachedLimit
    ) {
      return;
    }

    const nextMessage = dialogueInput.trim();
    if (!nextMessage) return;

    setDialogueBusy(true);
    setError(null);
    try {
      const state = await sendLearnerEpisodeDialogueTurn(
        authFetch,
        episodeState.episode.episodeId,
        nextMessage,
      );
      setEpisodeState(state);
      writeStoredActiveLearnerEpisodeId(state.episode.episodeId);
      replaceEpisodeParam(state.episode.episodeId);
      setDialogueInput("");
    } catch (requestError) {
      setError(
        localizeErrorMessage(
          requestError,
          locale,
          messages.learn.errorDialogueReply,
        ),
      );
    } finally {
      setDialogueBusy(false);
    }
  }

  function handleStartNewEpisode() {
    setEpisodeState(null);
    setSubmission(null);
    setError(null);
    setDialogueInput("");
    setDialogueBusy(false);
    setShowResumeNotice(false);
    clearPendingLearnerEpisodeStartKey();
    clearStoredActiveLearnerEpisodeId();
    replaceEpisodeParam(null);
  }

  const precheckOutcome = episodeState?.episode.primaryOutcomes.find(
    (outcome) => outcome.sequenceRole === "precheck",
  );
  const postcheckOutcome = episodeState?.episode.primaryOutcomes.find(
    (outcome) => outcome.sequenceRole === "postcheck",
  );
  const resultGrowth =
    precheckOutcome?.accuracy != null && postcheckOutcome?.accuracy != null
      ? postcheckOutcome.accuracy - precheckOutcome.accuracy
      : null;

  return (
    <section className="v2-page">
      <V2PageHeader title="Учиться" eyebrow="EduAI">
        EduAI подбирает способ объяснения под твои результаты и показывает
        следующий учебный шаг без лишних служебных деталей.
      </V2PageHeader>

      {episodeLoading ? (
        <V2Card role="status" aria-live="polite">
          <h3 className="v2-title-sm">Восстанавливаю учебный эпизод</h3>
          <p className="v2-copy-sm mt-2">
            Если есть незавершённый эпизод, он откроется автоматически.
          </p>
        </V2Card>
      ) : null}

      {!episodeLoading && !episodeState ? (
        !subjectsLoading && !hasTopics ? (
          <V2EmptyState
            title="Тем пока нет"
            body="Создай первую тему, чтобы запустить обучение."
            actionHref="/topics?entry=setup"
            actionLabel="Создать тему"
          />
        ) : (
          <div className="v2-two-column">
            <V2Card>
              <p className="v2-eyebrow">Учебный эпизод</p>
              <h2 className="v2-title-xl mt-2">Начать обучение</h2>
              <p className="v2-copy mt-3">
                EduAI подберёт способ объяснения под твои результаты.
              </p>

              <form onSubmit={handleStartEpisode} className="v2-form mt-6">
                <label className="v2-label">
                  Тема
                  <select
                    className="v2-input"
                    value={subjectId}
                    onChange={(event) => {
                      const nextSubjectId = event.target.value;
                      setSubjectId(nextSubjectId);
                      const selected = subjects.find((item) => item.id === nextSubjectId);
                      if (selected) {
                        setTopic((current) =>
                          current.trim().length > 0 && current !== subjectLabel
                            ? current
                            : selected.title,
                        );
                      }
                    }}
                    disabled={subjectsLoading || subjects.length === 0}
                  >
                    <option value="">
                      {subjectsLoading ? "Загружаю темы..." : "Выбери тему"}
                    </option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="v2-label">
                  Раздел
                  <select
                    className="v2-input"
                    value={sectionId}
                    onChange={(event) => setSectionId(event.target.value)}
                    disabled={!subjectId}
                  >
                    <option value="">Без раздела</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="v2-label">
                  Фокус урока
                  <input
                    className="v2-input"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Например: квадратные уравнения"
                    required
                  />
                </label>

                <fieldset className="v2-fieldset">
                  <legend>Режим</legend>
                  <div className="v2-segmented">
                    <button
                      type="button"
                      className="v2-segment"
                      data-active={experienceMode === "adaptive"}
                      onClick={() => setExperienceMode("adaptive")}
                    >
                      Персонализированный режим
                    </button>
                    <button
                      type="button"
                      className="v2-segment"
                      data-active={experienceMode === "baseline"}
                      onClick={() => setExperienceMode("baseline")}
                    >
                      Обычный режим
                    </button>
                  </div>
                </fieldset>

                {error ? <V2ErrorState>{error}</V2ErrorState> : null}

                <div className="v2-action-row">
                  <V2Button
                    type="submit"
                    size="lg"
                    disabled={startingEpisode || !subjectId || !topic.trim()}
                  >
                    {startingEpisode ? "Начинаю..." : "Начать учебный эпизод"}
                  </V2Button>
                  <V2Button
                    type="button"
                    variant="secondary"
                    onClick={() => void startEpisode("explanation_first")}
                    disabled={startingEpisode || !subjectId || !topic.trim()}
                  >
                    Сначала объяснение
                  </V2Button>
                </div>
              </form>
            </V2Card>

            <V2Card tone="soft">
              <h3 className="v2-title-sm">Что происходит внутри</h3>
              <p className="v2-copy-sm mt-3">
                Эпизод обычно состоит из входной проверки, объяснения, итоговой
                проверки и контрольной проверки. Эти шаги помогают системе
                оценить, какой способ подачи действительно работает лучше.
              </p>
              <details className="v2-details mt-4">
                <summary>Показать технический контур</summary>
                <p className="mt-3 text-sm">
                  Включение New UI меняет только отображение. API, данные,
                  правила запуска эпизода и сохранение результатов остаются теми же.
                </p>
              </details>
            </V2Card>
          </div>
        )
      ) : null}

      {!episodeLoading && episodeState ? (
        <>
          <V2Card>
            {showResumeNotice ? (
              <div className="v2-info-note mb-5" role="alert">
                <strong>Найден незавершённый эпизод.</strong>
                <p>Можно продолжить с текущего шага или начать заново.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className={v2ButtonClass({ size: "sm" })} href="#episode-current-step">
                    Продолжить
                  </a>
                  <V2Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleStartNewEpisode}
                  >
                    Начать заново
                  </V2Button>
                </div>
              </div>
            ) : null}

            <div className="v2-page-header">
              <div>
                <p className="v2-eyebrow">Активный эпизод</p>
                <h2 className="v2-title-lg mt-2">
                  {episodeState.episode.topic ?? "Учебный эпизод"}
                </h2>
                <p className="v2-copy-sm mt-2">
                  {subjectLabel ?? "Тема не указана"} · {modeLabel(episodeState.episode.arm)}
                </p>
                <p className="v2-meta mt-2">
                  {statusLabel(episodeState.currentStep)}
                  {nextRole ? ` · ${roleLabel(nextRole)}` : ""}
                </p>
              </div>
              <div className="v2-page-header-actions">
                <V2Button
                  type="button"
                  variant="secondary"
                  onClick={handleStartNewEpisode}
                >
                  Начать новый эпизод
                </V2Button>
              </div>
            </div>

            <div className="mt-5">
              <V2ProgressTracker state={episodeState} />
            </div>
          </V2Card>

          {submission ? (
            <SubmissionSummary
              submission={submission}
              onContinue={() => void handleContinueEpisode(false)}
            />
          ) : null}

          {error ? <V2ErrorState>{error}</V2ErrorState> : null}

          <div id="episode-current-step" aria-hidden="true" />

          {activeStep?.status === "pending_materialization" ? (
            <V2Card>
              <p className="v2-eyebrow">Следующий шаг готов</p>
              <h3 className="v2-title-md mt-2">
                {roleLabel(activeStep.sequenceRole)}
              </h3>
              <p className="v2-copy-sm mt-2">Предыдущий результат записан.</p>
              <div className="mt-5">
                <V2Button
                  type="button"
                  onClick={() => void handleContinueEpisode(false)}
                  disabled={busyAction === "continue"}
                >
                  {busyAction === "continue" ? "Открываю..." : "Открыть шаг"}
                </V2Button>
              </div>
            </V2Card>
          ) : null}

          {activeStep?.status === "waiting_delay" ? (
            <V2Card>
              <p className="v2-eyebrow">Пауза перед повторной проверкой</p>
              <h3 className="v2-title-md mt-2">Следующий шаг пока недоступен</h3>
              <p className="v2-copy-sm mt-2">
                Продолжение после{" "}
                {new Date(activeStep.dueAtIso).toLocaleString(dateLocale)}.
              </p>
            </V2Card>
          ) : null}

          {activeStep && isLearningContentStep(activeStep) ? (
            <V2Card className="v2-learning-card">
              <div className="v2-page-header">
                <div>
                  <p className="v2-eyebrow">{roleLabel(activeStep.sequenceRole)}</p>
                  <h3 className="v2-title-lg mt-2">
                    {activeStep.learningContent.title}
                  </h3>
                  <p className="v2-copy-sm mt-2">
                    Объяснение и чат разделены, чтобы материал было проще читать.
                  </p>
                </div>
              </div>

              <V2PersonalizationSummary
                className="mt-5"
                metadata={activeStep.learningContent.mlPersonalization}
              />

              <div className="v2-two-column-wide mt-5">
                <section className="v2-learning-section" aria-labelledby="v2-learning-guide">
                  <p className="v2-eyebrow" id="v2-learning-guide">
                    Учебное объяснение
                  </p>
                  <p className="v2-copy mt-4">
                    {activeStep.learningContent.summary}
                  </p>

                  <div className="mt-5 grid gap-4">
                    {activeStep.learningContent.sections.map((section) => (
                      <V2Card key={section.heading} tone="soft">
                        <h4 className="v2-title-sm">{section.heading}</h4>
                        <p className="v2-copy-sm mt-2 whitespace-pre-wrap">
                          {section.body}
                        </p>
                      </V2Card>
                    ))}
                  </div>

                  <V2Card tone="soft" className="mt-5">
                    <p className="v2-eyebrow">Подумай</p>
                    <p className="v2-copy-sm mt-2">
                      {activeStep.learningContent.reflectionPrompt}
                    </p>
                  </V2Card>
                </section>

                <section className="v2-chat-section" aria-labelledby="v2-learning-chat">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="v2-eyebrow" id="v2-learning-chat">
                        Вопросы по материалу
                      </p>
                      <p className="v2-copy-sm mt-2">
                        Можно уточнить объяснение в рамках текущей темы.
                      </p>
                    </div>
                    <span className="v2-chip">
                      Осталось:{" "}
                      {activeStep.learningContent.dialogueBudget.learnerTurnsRemaining}
                    </span>
                  </div>

                  <div className="v2-dialogue-thread mt-5">
                    {activeStep.learningContent.dialogueThread.length === 0 ? (
                      <div className="v2-empty-inline">
                        <p className="font-semibold">Вопросов пока нет</p>
                        <p className="mt-2">
                          Можно попросить пример, объяснение проще или разбор шага.
                        </p>
                      </div>
                    ) : (
                      activeStep.learningContent.dialogueThread.map((message) => {
                        const isLearner = message.role === "user";

                        return (
                          <div
                            key={message.id}
                            className={cx("v2-message", isLearner && "v2-message-learner")}
                          >
                            <p className="v2-meta">
                              {isLearner ? "Ты" : "EduAI"}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                            {!isLearner ? (
                              <V2PersonalizationSummary
                                className="mt-3"
                                metadata={message.mlPersonalization}
                              />
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {dialogueBusy ? (
                      <div className="v2-message">
                        <p className="v2-meta">EduAI</p>
                        <p className="mt-2">Готовлю ответ...</p>
                      </div>
                    ) : null}
                  </div>

                  <label className="v2-label mt-5">
                    Вопрос
                    <textarea
                      className="v2-input min-h-28"
                      value={dialogueInput}
                      onChange={(event) => setDialogueInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !dialogueBusy &&
                          !activeStep.learningContent.dialogueBudget.reachedLimit
                        ) {
                          event.preventDefault();
                          void handleSendDialogueTurn();
                        }
                      }}
                      placeholder="Спроси по текущему материалу"
                      maxLength={LEARNING_DIALOGUE_MAX_CHARS}
                      disabled={
                        dialogueBusy ||
                        activeStep.learningContent.dialogueBudget.reachedLimit
                      }
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="v2-meta">
                      {dialogueInput.length} / {LEARNING_DIALOGUE_MAX_CHARS}
                    </p>
                    <V2Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleSendDialogueTurn()}
                      disabled={
                        dialogueBusy ||
                        activeStep.learningContent.dialogueBudget.reachedLimit ||
                        dialogueInput.trim().length === 0
                      }
                    >
                      {dialogueBusy ? "Отправляю..." : "Отправить вопрос"}
                    </V2Button>
                  </div>
                </section>
              </div>

              <div className="v2-action-row mt-6">
                <V2Button
                  type="button"
                  onClick={() => void handleContinueEpisode(true)}
                  disabled={busyAction === "continue"}
                >
                  {busyAction === "continue" ? "Продолжаю..." : "Перейти к проверке"}
                </V2Button>
                <details className="v2-details">
                  <summary>Технические детали</summary>
                  <p className="mt-3 text-sm">
                    Источник объяснения:{" "}
                    {activeStep.learningContent.generationSource === "llm"
                      ? "основная генерация"
                      : "стандартная генерация"}
                    . Текущие параметры: сложность{" "}
                    {formatSettingValue(
                      activeStep.learningContent.pedagogicalContext.difficulty,
                    )}
                    , глубина{" "}
                    {formatSettingValue(
                      activeStep.learningContent.pedagogicalContext.depth,
                    )}
                    .
                  </p>
                </details>
              </div>
            </V2Card>
          ) : null}

          {activeStep && isTestStep(activeStep) ? (
            <V2Card className="v2-test-card">
              <div className="v2-page-header">
                <div>
                  <p className="v2-eyebrow">{roleLabel(activeStep.sequenceRole)}</p>
                  <h3 className="v2-title-lg mt-2">{activeStep.test.title}</h3>
                  <p className="v2-copy-sm mt-2">
                    Отвечено {answeredCount} из {activeStep.test.questions.length}.
                  </p>
                </div>
                <span className="v2-chip">
                  {answeredCount}/{activeStep.test.questions.length}
                </span>
              </div>

              <div className="v2-question-list mt-5">
                {activeStep.test.questions.map((question, questionIndex) => (
                  <fieldset
                    key={`${activeStep.test.id}-${questionIndex}`}
                    className="v2-question-card"
                  >
                    <legend>
                      Вопрос {questionIndex + 1}: {question.prompt}
                    </legend>
                    <div className="mt-4 grid gap-3">
                      {question.options.map((option, optionIndex) => {
                        const selected = answers[questionIndex] === optionIndex;
                        return (
                          <label
                            key={`${activeStep.test.id}-${questionIndex}-${optionIndex}`}
                            className="v2-answer-card"
                            data-selected={selected}
                          >
                            <input
                              className="sr-only"
                              type="radio"
                              name={`episode-question-${questionIndex}`}
                              value={optionIndex}
                              checked={selected}
                              onChange={() =>
                                setAnswers((current) => {
                                  setAnswerChangeCount((value) => value + 1);
                                  setFirstAnswerMs((timings) => {
                                    if (timings[questionIndex] != null) return timings;
                                    const next = [...timings];
                                    next[questionIndex] = Math.max(
                                      0,
                                      Date.now() - startedAt,
                                    );
                                    return next;
                                  });
                                  const next = [...current];
                                  next[questionIndex] = optionIndex;
                                  return next;
                                })
                              }
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="v2-action-row mt-6">
                <V2Button
                  type="button"
                  size="lg"
                  onClick={handleSubmitTest}
                  disabled={
                    busyAction === "submit" ||
                    answeredCount < activeStep.test.questions.length
                  }
                >
                  {busyAction === "submit" ? "Отправляю..." : "Отправить ответы"}
                </V2Button>
                {answeredCount < activeStep.test.questions.length ? (
                  <p className="v2-meta">
                    Ответь на все вопросы, чтобы отправить результат.
                  </p>
                ) : (
                  <p className="v2-meta">Все вопросы готовы к отправке.</p>
                )}
              </div>
            </V2Card>
          ) : null}

          {activeStep?.status === "completed" ? (
            <V2Card tone="success">
              <p className="v2-eyebrow">Эпизод завершён</p>
              <h3 className="v2-title-lg mt-2">Результаты сохранены</h3>
              <p className="v2-copy-sm mt-3">
                Можно начать новый эпизод или посмотреть аналитику по прогрессу.
              </p>

              {resultGrowth != null ? (
                <p className="v2-info-note mt-5">
                  Изменение результата: {resultGrowth >= 0 ? "+" : ""}
                  {(resultGrowth * 100).toFixed(0)} п.п.
                </p>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {episodeState.episode.primaryOutcomes.map((outcome) => (
                  <OutcomeCard
                    key={`${outcome.sequenceRole}-${outcome.contentId}`}
                    outcome={outcome}
                  />
                ))}
              </div>

              <div className="v2-action-row mt-6">
                <V2Button type="button" onClick={handleStartNewEpisode}>
                  Начать новый эпизод
                </V2Button>
                <Link
                  className={v2ButtonClass({ variant: "secondary" })}
                  href="/analytics"
                >
                  Открыть аналитику
                </Link>
                <Link
                  className={v2ButtonClass({ variant: "ghost" })}
                  href="/topics"
                >
                  Вернуться к темам
                </Link>
              </div>
            </V2Card>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
