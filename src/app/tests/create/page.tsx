"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateTestPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("Biology");
  const [topic, setTopic] = useState("Cell structure");
  const [questionCount, setQuestionCount] = useState(5);
  const [mode, setMode] = useState("quiz");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/tests/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
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
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />
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
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate test"}
          </button>
        </form>
      </div>
    </section>
  );
}
