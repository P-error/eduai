"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import {
  formatEpisodeRoleLabel,
  formatEpisodeStatusLabel,
  type LearnerEpisodeSequenceRole,
  type LearnerEpisodeStatus,
} from "@/lib/learner-episode-client";
import type { OperatorEpisodeListEntry } from "@/lib/operator-episodes";

type OperatorSequenceRole = LearnerEpisodeSequenceRole | "prior_signal";

type SubjectOption = {
  id: string;
  title: string;
  description: string | null;
};

type SectionOption = {
  id: string;
  title: string;
  description: string | null;
  parentId: string | null;
};

type EpisodeAssignment = {
  assignmentSource: "explicit_request" | "runtime_default";
  selectionMode: string;
  personalizationMode: "on" | "off" | null;
  policyMode: string | null;
  policyId: string | null;
  runtimePolicyId: string | null;
  backendKind: string | null;
  backendId: string | null;
  assignedAtIso: string;
};

type EpisodeItem = {
  id: string;
  sequenceIndex: number;
  sequenceRole: OperatorSequenceRole;
  contentKind: "generated_test" | "chat_session";
  touchpointType: string;
  itemRole: string;
  itemVariant: string;
  linkageKind: string;
  linkedContentId: string | null;
  holdoutStrategy: string;
  delayedMinutes: number | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  } | null;
  selectedSixFactorConfig: OperatorEpisodeListEntry["selectedSixFactorConfig"];
  decisionRuntime: {
    runtimePolicyId: string | null;
    backendKind: string | null;
    backendId: string | null;
  };
  outcome: {
    accuracy: number | null;
    questionCount: number | null;
    totalDurationMs: number | null;
    submittedAtIso: string | null;
    learningEligible: boolean | null;
  } | null;
};

type OperatorEpisodeState = {
  episode: {
    episodeId: string;
    status: string;
    arm: string;
    subjectId: string | null;
    sectionId: string | null;
    topic: string | null;
    conceptKey: string | null;
    skillKey: string | null;
    assignment: EpisodeAssignment;
    design: {
      protocolKey?: string;
      expectedSequenceRoles: OperatorSequenceRole[];
      practiceEffectControl: {
        holdoutStrategy: string;
      };
    };
    counts: OperatorEpisodeListEntry["counts"];
    sequence: OperatorEpisodeListEntry["sequence"];
    timing: {
      episodeCreatedAtIso: string;
      firstDeliveredAtIso: string | null;
      lastDeliveredAtIso: string | null;
      lastOutcomeAtIso: string | null;
      maxDelayedMinutes: number | null;
    };
    practiceEffect: {
      familyKeys: string[];
      linkedPairs: Array<{
        contentId: string;
        linkedContentId: string;
        linkageKind: string;
      }>;
    };
    primaryOutcomes: Array<{
      sequenceRole: OperatorSequenceRole;
      accuracy: number | null;
      questionCount: number | null;
      totalDurationMs: number | null;
      submittedAtIso: string | null;
      learningEligible: boolean | null;
    }>;
    items: EpisodeItem[];
  };
  currentStep: {
    status: LearnerEpisodeStatus;
    sequenceRole: OperatorSequenceRole | null;
    contentKind: "generated_test" | "chat_session" | null;
    dueAtIso: string | null;
  };
};

type EpisodesPayload = {
  episodes: OperatorEpisodeListEntry[];
};

type CreateSubjectPayload = {
  ok?: boolean;
  data?: SubjectOption;
  error?: {
    message?: string;
  };
};

