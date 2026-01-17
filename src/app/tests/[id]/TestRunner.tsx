"use client";

import { useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type Question = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
};

export default function TestRunner({
  testId,
  title,
  questions,
}: {
  testId: string;
  title: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<number[]>(
    () => new Array(questions.length).fill(-1),
  );
  const [result, setResult] = useState<null | {
    score: number;
    byTag: Record<string, Record<string, { accuracy: number }>>;
  }>(null);
  const [loading, setLoading] = useState(false);

  const answeredCount = useMemo(
    () => answers.filter((answer) => answer >= 0).length,
    [answers],
  );

  async function handleSubmit() {
    setLoading(true);
    const response = await authFetch(`/api/tests/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const json = await response.json();
    setResult(json);
    setLoading(false);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">
          Answer all questions to submit the test.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Answered {answeredCount} / {questions.length}
        </p>
      </div>
      <div className="grid gap-6">
        {questions.map((question, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
          >
            <p className="text-sm text-slate-400">Question {index + 1}</p>
            <h3 className="mt-2 text-lg font-semibold">{question.prompt}</h3>
            <div className="mt-4 grid gap-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`q-${index}`}
                    value={optionIndex}
                    checked={answers[index] === optionIndex}
                    onChange={() =>
                      setAnswers((prev) => {
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
      <button
        className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
        onClick={handleSubmit}
        disabled={loading || answeredCount < questions.length}
      >
        {loading ? "Submitting..." : "Submit test"}
      </button>
      {result ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">
            Score: {(result.score * 100).toFixed(0)}%
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Tag breakdown is saved for personalization analytics.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-slate-200">
            {Object.keys(result.byTag).length === 0 ? (
              <p className="text-slate-400">No tag stats returned.</p>
            ) : (
              Object.entries(result.byTag).map(([axisKey, tags]) => (
                <div
                  key={axisKey}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <p className="text-xs uppercase text-slate-400">{axisKey}</p>
                  <div className="mt-2 grid gap-1">
                    {Object.entries(tags).map(([tagKey, stats]) => (
                      <div key={tagKey} className="flex justify-between">
                        <span>{tagKey}</span>
                        <span>{(stats.accuracy * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <a
            className="mt-4 inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm"
            href="/tests/stats"
          >
            View stats
          </a>
        </div>
      ) : null}
    </section>
  );
}
