"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";

type SubjectStats = {
  subject: {
    id: string;
    title: string;
    description: string | null;
    collectionId: string | null;
  };
  excludedFromStats?: boolean;
  totals: {
    tests: number;
    avgScore: number;
  };
  attempts: {
    id: string;
    score: number;
    createdAt: string;
    topic: string;
  }[];
};

type Section = {
  id: string;
  title: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
};

export default function SubjectDetailsPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<SubjectStats | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [sectionParentId, setSectionParentId] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSubject() {
      setLoading(true);
      const [subjectRes, sectionsRes] = await Promise.all([
        authFetch(`/api/subjects/${params.id}/stats`),
        authFetch(`/api/subjects/${params.id}/sections`),
      ]);

      if (!subjectRes.ok) {
        const json = await subjectRes.json().catch(() => ({}));
        if (active) {
          setError(json.message ?? "Failed to load subject.");
          setLoading(false);
        }
        return;
      }

      const json = (await subjectRes.json()) as SubjectStats;
      const sectionsJson = sectionsRes.ok
        ? ((await sectionsRes.json()) as Section[])
        : [];

      if (active) {
        setData(json);
        setSections(sectionsJson);
        setLoading(false);
      }
    }
    loadSubject();
    return () => {
      active = false;
    };
  }, [params.id]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title);
    });
  }, [sections]);

  async function refreshSections() {
    const response = await authFetch(`/api/subjects/${params.id}/sections`);
    if (!response.ok) return;
    const json = (await response.json()) as Section[];
    setSections(json);
  }

  async function createSection(event: React.FormEvent) {
    event.preventDefault();
    const response = await authFetch(`/api/subjects/${params.id}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sectionTitle,
        description: sectionDescription || null,
        parentId: sectionParentId || null,
        sortOrder: sortedSections.length,
      }),
    });
    if (!response.ok) {
      return;
    }
    setSectionTitle("");
    setSectionDescription("");
    setSectionParentId("");
    await refreshSections();
  }

  async function renameSection(sectionId: string) {
    const title = window.prompt("New section title");
    if (!title) return;
    await authFetch(`/api/subjects/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await refreshSections();
  }

  async function deleteSection(sectionId: string) {
    if (!window.confirm("Delete section?")) return;
    await authFetch(`/api/subjects/sections/${sectionId}`, { method: "DELETE" });
    await refreshSections();
  }

  async function moveSection(sectionId: string, direction: "up" | "down") {
    const index = sortedSections.findIndex((section) => section.id === sectionId);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sortedSections.length) return;
    const current = sortedSections[index];
    const target = sortedSections[swapIndex];
    await Promise.all([
      authFetch(`/api/subjects/sections/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      }),
      authFetch(`/api/subjects/sections/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      }),
    ]);
    await refreshSections();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading subject...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-slate-200">{error ?? "Subject not found."}</p>
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">{data.subject.title}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {data.subject.description ?? "No description yet."}
        </p>
        {data.excludedFromStats ? (
          <p className="mt-2 text-xs text-amber-300">
            This subject belongs to the “Без темы” collection and is excluded
            from statistics.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            href={`/tests/create?subjectId=${data.subject.id}`}
          >
            Start test
          </a>
          <a
            className="rounded-full border border-slate-700 px-4 py-2"
            href="/subjects"
          >
            Back to subjects
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Totals</h3>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between">
              <span>Total tests</span>
              <span>{data.totals.tests}</span>
            </div>
            <div className="flex justify-between">
              <span>Average accuracy</span>
              <span>{(data.totals.avgScore * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Recent attempts</h3>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            {data.attempts.length === 0 ? (
              <p className="text-slate-500">No attempts yet.</p>
            ) : (
              data.attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                >
                  <span>{attempt.topic}</span>
                  <span>{Math.round(attempt.score * 100)}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Sections</h3>
        <form onSubmit={createSection} className="mt-4 grid gap-3 text-sm">
          <label className="grid gap-2">
            Title
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={sectionTitle}
              onChange={(event) => setSectionTitle(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-2">
            Description (optional)
            <textarea
              rows={2}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={sectionDescription}
              onChange={(event) => setSectionDescription(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            Parent section
            <select
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={sectionParentId}
              onChange={(event) => setSectionParentId(event.target.value)}
            >
              <option value="">No parent</option>
              {sortedSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
          >
            Add section
          </button>
        </form>

        <div className="mt-6 grid gap-2 text-sm text-slate-300">
          {sortedSections.length === 0 ? (
            <p className="text-slate-500">No sections yet.</p>
          ) : (
            sortedSections.map((section, index) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{section.title}</p>
                  {section.description ? (
                    <p className="text-xs text-slate-500">
                      {section.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a
                    className="rounded-full border border-slate-700 px-3 py-1"
                    href={`/tests/create?subjectId=${data.subject.id}&sectionId=${section.id}`}
                  >
                    Start test
                  </a>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    onClick={() => moveSection(section.id, "up")}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    onClick={() => moveSection(section.id, "down")}
                    disabled={index === sortedSections.length - 1}
                  >
                    Down
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    onClick={() => renameSection(section.id)}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1"
                    onClick={() => deleteSection(section.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