type ExportReadiness = OperatorEpisodeListEntry["exportReadiness"];

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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function formatDurationMs(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value / 1000)} sec`;
}

function formatOperatorFactorValue(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function operatorSixFactorRows(
  config: OperatorEpisodeListEntry["selectedSixFactorConfig"] | null | undefined,
) {
  return [
    ["difficulty", config?.difficulty ?? null],
    ["depth", config?.depth ?? null],
    ["support", config?.supportLevel ?? null],
    ["format", config?.presentationFormat ?? null],
    ["examples", config?.examplesLevel ?? null],
    ["terminology", config?.terminologyLevel ?? null],
  ] as const;
}

function operatorSixFactorSourceLabel(
  config: OperatorEpisodeListEntry["selectedSixFactorConfig"] | null | undefined,
) {
  if (!config) return "No six-factor config";
  if (config.compatibilityRole === "legacy_two_factor_bridge") {
    return "legacy compatibility projection";
  }
  if (config.decisionSource === "heuristic_baseline") {
    return "heuristic fallback, not ML evidence";
  }
  if (config.fallbackUsed) {
    return "fallback explicitly marked";
  }
  return config.appliedAsPrimary ? "primary six-factor configuration" : "six-factor projection";
}

function formatArmLabel(value: string) {
  if (value === "predicted") return "Predicted";
  if (value === "self_report") return "Self-report";
  if (value === "baseline") return "Baseline";
  if (value === "manual_override") return "Manual override";
  if (value === "heuristic_default") return "Heuristic default";
  return value;
}

function backendHonestyLabel(backendKind: string | null | undefined) {
  if (backendKind === "artifact_ml") return "Artifact-backed ML";
  if (backendKind === "heuristic_baseline") return "Heuristic baseline, not ML";
  if (backendKind === "stub_model") return "Stub model, not ML";
  return "Backend not declared";
}

function backendTone(backendKind: string | null | undefined) {
  if (backendKind === "artifact_ml") {
    return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
  }
  if (backendKind === "heuristic_baseline") {
    return "border-amber-700/60 bg-amber-950/20 text-amber-200";
  }
  if (backendKind === "stub_model") {
    return "border-fuchsia-700/60 bg-fuchsia-950/20 text-fuchsia-200";
  }
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function exportReadinessLabel(readiness: ExportReadiness) {
  if (readiness.ready) return "Export-ready";
  if (readiness.code === "no_primary_outcomes") return "Missing primary outcomes";
  if (readiness.code === "sequence_incomplete") return "Sequence incomplete";
  return "Episode still active";
}

function formatOperatorRoleLabel(role: OperatorSequenceRole | null) {
  if (role === "prior_signal") return "Prior signal";
  return formatEpisodeRoleLabel(role);
}

function deriveReadinessFromState(state: OperatorEpisodeState): ExportReadiness {
  if (state.episode.status !== "completed") {
    return { ready: false, code: "episode_active" };
  }
  if (state.episode.sequence.missing.length > 0) {
    return { ready: false, code: "sequence_incomplete" };
  }
  if (state.episode.primaryOutcomes.length === 0) {
    return { ready: false, code: "no_primary_outcomes" };
  }
  return { ready: true, code: "ready" };
}

function rowStateLabel(params: {
  role: OperatorSequenceRole;
  state: OperatorEpisodeState;
  item: EpisodeItem | null;
}) {
  const { role, state, item } = params;
  if (item?.outcome) {
    return "Outcome recorded";
  }
  if (item?.contentKind === "generated_test") {
    return "Awaiting test submission";
  }
  if (
    item?.contentKind === "chat_session" &&
    state.currentStep.sequenceRole === role &&
    state.currentStep.status === "acknowledge_learning_content"
  ) {
    return "Read and continue";
  }
  if (state.currentStep.sequenceRole === role) {
    return formatEpisodeStatusLabel(state.currentStep.status);
  }
  if (state.episode.sequence.completed.includes(role)) {
    return "Completed";
  }
  return "Pending";
}

function rowTone(params: {
  role: OperatorSequenceRole;
  state: OperatorEpisodeState;
  item: EpisodeItem | null;
}) {
  const label = rowStateLabel(params);
  if (label === "Outcome recorded" || label === "Completed") {
    return "border-emerald-800/60 bg-emerald-950/10";
  }
  if (
    params.state.currentStep.sequenceRole === params.role &&
    params.state.currentStep.status !== "completed"
  ) {
    return "border-sky-700/60 bg-sky-950/20";
  }
  return "border-slate-800 bg-slate-950/60";
}

export default function AdminEpisodesPage() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [episodes, setEpisodes] = useState<OperatorEpisodeListEntry[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [topic, setTopic] = useState("");
  const [conceptKey, setConceptKey] = useState("");
  const [skillKey, setSkillKey] = useState("");
  const [questionCount, setQuestionCount] = useState("3");
  const [assignmentArm, setAssignmentArm] = useState<
    "baseline" | "self_report" | "predicted"
  >("predicted");
  const [includeHoldout, setIncludeHoldout] = useState(true);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [selectedEpisode, setSelectedEpisode] = useState<OperatorEpisodeState | null>(
    null,
  );
  const [subjectDraftTitle, setSubjectDraftTitle] = useState("");
  const [subjectDraftDescription, setSubjectDraftDescription] = useState("");
  const [sectionDraftTitle, setSectionDraftTitle] = useState("");
  const [sectionDraftDescription, setSectionDraftDescription] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSubjects() {
      setSubjectsLoading(true);
      const response = await authFetch("/api/subjects");
      const json = response.ok ? ((await response.json()) as SubjectOption[]) : [];
      if (!active) return;

      setSubjects(json);
      setSubjectsLoading(false);
      setSubjectId((current) => {
        if (current && json.some((item) => item.id === current)) {
          return current;
        }
        return json[0]?.id ?? "";
      });
      setTopic((current) => {
        if (current.trim().length > 0) return current;
        return json[0]?.title ?? "";
      });
    }

    loadSubjects().catch(() => {
      if (!active) return;
      setSubjects([]);
      setSubjectsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function loadEpisodes(preferredEpisodeId?: string | null) {
    setEpisodesLoading(true);
    const response = await authFetch("/api/evaluation/episodes?limit=20");
    if (!response.ok) {
      setEpisodes([]);
      setEpisodesLoading(false);
      return;
    }

    const json = (await response.json()) as EpisodesPayload;
    const nextEpisodes = json.episodes ?? [];
    setEpisodes(nextEpisodes);
    setEpisodesLoading(false);
    setSelectedEpisodeId((current) => {
      const candidate =
        preferredEpisodeId ||
        current ||
        (typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("episode")
          : null) ||
        nextEpisodes[0]?.episodeId ||
        "";
      if (!candidate) return "";
      return nextEpisodes.some((item) => item.episodeId === candidate)
        ? candidate
        : (nextEpisodes[0]?.episodeId ?? "");
    });
  }

  useEffect(() => {
    loadEpisodes().catch(() => {
      setEpisodes([]);
      setEpisodesLoading(false);
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSections() {
      if (!subjectId) {
        setSections([]);
        setSectionId("");
        return;
      }

      const response = await authFetch(`/api/subjects/${subjectId}/sections`);
      const json = response.ok ? ((await response.json()) as SectionOption[]) : [];
      if (!active) return;

      setSections(json);
      setSectionId((current) => {
        if (current && json.some((item) => item.id === current)) {
          return current;
        }
        return "";
      });
    }

    loadSections().catch(() => {
      if (!active) return;
      setSections([]);
      setSectionId("");
    });

    return () => {
      active = false;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!selectedEpisodeId) {
      setSelectedEpisode(null);
      replaceEpisodeParam(null);
      return;
    }

    let active = true;
    replaceEpisodeParam(selectedEpisodeId);
    setInspectionLoading(true);

    authFetch(`/api/evaluation/episodes/${selectedEpisodeId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!active) return;
        setSelectedEpisode((json ?? null) as OperatorEpisodeState | null);
        setInspectionLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSelectedEpisode(null);
        setInspectionLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEpisodeId]);

  const selectedEntry =
    episodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? null;
  const selectedSubject =
    subjects.find((candidate) => candidate.id === (selectedEntry?.subject.id ?? subjectId)) ??
    null;
  const selectedSection =
    sections.find((candidate) => candidate.id === selectedEntry?.section.id) ?? null;
  const selectedReadiness = selectedEntry?.exportReadiness
    ? selectedEntry.exportReadiness
    : selectedEpisode
      ? deriveReadinessFromState(selectedEpisode)
      : { ready: false, code: "episode_active" as const };
  const selectedSixFactorConfig =
    selectedEntry?.selectedSixFactorConfig ??
    selectedEpisode?.episode.items.find((item) => item.selectedSixFactorConfig)
      ?.selectedSixFactorConfig ??
    null;

  async function refreshSubjects(preferredSubjectId?: string | null) {
    const response = await authFetch("/api/subjects");
    const json = response.ok ? ((await response.json()) as SubjectOption[]) : [];
    setSubjects(json);
    setSubjectId((current) => {
      const candidate = preferredSubjectId || current || json[0]?.id || "";
      return json.some((item) => item.id === candidate) ? candidate : (json[0]?.id ?? "");
    });
  }

  async function refreshSections(preferredSectionId?: string | null) {
    if (!subjectId) return;
    const response = await authFetch(`/api/subjects/${subjectId}/sections`);
    const json = response.ok ? ((await response.json()) as SectionOption[]) : [];
    setSections(json);
    setSectionId((current) => {
      const candidate = preferredSectionId || current || "";
      return json.some((item) => item.id === candidate) ? candidate : "";
    });
  }

  async function handleCreateSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectDraftTitle.trim()) return;

    setCreatingSubject(true);
    setError(null);
    try {
      const response = await authFetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subjectDraftTitle.trim(),
          description: subjectDraftDescription.trim() || null,
        }),
      });
      const json = (await response.json().catch(() => null)) as CreateSubjectPayload | null;
      if (!response.ok || json?.ok !== true || !json.data) {
        setError(json?.error?.message ?? "Failed to create subject.");
        return;
      }

      setSubjectDraftTitle("");
      setSubjectDraftDescription("");
      setTopic((current) => (current.trim().length > 0 ? current : json.data?.title ?? ""));
      await refreshSubjects(json.data.id);
    } finally {
      setCreatingSubject(false);
    }
  }

  async function handleCreateSection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId || !sectionDraftTitle.trim()) return;

    setCreatingSection(true);
    setError(null);
    try {
      const response = await authFetch(`/api/subjects/${subjectId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sectionDraftTitle.trim(),
          description: sectionDraftDescription.trim() || null,
          parentId: null,
          sortOrder: sections.length,
        }),
      });
      const json = (await response.json().catch(() => null)) as SectionOption | null;
      if (!response.ok || !json?.id) {
        setError("Failed to create topic/section.");
        return;
      }

      setSectionDraftTitle("");
      setSectionDraftDescription("");
      await refreshSections(json.id);
      setTopic((current) => (current.trim().length > 0 ? current : json.title));
    } finally {
      setCreatingSection(false);
    }
  }

  async function handleLaunchEpisode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId || !topic.trim()) {
      setError("Subject and topic are required.");
      return;
    }

    setLaunching(true);
    setError(null);
    try {
      const response = await authFetch("/api/evaluation/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          sectionId: sectionId || null,
          topic: topic.trim(),
          questionCount: Math.max(1, Number.parseInt(questionCount || "3", 10) || 3),
          mode: "practice",
          personalizationMode: assignmentArm === "baseline" ? "off" : "on",
          assignmentArm,
          conceptKey: conceptKey.trim() || null,
          skillKey: skillKey.trim() || null,
          includeHoldout,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | OperatorEpisodeState
        | {
            message?: string;
          }
        | null;
      if (!response.ok || !json || !("episode" in json)) {
        setError(
          (json && "message" in json && typeof json.message === "string"
            ? json.message
            : null) ?? "Failed to launch episode.",
        );
        return;
      }

      setSelectedEpisode(json);
      setSelectedEpisodeId(json.episode.episodeId);
      await loadEpisodes(json.episode.episodeId);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Researcher / Operator
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Episode Control Surface</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              One practical workflow for launching structured episodes, checking
              arm/provenance, inspecting pedagogical decisions, and verifying
              export-readiness without rebuilding the learner UI.
            </p>
          </div>
          <Link
            className="rounded-full border border-slate-700 px-4 py-2 text-sm"
            href="/admin"
          >
            Back to admin overview
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 1</p>
            <p className="mt-2 text-sm text-slate-200">Pick or create subject/topic context</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 2</p>
            <p className="mt-2 text-sm text-slate-200">Launch episode with explicit arm</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 3</p>
            <p className="mt-2 text-sm text-slate-200">Inspect sequence, decisions, and outcomes</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 4</p>
            <p className="mt-2 text-sm text-slate-200">Confirm export/evaluation readiness</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-800/60 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
          onSubmit={handleLaunchEpisode}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Launch episode</h3>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm"
              type="button"
              onClick={() => loadEpisodes(selectedEpisodeId || null)}
            >
              Refresh episodes
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Subject</span>
              <select
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={subjectId}
                onChange={(event) => {
                  const nextSubjectId = event.target.value;
                  setSubjectId(nextSubjectId);
                  const selectedSubjectTitle =
                    subjects.find((item) => item.id === nextSubjectId)?.title ?? "";
                  setTopic((current) => (current.trim().length > 0 ? current : selectedSubjectTitle));
                }}
              >
                <option value="">
                  {subjectsLoading ? "Loading subjects..." : "Select subject"}
                </option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Topic collection / section</span>
              <select
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                <option value="">No section constraint</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm md:col-span-2">
              <span className="text-slate-300">Topic</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Derivative rules"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Concept key</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={conceptKey}
                onChange={(event) => setConceptKey(event.target.value)}
                placeholder="derivative_rules"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Skill key</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={skillKey}
                onChange={(event) => setSkillKey(event.target.value)}
                placeholder="apply_derivative_rules"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Assignment arm</span>
              <select
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={assignmentArm}
                onChange={(event) =>
                  setAssignmentArm(
                    event.target.value as "baseline" | "self_report" | "predicted",
                  )
                }
              >
                <option value="predicted">predicted</option>
                <option value="self_report">self_report</option>
                <option value="baseline">baseline</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Question count</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                inputMode="numeric"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <input
                checked={includeHoldout}
                onChange={(event) => setIncludeHoldout(event.target.checked)}
                type="checkbox"
              />
              Include holdout
            </label>
            <span className="text-slate-500">
              Delivery mode: {assignmentArm === "baseline" ? "standard" : "personalized"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
              disabled={launching || !subjectId || !topic.trim()}
              type="submit"
            >
              {launching ? "Launching..." : "Launch operator episode"}
            </button>
            {selectedEpisodeId ? (
              <Link
                className="rounded-full border border-slate-700 px-4 py-2 text-sm"
                href={`/learn?episode=${encodeURIComponent(selectedEpisodeId)}`}
              >
                Open current episode in learner flow
              </Link>
            ) : null}
          </div>
        </form>

        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
          onSubmit={handleCreateSubject}
        >
          <h3 className="text-lg font-semibold">Quick subject control</h3>
          <p className="mt-2 text-sm text-slate-300">
            Minimal research workspace for creating the subject context used by
            episode launch.
          </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Subject title</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={subjectDraftTitle}
                onChange={(event) => setSubjectDraftTitle(event.target.value)}
                placeholder="Calculus"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Description</span>
              <textarea
                className="min-h-28 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                value={subjectDraftDescription}
                onChange={(event) => setSubjectDraftDescription(event.target.value)}
                placeholder="Optional operator note for this subject."
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
              disabled={creatingSubject || !subjectDraftTitle.trim()}
              type="submit"
            >
              {creatingSubject ? "Creating..." : "Create subject"}
            </button>
            <button
              className="rounded-full border border-slate-700 px-4 py-2 text-sm"
              type="button"
              onClick={() => refreshSubjects(subjectId || null)}
            >
              Refresh subjects
            </button>
          </div>
        </form>

        <form
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
          onSubmit={handleCreateSection}
        >
          <h3 className="text-lg font-semibold">Quick topic collection control</h3>
          <p className="mt-2 text-sm text-slate-300">
            Add a minimal section/topic bucket for the currently selected subject.
          </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Section title</span>
              <input
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3"
                disabled={!subjectId}
                value={sectionDraftTitle}
                onChange={(event) => setSectionDraftTitle(event.target.value)}
                placeholder="Derivative rules"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Description</span>
              <textarea
                className="min-h-28 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3 disabled:opacity-50"
                disabled={!subjectId}
                value={sectionDraftDescription}
                onChange={(event) => setSectionDraftDescription(event.target.value)}
                placeholder="Optional operator note for this topic collection."
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
              disabled={creatingSection || !subjectId || !sectionDraftTitle.trim()}
              type="submit"
            >
              {creatingSection ? "Creating..." : "Create section"}
            </button>
            <button
              className="rounded-full border border-slate-700 px-4 py-2 text-sm disabled:opacity-50"
              disabled={!subjectId}
              type="button"
              onClick={() => refreshSections(sectionId || null)}
            >
              Refresh sections
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Recent operator episodes</h3>
              <p className="mt-1 text-sm text-slate-300">
                Subject/topic linkage, arm, decisions, and readiness at a glance.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {episodes.length} loaded
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {episodesLoading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
                Loading episodes...
              </div>
            ) : episodes.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
                No episodes yet. Launch one from the operator form above.
              </div>
            ) : (
              episodes.map((episode) => (
                <button
                  key={episode.episodeId}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selectedEpisodeId === episode.episodeId
                      ? "border-slate-100 bg-slate-100 text-slate-950"
                      : "border-slate-800 bg-slate-950/60 text-slate-100"
                  }`}
                  onClick={() => setSelectedEpisodeId(episode.episodeId)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] opacity-70">
                        {formatArmLabel(episode.arm)} · {episode.status}
                      </p>
                      <h4 className="mt-2 text-base font-semibold">
                        {episode.subject.title ?? "Unknown subject"} / {episode.topic ?? "No topic"}
                      </h4>
                      <p className="mt-1 text-xs opacity-70">
                        {episode.section.title ?? "No section"} · concept{" "}
                        {episode.conceptKey ?? "—"} · skill {episode.skillKey ?? "—"}
                      </p>
                    </div>
                    <div
                      className={`rounded-full border px-3 py-1 text-xs ${
                        episode.exportReadiness.ready
                          ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-200"
                          : "border-amber-700/60 bg-amber-950/20 text-amber-200"
                      }`}
                    >
                      {exportReadinessLabel(episode.exportReadiness)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-current/10 bg-black/10 px-3 py-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.18em] opacity-60">
                        Six-factor configuration
                      </p>
                      <div className="mt-2 grid gap-1">
                        {operatorSixFactorRows(episode.selectedSixFactorConfig).map(
                          ([name, value]) => (
                            <p key={name}>
                              {name}: {formatOperatorFactorValue(value)}
                            </p>
                          ),
                        )}
                      </div>
                      <p className="mt-2 text-xs opacity-70">
                        {operatorSixFactorSourceLabel(episode.selectedSixFactorConfig)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-current/10 bg-black/10 px-3 py-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.18em] opacity-60">
                        Sequence
                      </p>
                      <p className="mt-2">
                        completed: {episode.sequence.completed.length}/
                        {episode.sequence.expected.length}
                      </p>
                      <p>next: {episode.sequence.nextExpectedRole ?? "none"}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs opacity-80">
                    <span
                      className={`rounded-full border px-2 py-1 ${backendTone(
                        episode.provenance.backendKind,
                      )}`}
                    >
                      {backendHonestyLabel(episode.provenance.backendKind)}
                    </span>
                    <span>created {formatDateTime(episode.createdAtIso)}</span>
                    <span>last outcome {formatDateTime(episode.lastOutcomeAtIso)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Episode inspection</h3>
              <p className="mt-1 text-sm text-slate-300">
                Operator-friendly inspect view for current state, provenance, sequence,
                and export readiness.
              </p>
            </div>
            {selectedEpisodeId ? (
              <Link
                className="rounded-full border border-slate-700 px-4 py-2 text-sm"
                href={`/learn?episode=${encodeURIComponent(selectedEpisodeId)}`}
              >
                Open in learner flow
              </Link>
            ) : null}
          </div>

          {!selectedEpisodeId ? (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
              Select an episode to inspect.
            </div>
          ) : inspectionLoading ? (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
              Loading episode inspection...
            </div>
          ) : !selectedEpisode ? (
            <div className="mt-5 rounded-2xl border border-rose-800/60 bg-rose-950/20 px-4 py-6 text-sm text-rose-200">
              Failed to load episode inspection.
            </div>
          ) : (
            <div className="mt-5 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Linkage
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-200">
                    <p>Subject: {selectedEntry?.subject.title ?? selectedSubject?.title ?? "—"}</p>
                    <p>Section: {selectedEntry?.section.title ?? selectedSection?.title ?? "—"}</p>
                    <p>Topic: {selectedEpisode.episode.topic ?? "—"}</p>
                    <p>Concept key: {selectedEpisode.episode.conceptKey ?? "—"}</p>
                    <p>Skill key: {selectedEpisode.episode.skillKey ?? "—"}</p>
                    <p>
                      Family keys:{" "}
                      {selectedEpisode.episode.practiceEffect.familyKeys.length > 0
                        ? selectedEpisode.episode.practiceEffect.familyKeys.join(", ")
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Current state
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-200">
                    <p>Status: {formatEpisodeStatusLabel(selectedEpisode.currentStep.status)}</p>
                    <p>
                      Active role:{" "}
                      {selectedEpisode.currentStep.sequenceRole
                        ? formatOperatorRoleLabel(selectedEpisode.currentStep.sequenceRole)
                        : "none"}
                    </p>
                    <p>Content kind: {selectedEpisode.currentStep.contentKind ?? "none"}</p>
                    <p>Due at: {formatDateTime(selectedEpisode.currentStep.dueAtIso)}</p>
                    <p>Episode status: {selectedEpisode.episode.status}</p>
                    <p>{exportReadinessLabel(selectedReadiness)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Assignment arm and provenance
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-200">
                    <p>Arm: {formatArmLabel(selectedEpisode.episode.arm)}</p>
                    <p>Assignment source: {selectedEpisode.episode.assignment.assignmentSource}</p>
                    <p>Selection mode: {selectedEpisode.episode.assignment.selectionMode}</p>
                    <p>
                      Personalization mode:{" "}
                      {selectedEpisode.episode.assignment.personalizationMode ?? "—"}
                    </p>
                    <p>Policy mode: {selectedEpisode.episode.assignment.policyMode ?? "—"}</p>
                    <p>Policy id: {selectedEpisode.episode.assignment.policyId ?? "—"}</p>
                    <p>
                      Runtime policy id:{" "}
                      {selectedEpisode.episode.assignment.runtimePolicyId ?? "—"}
                    </p>
                    <p>Backend kind: {selectedEpisode.episode.assignment.backendKind ?? "—"}</p>
                    <p>Backend id: {selectedEpisode.episode.assignment.backendId ?? "—"}</p>
                  </div>
                  <div
                    className={`mt-4 rounded-2xl border px-3 py-3 text-sm ${backendTone(
                      selectedEpisode.episode.assignment.backendKind,
                    )}`}
                  >
                    {backendHonestyLabel(selectedEpisode.episode.assignment.backendKind)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Six-factor pedagogical configuration
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-200">
                    {operatorSixFactorRows(selectedSixFactorConfig).map(([name, value]) => (
                      <p key={name}>
                        {name}: {formatOperatorFactorValue(value)}
                      </p>
                    ))}
                    <p className="text-slate-400">
                      Source: {operatorSixFactorSourceLabel(selectedSixFactorConfig)}
                    </p>
                    <p className="text-slate-500">
                      Legacy compatibility projection: difficulty{" "}
                      {selectedEntry?.selectedPedagogicalDecision.difficulty ??
                        selectedEpisode.episode.items.find((item) => item.pedagogicalDecision)?.pedagogicalDecision?.difficulty ??
                        "—"}
                      , depth{" "}
                      {selectedEntry?.selectedPedagogicalDecision.depth ??
                        selectedEpisode.episode.items.find((item) => item.pedagogicalDecision)?.pedagogicalDecision?.depth ??
                        "—"}
                    </p>
                    <p>
                      Holdout strategy:{" "}
                      {selectedEpisode.episode.design.practiceEffectControl.holdoutStrategy}
                    </p>
                    <p>
                      Expected roles:{" "}
                      {selectedEpisode.episode.sequence.expected.length > 0
                        ? selectedEpisode.episode.sequence.expected.join(" → ")
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Primary outcomes
                  </p>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectedReadiness.ready
                        ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-200"
                        : "border-amber-700/60 bg-amber-950/20 text-amber-200"
                    }`}
                  >
                    {exportReadinessLabel(selectedReadiness)}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {selectedEpisode.episode.primaryOutcomes.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-400">
                      No primary outcomes recorded yet.
                    </div>
                  ) : (
                    selectedEpisode.episode.primaryOutcomes.map((outcome) => (
                      <div
                        key={`${outcome.sequenceRole}-${outcome.submittedAtIso ?? "pending"}`}
                        className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm"
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          {formatOperatorRoleLabel(outcome.sequenceRole)}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">
                          {formatPercent(outcome.accuracy)}
                        </p>
                        <p className="mt-1 text-slate-300">
                          {outcome.questionCount ?? "—"} questions ·{" "}
                          {formatDurationMs(outcome.totalDurationMs)}
                        </p>
                        <p className="mt-1 text-slate-400">
                          Submitted {formatDateTime(outcome.submittedAtIso)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Step sequence inspection
                </p>
                <div className="mt-4 grid gap-3">
                  {selectedEpisode.episode.sequence.expected.map((role) => {
                    const item =
                      selectedEpisode.episode.items.find(
                        (candidate) => candidate.sequenceRole === role,
                      ) ?? null;

                    return (
                      <div
                        key={role}
                        className={`rounded-2xl border px-4 py-4 ${rowTone({
                          role,
                          state: selectedEpisode,
                          item,
                        })}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              {formatOperatorRoleLabel(role)}
                            </p>
                            <h4 className="mt-2 text-base font-semibold text-slate-100">
                              {rowStateLabel({ role, state: selectedEpisode, item })}
                            </h4>
                          </div>
                          <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                            {item?.contentKind ?? selectedEpisode.currentStep.contentKind ?? "pending"}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-300">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              Six-factor config
                            </p>
                            <div className="mt-2 grid gap-1">
                              {operatorSixFactorRows(
                                item?.selectedSixFactorConfig ?? selectedSixFactorConfig,
                              ).map(([name, value]) => (
                                <p key={name}>
                                  {name}: {formatOperatorFactorValue(value)}
                                </p>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              {item?.pedagogicalDecision
                                ? `compatibility: ${item.pedagogicalDecision.difficulty} / ${item.pedagogicalDecision.depth}`
                                : "compatibility: —"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-300">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              Linkage
                            </p>
                            <p className="mt-2">{item?.itemVariant ?? "—"}</p>
                            <p>{item?.linkageKind ?? "—"}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-300">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              Outcome
                            </p>
                            <p className="mt-2">{formatPercent(item?.outcome?.accuracy)}</p>
                            <p>{formatDurationMs(item?.outcome?.totalDurationMs)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-300">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              Backend
                            </p>
                            <p className="mt-2">{item?.decisionRuntime.backendKind ?? "—"}</p>
                            <p>{item?.decisionRuntime.backendId ?? "—"}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <details className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">
                  Machine-readable episode payload
                </summary>
                <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
                  {JSON.stringify(selectedEpisode, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
