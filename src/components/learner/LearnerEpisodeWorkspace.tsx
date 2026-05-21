"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import AttemptEvidenceSummary from "@/components/learner/AttemptEvidenceSummary";
import MlPersonalizationCard from "@/components/ml-personalization-card";
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
  formatArmLabelForLocale,
  formatDifficultyFallback,
  formatDifficultyLabel,
  formatEpisodeRoleLabelForLocale,
  formatEpisodeStatusLabelForLocale,
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
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const SIX_FACTOR_VALUE_LABELS = {
  en: {
    difficulty: {
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
    depth: {
      brief: "Brief",
      standard: "Standard",
      detailed: "Detailed",
    },
    supportLevel: {
      minimal: "Minimal",
      guided: "Guided",
      scaffolded: "Scaffolded",
    },
    presentationFormat: {
      paragraph: "Paragraph",
      structured_list: "Structured list",
      step_by_step: "Step by step",
      qa: "Q&A",
    },
    examplesLevel: {
      none: "No examples",
      single: "One example",
      multiple: "Multiple examples",
    },
    terminologyLevel: {
      simple: "Simple",
      balanced: "Balanced",
      technical: "Technical",
    },
  },
  ru: {
    difficulty: {
      easy: "Лёгкая",
      medium: "Средняя",
      hard: "Сложная",
    },
    depth: {
      brief: "Краткая",
      standard: "Сбалансированная",
      detailed: "Подробная",
    },
    supportLevel: {
      minimal: "Минимальная",
      guided: "С подсказками",
      scaffolded: "Пошаговая",
    },
    presentationFormat: {
      paragraph: "Связный текст",
      structured_list: "Структурированный список",
      step_by_step: "Пошагово",
      qa: "Вопрос-ответ",
    },
    examplesLevel: {
      none: "Без примеров",
      single: "Один пример",
      multiple: "Несколько примеров",
    },
    terminologyLevel: {
      simple: "Простая",
      balanced: "Сбалансированная",
      technical: "Техническая",
    },
  },
} as const;

function formatSixFactorValue(
  axis: keyof (typeof SIX_FACTOR_VALUE_LABELS)["en"],
  value: string | null | undefined,
  locale: keyof typeof SIX_FACTOR_VALUE_LABELS,
) {
  if (!value) return "-";
  const axisLabels = SIX_FACTOR_VALUE_LABELS[locale][axis] as Record<string, string>;
  return axisLabels[value] ?? formatSettingValue(value);
}

function roleTone(role: LearnerEpisodeSequenceRole) {
  if (role === "learning_content") {
    return "border-sky-800/70 bg-sky-950/20 text-sky-200";
  }
  if (role === "holdout") {
    return "border-amber-800/70 bg-amber-950/20 text-amber-200";
  }
  return "border-slate-700 bg-slate-900/70 text-slate-200";
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

function ProgressTracker({
  state,
}: {
  state: LearnerEpisodeState;
}) {
  const { locale, messages } = useUiLocale();
  const currentRole = state.currentStep.sequenceRole;

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {state.episode.sequence.expected.map((role) => {
        const completed = state.episode.sequence.completed.includes(role);
        const active = currentRole === role && !completed;

        return (
          <div
            key={role}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              completed
                ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-200"
                : active
                  ? "border-slate-100 bg-slate-100 text-slate-950"
                  : "border-slate-800 bg-slate-900/50 text-slate-400"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.18em]">
              {completed
                ? messages.learn.upcomingDone
                : active
                  ? messages.learn.upcomingCurrent
                  : messages.learn.upcomingNext}
            </p>
            <p className="mt-2 font-medium">
              {formatEpisodeRoleLabelForLocale(role, locale)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SubmissionSummary({
  submission,
}: {
  submission: SubmissionSnapshot;
}) {
  const { locale, messages } = useUiLocale();
  const prediction = submission.result.meta?.predictionVsActual ?? null;
  const nextSuggestion = submission.result.meta?.nextDifficultySuggestion ?? null;
  const evidence = submission.result.meta?.evidence ?? null;
  const dataQuality = submission.result.meta?.dataQuality ?? null;
  const lead =
    submission.role === "precheck"
      ? messages.learn.submissionPrecheck
      : submission.role === "postcheck"
        ? messages.learn.submissionPostcheck
        : submission.role === "holdout"
          ? messages.learn.submissionHoldout
          : messages.learn.submissionDefault;

  return (
    <div className="rounded-3xl border border-emerald-800/60 bg-emerald-950/20 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
            {messages.learn.summaryOutcomeRecorded}
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            {lead}
          </h3>
        </div>
        <div className="rounded-full border border-emerald-700/60 px-3 py-1 text-sm text-emerald-100">
          {messages.learn.summaryScore} {formatPercent(submission.result.score)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-900/60 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {messages.learn.summaryPredictionVsActual}
          </p>
          <div className="mt-3 grid gap-2 text-slate-200">
            <div className="flex justify-between gap-3">
              <span>{messages.practice.expectedAccuracy}</span>
              <span>{formatPercent(prediction?.expectedAccuracy ?? null)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.common.actualAccuracy}</span>
              <span>{formatPercent(prediction?.actualAccuracy ?? null)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.practice.expectedTime}</span>
              <span>{formatDuration(prediction?.expectedTotalDurationMs ?? null, messages.common.sec)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.common.actualTime}</span>
              <span>{formatDuration(prediction?.actualTotalDurationMs ?? null, messages.common.sec)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-900/60 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {messages.learn.summaryRuntimeNote}
          </p>
          <p className="mt-3 text-base font-medium text-slate-100">
            {messages.learn.nextDifficulty}:{" "}
            {nextSuggestion?.value
              ? formatDifficultyLabel(nextSuggestion.value, locale)
              : formatDifficultyFallback(locale)}
          </p>
          <p className="mt-2 text-slate-300">
            {nextSuggestion?.reason ??
              messages.learn.moreEvidenceBeforeDifficultyChange}
          </p>
          {dataQuality?.excludedFromLearning ? (
            <p className="mt-3 rounded-2xl border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              {messages.learn.excludedFromLearningUpdates}{" "}
              {formatLearningExclusionReasonLabel(
                evidence?.learning.exclusionReasonCode ?? null,
                locale,
              ) ??
                dataQuality.reasonLabel ??
                dataQuality.reasonCode ??
                messages.learn.dataQualityGate}
            </p>
          ) : null}
        </div>
      </div>

      {evidence ? (
        <div className="mt-4">
          <AttemptEvidenceSummary contract={evidence} />
        </div>
      ) : null}
    </div>
  );
}

export default function LearnerEpisodeWorkspace() {
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
  const subjectLabel =
    subjects.find((candidate) => candidate.id === episodeState?.episode.subjectId)?.title ??
    subjects.find((candidate) => candidate.id === subjectId)?.title ??
    null;
  const hasTopics = subjects.length > 0;

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
          if (active) {
            setEpisodeLoading(false);
          }
          return;
        }

        const latestPayload = (await latestResponse.json()) as {
          episodes?: Array<{ episodeId?: string }>;
        };
        const latestEpisodeId = latestPayload.episodes?.[0]?.episodeId ?? "";
        if (!latestEpisodeId) {
          if (active) {
            setEpisodeLoading(false);
          }
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
          if (active) {
            setEpisodeLoading(false);
          }
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
        if (active) {
          setEpisodeLoading(false);
        }
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

  async function handleStartEpisode(event: React.FormEvent) {
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
    if (!nextMessage) {
      return;
    }

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

  const nextRole = episodeState ? findNextPendingRole(episodeState) : null;
  const sixFactorLearningContentItems = activeLearningContent
    ? [
        {
          label: messages.learn.difficultySetting,
          value: formatSixFactorValue(
            "difficulty",
            activeLearningContent.mlPersonalization?.selected_config.difficulty ??
              activeLearningContent.pedagogicalContext.difficulty,
            locale,
          ),
        },
        {
          label: messages.learn.depthSetting,
          value: formatSixFactorValue(
            "depth",
            activeLearningContent.mlPersonalization?.selected_config.depth ??
              activeLearningContent.pedagogicalContext.depth,
            locale,
          ),
        },
        {
          label: locale === "ru" ? "Поддержка" : "Support",
          value: formatSixFactorValue(
            "supportLevel",
            activeLearningContent.mlPersonalization?.selected_config.support_level ??
              activeLearningContent.pedagogicalContext.supportLevel,
            locale,
          ),
        },
        {
          label: locale === "ru" ? "Формат" : "Format",
          value: formatSixFactorValue(
            "presentationFormat",
            activeLearningContent.mlPersonalization?.selected_config.presentation_format ??
              activeLearningContent.pedagogicalContext.presentationFormat,
            locale,
          ),
        },
        {
          label: locale === "ru" ? "Примеры" : "Examples",
          value: formatSixFactorValue(
            "examplesLevel",
            activeLearningContent.mlPersonalization?.selected_config.examples_level ??
              activeLearningContent.pedagogicalContext.examplesLevel,
            locale,
          ),
        },
        {
          label: locale === "ru" ? "Терминология" : "Terminology",
          value: formatSixFactorValue(
            "terminologyLevel",
            activeLearningContent.mlPersonalization?.selected_config.terminology_level ??
              activeLearningContent.pedagogicalContext.terminologyLevel,
            locale,
          ),
        },
      ]
    : [];

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              {messages.learn.title}
            </p>
            <h2 className="mt-2 text-3xl font-semibold">{messages.learn.structuredEpisode}</h2>
            <p className="mt-3 max-w-3xl text-sm text-slate-300">{messages.learn.structuredEpisodeBody}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            <p className="font-medium text-slate-100">{messages.learn.evidenceTitle}</p>
            <p className="mt-1">{messages.learn.evidenceBody}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {messages.learn.adaptiveTitle}
            </p>
            <p className="mt-2 text-slate-200">{messages.learn.adaptiveBody}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {messages.learn.practiceAlignmentTitle}
            </p>
            <p className="mt-2 text-slate-200">{messages.learn.practiceAlignmentBody}</p>
          </div>
        </div>
      </div>

      {episodeLoading ? (
        <div className="ui-panel ui-panel-tight" role="status" aria-live="polite">
          <p className="ui-title-md text-base">{messages.learn.restoreEpisode}</p>
          <p className="ui-copy-sm mt-2">{messages.learn.restoreEpisodeBody}</p>
        </div>
      ) : null}

      {!episodeLoading && !episodeState ? (
        !subjectsLoading && !hasTopics ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div
              className="ui-panel ui-panel-hero ui-panel-body"
              role="status"
              aria-live="polite"
            >
              <p className="ui-eyebrow">{messages.learn.title}</p>
              <h3 className="ui-title-lg mt-3">{messages.learn.noTopicsTitle}</h3>
              <p className="ui-copy mt-3">{messages.learn.noTopicsBody}</p>
              <p className="ui-copy-sm mt-2">{messages.learn.noTopicsHelp}</p>
              <div className="mt-5">
                <Link className="ui-action-primary" href="/topics?entry=setup">
                  {messages.learn.createFirstTopic}
                </Link>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="ui-panel ui-panel-body">
                <h3 className="ui-title-md">{messages.learn.whatLearnerWillSee}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                  {messages.learn.whatLearnerWillSeeItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{messages.learn.startNewEpisode}</h3>
                <p className="mt-2 text-sm text-slate-300">{messages.learn.startNewEpisodeBody}</p>
              </div>
              <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {messages.learn.holdoutEnabled}
              </div>
            </div>

            <form onSubmit={handleStartEpisode} className="mt-6 grid gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-300">{messages.learn.episodeMode}</span>
                <button
                  type="button"
                  onClick={() => setExperienceMode("adaptive")}
                  className={`rounded-full px-3 py-1 ${
                    experienceMode === "adaptive"
                      ? "bg-slate-100 text-slate-900"
                      : "border border-slate-700 text-slate-100"
                  }`}
                >
                  {messages.learn.adaptive}
                </button>
                <button
                  type="button"
                  onClick={() => setExperienceMode("baseline")}
                  className={`rounded-full px-3 py-1 ${
                    experienceMode === "baseline"
                      ? "bg-slate-100 text-slate-900"
                      : "border border-slate-700 text-slate-100"
                  }`}
                >
                  {formatArmLabelForLocale("baseline", locale)}
                </button>
              </div>

              <label className="grid gap-2 text-sm">
                {messages.learn.topic}
                <select
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
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
                    {subjectsLoading
                      ? messages.learn.loadingTopics
                      : subjects.length === 0
                        ? messages.learn.addTopicInTopicsFirst
                        : messages.common.selectTopic}
                  </option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.title}
                    </option>
                  ))}
                </select>
              </label>

              {!subjectsLoading && !hasTopics ? (
                <p className="text-sm text-slate-400">
                  {messages.learn.addTopicBeforeLearn}
                </p>
              ) : null}

              <label className="grid gap-2 text-sm">
                {messages.common.sectionOptional}
                <select
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                  value={sectionId}
                  onChange={(event) => setSectionId(event.target.value)}
                  disabled={!subjectId}
                >
                  <option value="">{messages.learn.noSection}</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                {messages.learn.lessonFocus}
                <input
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder={messages.learn.placeholderTopic}
                  required
                />
              </label>

              {error ? (
                <div className="ui-panel ui-panel-danger ui-panel-tight text-sm" role="alert">
                  <p>{error}</p>
                  <p className="mt-2">{messages.learn.errorNextStep}</p>
                  <div className="mt-3">
                    <Link className="ui-action-secondary ui-action-sm" href="/topics">
                      {messages.common.openTopics}
                    </Link>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
                  disabled={startingEpisode || !subjectId || !topic.trim()}
                >
                  {startingEpisode ? messages.learn.startLoading : messages.learn.startButton}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void startEpisode("explanation_first")}
                  disabled={startingEpisode || !subjectId || !topic.trim()}
                >
                  {startingEpisode
                    ? messages.learn.startLoading
                    : messages.learn.startWithExplanation}
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">{messages.learn.whatLearnerWillSee}</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                {messages.learn.whatLearnerWillSeeItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">{messages.learn.topicPromptTitle}</h3>
              <p className="mt-2 text-sm text-slate-300">{messages.learn.topicPromptBody}</p>
              <p className="mt-2 text-xs text-slate-400">{messages.learn.topicPromptNote}</p>
              <div className="mt-4 text-sm">
                <Link
                  className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100"
                  href="/topics"
                >
                  {messages.common.openTopics}
                </Link>
              </div>
            </div>
          </div>
        </div>
        )
      ) : null}

      {!episodeLoading && episodeState ? (
        <>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            {showResumeNotice ? (
              <div
                className="mb-5 rounded-2xl border border-sky-800/60 bg-sky-950/20 px-4 py-3 text-sm text-sky-100"
                role="alert"
              >
                <p className="font-medium">{messages.learn.resumeNoticeTitle}</p>
                <p className="mt-1 text-sky-200">{messages.learn.resumeNoticeBody}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className="ui-action-primary ui-action-sm" href="#episode-current-step">
                    {messages.learn.continueRestoredEpisode}
                  </a>
                  <button
                    type="button"
                    className="ui-action-secondary ui-action-sm"
                    onClick={handleStartNewEpisode}
                  >
                    {messages.learn.startNewInstead}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {messages.learn.activeEpisode}
                </p>
                <h3 className="mt-2 text-2xl font-semibold">
                  {episodeState.episode.topic ??
                    messages.learn.learningEpisodeFallback}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {messages.learn.topic}: {subjectLabel ?? messages.learn.topicFallback} ·{" "}
                  {messages.learn.arm}: {formatArmLabelForLocale(episodeState.episode.arm, locale)}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {formatEpisodeStatusLabelForLocale(episodeState.currentStep.status, locale)}
                  {nextRole ? ` · ${formatEpisodeRoleLabelForLocale(nextRole, locale)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm"
                  onClick={handleStartNewEpisode}
                >
                  {messages.learn.startAnotherEpisode}
                </button>
                <Link
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm"
                  href="/practice"
                >
                  {messages.learn.openPractice}
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {messages.learn.testItems}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {episodeState.episode.counts.testItems}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {messages.learn.learningContentCount}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {episodeState.episode.counts.chatItems}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {messages.learn.completedOutcomes}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {episodeState.episode.counts.completedTestOutcomes}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {messages.learn.created}
                </p>
                <p className="mt-2 text-base font-semibold">
                  {new Date(episodeState.episode.timing.episodeCreatedAtIso).toLocaleString(dateLocale)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <ProgressTracker state={episodeState} />
            </div>
          </div>

          {submission ? <SubmissionSummary submission={submission} /> : null}

          {error ? (
            <div
              className="ui-panel ui-panel-danger ui-panel-tight text-sm"
              role="alert"
            >
              <p>{error}</p>
              <p className="mt-2">{messages.learn.errorNextStep}</p>
            </div>
          ) : null}

          <div id="episode-current-step" aria-hidden="true" />

          {activeStep?.status === "pending_materialization" ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {messages.learn.continueEpisode}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {formatEpisodeRoleLabelForLocale(activeStep.sequenceRole, locale)}
                  </h3>
                  <p className="mt-2 text-sm text-slate-300">{messages.learn.previousRecorded}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
                  onClick={() => handleContinueEpisode(false)}
                  disabled={busyAction === "continue"}
                >
                  {busyAction === "continue"
                    ? messages.learn.stepContinueLoading
                    : messages.learn.continueToOpen}
                </button>
              </div>
            </div>
          ) : null}

          {activeStep?.status === "waiting_delay" ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {messages.learn.waitingDelay}
              </p>
              <h3 className="mt-2 text-xl font-semibold">{messages.learn.delayedRecheckNotDue}</h3>
              <p className="mt-2 text-sm text-slate-300">
                {messages.learn.statusAfter.replace(
                  "{date}",
                  new Date(activeStep.dueAtIso).toLocaleString(dateLocale),
                )}
              </p>
            </div>
          ) : null}

          {activeStep && isLearningContentStep(activeStep) ? (
            <div className={`rounded-3xl border p-6 ${roleTone(activeStep.sequenceRole)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em]">
                    {formatEpisodeRoleLabelForLocale(activeStep.sequenceRole, locale)}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    {activeStep.learningContent.title}
                  </h3>
                  <p className="mt-2 text-sm text-current/80">
                    {messages.learn.dialogueSubtitle}
                  </p>
                </div>
                <div className="rounded-full border border-current/40 px-3 py-1 text-xs">
                  {messages.learn.secondarySupportingStep}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-current/20 bg-slate-950/30 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-current/70">
                    {messages.learn.currentTopic}
                  </p>
                  <p className="mt-2 font-medium">
                    {episodeState.episode.topic ?? messages.learn.learningEpisodeFallback}
                  </p>
                </div>
                <div className="rounded-2xl border border-current/20 bg-slate-950/30 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-current/70">
                    {messages.learn.topic}
                  </p>
                  <p className="mt-2 font-medium">
                    {subjectLabel ?? messages.learn.topicFallback}
                  </p>
                </div>
                {sixFactorLearningContentItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-current/20 bg-slate-950/30 p-4 text-sm"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-current/70">
                      {item.label}
                    </p>
                    <p className="mt-2 font-medium">{item.value}</p>
                  </div>
                ))}
              </div>

              <MlPersonalizationCard
                className="mt-5"
                forceVisible
                metadata={activeStep.learningContent.mlPersonalization}
              />

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-3xl border border-current/20 bg-slate-950/30 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-current/70">
                    {messages.learn.guideTitle}
                  </p>
                  <p className="mt-4 text-base leading-7">
                    {activeStep.learningContent.summary}
                  </p>

                  <div className="mt-5 grid gap-4">
                    {activeStep.learningContent.sections.map((section) => (
                      <div
                        key={section.heading}
                        className="rounded-2xl border border-current/15 bg-slate-950/30 p-4"
                      >
                        <h4 className="text-lg font-semibold">{section.heading}</h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-current/15 bg-slate-950/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em]">
                      {messages.learn.reflectionPrompt}
                    </p>
                    <p className="mt-2 text-sm">
                      {activeStep.learningContent.reflectionPrompt}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-current/20 bg-slate-950/30 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-current/70">
                        {messages.learn.dialogueTitle}
                      </p>
                      <p className="mt-2 text-sm text-current/80">
                        {messages.learn.educationalOnly}
                      </p>
                    </div>
                    <div className="rounded-full border border-current/25 px-3 py-1 text-xs">
                      {messages.learn.dialogueTurnsRemaining.replace(
                        "{count}",
                        String(
                          activeStep.learningContent.dialogueBudget
                            .learnerTurnsRemaining,
                        ),
                      )}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-current/15 bg-slate-950/30 p-4">
                    {activeStep.learningContent.dialogueThread.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-current/25 px-4 py-5">
                        <p className="text-sm font-medium">
                          {messages.learn.dialogueEmptyTitle}
                        </p>
                        <p className="mt-2 text-sm text-current/80">
                          {messages.learn.dialogueEmptyBody}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            messages.learn.dialogueStarterExplain.replace(
                              "{topic}",
                              episodeState.episode.topic ??
                                messages.learn.learningEpisodeFallback,
                            ),
                            messages.learn.dialogueStarterExample.replace(
                              "{topic}",
                              episodeState.episode.topic ??
                                messages.learn.learningEpisodeFallback,
                            ),
                            messages.learn.dialogueStarterFocus.replace(
                              "{topic}",
                              episodeState.episode.topic ??
                                messages.learn.learningEpisodeFallback,
                            ),
                          ].map((starter) => (
                            <button
                              key={starter}
                              type="button"
                              className="rounded-full border border-current/25 px-3 py-2 text-left text-xs"
                              onClick={() => setDialogueInput(starter)}
                            >
                              {starter}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
                        {activeStep.learningContent.dialogueThread.map((message) => {
                          const isLearner = message.role === "user";

                          return (
                            <div
                              key={message.id}
                              className={`flex ${isLearner ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                                  isLearner
                                    ? "border border-slate-700 bg-slate-900/90 text-slate-100"
                                    : "border border-sky-800/60 bg-sky-950/30 text-sky-100"
                                }`}
                              >
                                <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                                  {isLearner
                                    ? messages.learn.dialogueLearnerLabel
                                    : messages.learn.dialogueSystemLabel}
                                </p>
                                <p className="mt-2 whitespace-pre-wrap">
                                  {message.content}
                                </p>
                                {!isLearner ? (
                                  <MlPersonalizationCard
                                    className="mt-3"
                                    forceVisible
                                    metadata={message.mlPersonalization}
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                        {dialogueBusy ? (
                          <div className="flex justify-start">
                            <div className="max-w-[92%] rounded-2xl border border-sky-800/60 bg-sky-950/30 px-4 py-3 text-sm text-sky-100">
                              <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                                {messages.learn.dialogueSystemLabel}
                              </p>
                              <p className="mt-2">{messages.learn.dialogueSending}</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 grid gap-3">
                    <label className="grid gap-2 text-sm">
                      {messages.learn.dialogueInputLabel}
                      <textarea
                        className="min-h-28 rounded-2xl border border-current/20 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none"
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
                        placeholder={messages.learn.dialogueInputPlaceholder}
                        maxLength={LEARNING_DIALOGUE_MAX_CHARS}
                        disabled={
                          dialogueBusy ||
                          activeStep.learningContent.dialogueBudget.reachedLimit
                        }
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-current/80">
                      <p>{messages.learn.dialogueScopedNote}</p>
                      <p>
                        {dialogueInput.length} / {LEARNING_DIALOGUE_MAX_CHARS}
                      </p>
                    </div>

                    {activeStep.learningContent.dialogueBudget.reachedLimit ? (
                      <p className="rounded-2xl border border-amber-700/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                        {messages.learn.dialogueLimitReached}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-full border border-current/40 px-4 py-2 text-sm"
                  onClick={() => void handleSendDialogueTurn()}
                  disabled={
                    dialogueBusy ||
                    activeStep.learningContent.dialogueBudget.reachedLimit ||
                    dialogueInput.trim().length === 0
                  }
                >
                  {dialogueBusy
                    ? messages.learn.dialogueSending
                    : messages.learn.dialogueSend}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900"
                  onClick={() => handleContinueEpisode(true)}
                  disabled={busyAction === "continue"}
                >
                  {busyAction === "continue"
                    ? messages.learn.continuing
                    : messages.learn.continueToNextTest}
                </button>
                <details className="text-xs text-current/80">
                  <summary className="cursor-pointer">
                    {messages.learn.contentDetails}
                  </summary>
                  <p className="mt-2">
                    {messages.common.source}:{" "}
                    {activeStep.learningContent.generationSource === "llm"
                      ? messages.learn.sourceLlm
                      : messages.learn.sourceFallback}
                    . {messages.learn.acknowledgeSource}
                  </p>
                </details>
              </div>
            </div>
          ) : null}

          {activeStep && isTestStep(activeStep) ? (
            <div className={`rounded-3xl border p-6 ${roleTone(activeStep.sequenceRole)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em]">
                    {formatEpisodeRoleLabelForLocale(activeStep.sequenceRole, locale)}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">{activeStep.test.title}</h3>
                  <p className="mt-2 text-sm">{messages.learn.answerAllQuestions}</p>
                </div>
                <div className="rounded-full border border-current/40 px-3 py-1 text-xs">
                  {messages.learn.primaryLearningSignal}
                </div>
              </div>

              <p className="mt-4 text-sm">
                {messages.learn.answered} {answeredCount} / {activeStep.test.questions.length}
              </p>

              <div className="mt-5 grid gap-4">
                {activeStep.test.questions.map((question, questionIndex) => (
                  <div
                    key={`${activeStep.test.id}-${questionIndex}`}
                    className="rounded-2xl border border-current/20 bg-slate-950/30 p-5"
                  >
                    <p className="text-xs uppercase tracking-[0.18em]">
                      {messages.learn.question} {questionIndex + 1}
                    </p>
                    <h4 className="mt-2 text-lg font-semibold">{question.prompt}</h4>
                    <div className="mt-4 grid gap-2 text-sm">
                      {question.options.map((option, optionIndex) => (
                        <label
                          key={`${activeStep.test.id}-${questionIndex}-${optionIndex}`}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-current/10 px-3 py-2"
                        >
                          <input
                            type="radio"
                            name={`episode-question-${questionIndex}`}
                            value={optionIndex}
                            checked={answers[questionIndex] === optionIndex}
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
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900"
                  onClick={handleSubmitTest}
                  disabled={
                    busyAction === "submit" || answeredCount < activeStep.test.questions.length
                  }
                >
                  {busyAction === "submit" ? messages.learn.submitting : messages.learn.submit}
                </button>
                <p className="text-xs">
                  {activeStep.sequenceRole === "holdout"
                    ? messages.learn.submissionUpdatesHoldout
                    : messages.learn.submissionUpdates}
                </p>
              </div>
            </div>
          ) : null}

          {activeStep?.status === "completed" ? (
            <div className="rounded-3xl border border-emerald-800/60 bg-emerald-950/20 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                {messages.learn.completedBanner}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {messages.learn.completedTitle}
              </h3>
              <p className="mt-3 text-sm text-emerald-100">{messages.learn.completedBody}</p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {episodeState.episode.primaryOutcomes.map((outcome) => (
                  <div
                    key={`${outcome.sequenceRole}-${outcome.contentId}`}
                    className="rounded-2xl border border-emerald-900/60 bg-slate-950/60 p-4 text-sm"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {formatEpisodeRoleLabelForLocale(outcome.sequenceRole, locale)}
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {formatPercent(outcome.accuracy)}
                    </p>
                    <p className="mt-2 text-slate-300">
                      {outcome.questionCount ?? "-"}{" "}
                      {messages.common.questions} ·{" "}
                      {formatDuration(outcome.totalDurationMs, messages.common.sec)}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {messages.common.learningUpdates}:{" "}
                      {outcome.learningEligible === true
                        ? messages.common.eligible
                        : outcome.learningEligible === false
                          ? messages.common.excluded
                          : messages.common.unknown}
                    </p>
                    {outcome.learningEligible === false ? (
                      <p className="mt-2 text-xs text-amber-200">
                        {messages.common.whyExcluded}:{" "}
                        {formatLearningExclusionReasonLabel(
                          outcome.learningSkipReason ?? null,
                          locale,
                        ) ?? messages.common.unknown}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900"
                  onClick={handleStartNewEpisode}
                >
                  {messages.learn.startAnotherEpisode}
                </button>
                <Link
                  className="rounded-full border border-emerald-700/60 px-4 py-2 text-sm text-emerald-100"
                  href="/analytics"
                >
                  {messages.common.openAnalytics}
                </Link>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
