"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";

export default function CreateTestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [subjectId, setSubjectId] = useState("");
  const [sections, setSections] = useState<
    { id: string; title: string; parentId: string | null }[]
  >([]);
  const [sectionId, setSectionId] = useState("");
  const [topic, setTopic] = useState("Cell structure");
  const [questionCount, setQuestionCount] = useState(5);
  const [mode, setMode] = useState("quiz");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSubjects() {
      const response = await authFetch("/api/subjects");
      if (!response.ok) return;
      const json = (await response.json()) as { id: string; title: string }[];
      if (active) {
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
      if (active) {
        setSections(json);
        const requested = searchParams.get("sectionId");
        const initial =
          (requested && json.find((section) => section.id === requested)?.id) ||
          "";
        setSectionId(initial);
      }
    }
    loadSections();
    return () => {
      active = false;
    };
  }, [searchParams, subjectId]);

  useEffect(() => {
    const selected = subjects.find((subject) => subject.id === subjectId);
    if (selected) {
      setTopic(selected.title);
    }
  }, [subjectId, subjects]);

  async function handleSubmit(event: React.FormEvent) {
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
      }),
    });

    if (!response.ok) {
      setError("Failed to generate test.");
      setLoading(false);
      return;
    }

    const json = await response.json();
    router.push(`/tests/${json.id}`);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Create a test</h2>
        <p className="mt-2 text-sm text-slate-300">
          Generate a new LLM-based quiz, then tag each question across 10 axes.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            Subject
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              required
            >
              <option value="">Select a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
            {subjects.length === 0 ? (
              <span className="text-xs text-slate-400">
                No subjects yet. Create one on the{" "}
                <a className="underline" href="/subjects">
                  subjects page
                </a>
                .
              </span>
            ) : null}
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
              Mode
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="quiz">Quiz</option>
                <option value="exam">Exam</option>
                <option value="practice">Practice</option>
              </select>
            </label>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
            disabled={loading || !subjectId}
          >
            {loading ? "Generating..." : "Generate test"}
          </button>
        </form>
      </div>
    </section>
  );
}
