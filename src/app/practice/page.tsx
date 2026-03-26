"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [sections, setSections] = useState<
    { id: string; title: string; parentId: string | null }[]
  >([]);
  const [sectionId, setSectionId] = useState("");
  const [topic, setTopic] = useState("Cell structure");
  const [questionCount, setQuestionCount] = useState(5);
  const [mode, setMode] = useState("practice");
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
      if (selected) {
        setTopic(selected.title);
      }
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
      const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
      const response = await authFetch(`/api/users/me/predictions${query}`);
      if (!response.ok) return;
      const json = (await response.json()) as PredictionsPayload;
      if (!active) return;
      setPredictions(json);
      const suggested = json.forTests?.nextDifficultySuggestion?.value;
      if (suggested === "easy" || suggested === "medium" || suggested === "hard") {
        setMode("practice");
      }
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
    if (value == null) return "Not enough data yet";
    return `${Math.round(value / 1000)} sec`;
  }, [expectedDuration?.value]);

  async function startPractice(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!subjectId) {
      setError("Select a subject first.");
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
      setError(json?.message ?? "Failed to generate test.");
      setLoading(false);
      return;
    }

    const json = await response.json();
    router.push(`/tests/${json.id}`);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Practice</h2>
        <p className="mt-2 text-sm text-slate-300">
          Generate a practice test aligned with your current learning trajectory.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Recommended settings</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
            <span>Suggested difficulty next</span>
            <span>{nextDifficulty?.value ?? "Not enough data yet"}</span>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
            <span>Expected accuracy</span>
            <span>
              {expectedAccuracy?.value == null
                ? "Not enough data yet"
                : `${(expectedAccuracy.value * 100).toFixed(0)}%`}
            </span>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
            <span>Expected time</span>
            <span>{expectedTimeLabel}</span>
          </div>
          <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
            <span>Confidence</span>
            <span>
              {expectedAccuracy
                ? expectedAccuracy.confidence.toFixed(2)
                : "low"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Generate a practice test</h3>
        <form onSubmit={startPractice} className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-300">Mode:</span>
            <button
              type="button"
              onClick={() => setPersonalizationMode("on")}
              className={`rounded-full px-3 py-1 ${personalizationMode === "on" ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-100"}`}
            >
              Personalized
            </button>
            <button
              type="button"
              onClick={() => setPersonalizationMode("off")}
              className={`rounded-full px-3 py-1 ${personalizationMode === "off" ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-100"}`}
            >
              Standard
            </button>
          </div>

          <label className="grid gap-2 text-sm">
            Subject
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={subjectId}
              onChange={(event) => {
                const nextSubjectId = event.target.value;
                setSubjectId(nextSubjectId);
                const selected = subjects.find((subject) => subject.id === nextSubjectId);
                if (selected) setTopic(selected.title);
              }}
              required
            >
              <option value="">Select a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            Topic
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              required
            />
          </label>

          <label className="grid gap-2 text-sm">
            Section (optional)
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">No section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              Question count
              <input
                type="number"
                min={1}
                max={20}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value))}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              Practice mode
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="practice">Practice</option>
                <option value="quiz">Quiz</option>
                <option value="exam">Exam</option>
              </select>
            </label>
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            disabled={loading || !subjectId}
          >
            {loading ? "Generating..." : "Start test"}
          </button>
        </form>
      </div>
    </section>
  );
}
