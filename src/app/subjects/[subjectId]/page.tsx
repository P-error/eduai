"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
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
  const params = useParams<{ subjectId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SubjectStats | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [recommendation, setRecommendation] = useState<{
    preset: {
      subjectId: string;
      sectionId: string | null;
      topic: string;
      questionCount: number;
      mode: "quiz" | "exam" | "practice";
      delivery?: Record<string, string>;
    };
    rationale: string;
    dataStatus: "OK" | "INSUFFICIENT";
  } | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [sectionParentId, setSectionParentId] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSubject() {
      setLoading(true);
      const [subjectRes, sectionsRes, recRes] = await Promise.all([
        authFetch(`/api/subjects/${params.subjectId}/stats`),
        authFetch(`/api/subjects/${params.subjectId}/sections`),
        authFetch(`/api/subjects/${params.subjectId}/recommendation`),
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
      const recJson = recRes.ok ? await recRes.json() : null;

      if (active) {
        setData(json);
        setSections(sectionsJson);
        if (recJson?.ok) {
          setRecommendation({
            preset: recJson.preset,
            rationale: recJson.rationale,
            dataStatus: recJson.dataStatus,
          });
        }
        setLoading(false);
      }
    }
    loadSubject();
    return () => {
      active = false;
    };
  }, [params.subjectId]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title);
    });
  }, [sections]);

  const sectionLookup = useMemo(() => {
    const map = new Map<string, Section>();
    sections.forEach((section) => map.set(section.id, section));
    return map;
  }, [sections]);

  const sectionDepth = useMemo(() => {
    const cache = new Map<string, number>();
    const computeDepth = (section: Section): number => {
      if (!section.parentId) return 0;
      if (cache.has(section.id)) return cache.get(section.id) ?? 0;
      const parent = sectionLookup.get(section.parentId);
      const depth = parent ? computeDepth(parent) + 1 : 1;
      cache.set(section.id, depth);
      return depth;
    };
    sections.forEach((section) => cache.set(section.id, computeDepth(section)));
    return cache;
  }, [sections, sectionLookup]);

  const sectionPath = useMemo(() => {
    const cache = new Map<string, string>();
    const computePath = (section: Section): string => {
      if (cache.has(section.id)) return cache.get(section.id) ?? section.title;
      const segments: string[] = [section.title];
      let current = section;
      let guard = 0;
      while (current.parentId && guard < 10) {
        const parent = sectionLookup.get(current.parentId);
        if (!parent) break;
        segments.unshift(parent.title);
        current = parent;
        guard += 1;
      }
      const path = segments.join(" → ");
      cache.set(section.id, path);
      return path;
    };
    sections.forEach((section) => cache.set(section.id, computePath(section)));
    return cache;
  }, [sections, sectionLookup]);

  async function refreshSections() {
    const response = await authFetch(
      `/api/subjects/${params.subjectId}/sections`,
    );
    if (!response.ok) return;
    const json = (await response.json()) as Section[];
    setSections(json);
  }

  async function createSection(event: React.FormEvent) {
    event.preventDefault();
    const response = await authFetch(
      `/api/subjects/${params.subjectId}/sections`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sectionTitle,
        description: sectionDescription || null,
        parentId: sectionParentId || null,
        sortOrder: sortedSections.length,
      }),
    },
    );
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
    await authFetch(`/api/subjects/${params.subjectId}/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await refreshSections();
  }

  async function deleteSection(sectionId: string) {
    if (!window.confirm("Delete section?")) return;
    await authFetch(`/api/subjects/${params.subjectId}/sections/${sectionId}`, {
      method: "DELETE",
    });
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
      authFetch(`/api/subjects/${params.subjectId}/sections/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      }),
      authFetch(`/api/subjects/${params.subjectId}/sections/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: current.sortOrder }),
      }),
    ]);
    await refreshSections();
  }

  async function startRecommendedTest() {
    if (!recommendation) return;
    setRecLoading(true);
    setRecError(null);
    const response = await authFetch("/api/tests/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: recommendation.preset.subjectId,
        sectionId: recommendation.preset.sectionId,
        topic: recommendation.preset.topic,
        questionCount: recommendation.preset.questionCount,
        mode: recommendation.preset.mode,
        delivery: recommendation.preset.delivery ?? {},
        recommended: true,
        recommendationSnapshot: recommendation,
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      setRecError(json?.error?.message ?? "Failed to generate test.");
      setRecLoading(false);
      return;
    }
    router.push(`/tests/${json.id}`);
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
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Recommended test</h3>
          <p className="mt-2 text-sm text-slate-300">
            {recommendation?.dataStatus === "INSUFFICIENT"
              ? "Недостаточно данных — рекомендован базовый тест."
              : recommendation?.rationale ?? "Рекомендация загружается..."}
          </p>
          {recError ? (
            <p className="mt-2 text-xs text-red-300">{recError}</p>
          ) : null}
          <button
            className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="button"
            onClick={startRecommendedTest}
            disabled={!recommendation || recLoading}
          >
            {recLoading ? "Starting..." : "Start recommended test"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Разделы предмета</h3>
            <p className="mt-1 text-xs text-slate-400">
              Раздел — подтема внутри предмета. Тест по разделу уточняет генерацию.
            </p>
          </div>
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-sm"
            type="button"
            onClick={() => {
              const input = document.getElementById("section-title");
              if (input instanceof HTMLInputElement) {
                input.focus();
              }
            }}
          >
            Добавить раздел
          </button>
        </div>
        <form onSubmit={createSection} className="mt-4 grid gap-3 text-sm">
          <label className="grid gap-2">
            Title
            <input
              id="section-title"
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
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950 px-4 py-4 text-sm text-slate-400">
              <p>Разделов пока нет.</p>
              <button
                className="mt-3 rounded-full border border-slate-700 px-4 py-2 text-xs"
                type="button"
                onClick={() => {
                  const input = document.getElementById("section-title");
                  if (input instanceof HTMLInputElement) {
                    input.focus();
                  }
                }}
              >
                Добавить раздел
              </button>
            </div>
          ) : (
            sortedSections.map((section, index) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3"
                style={{
                  marginLeft: `${(sectionDepth.get(section.id) ?? 0) * 12}px`,
                }}
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
                      Раздел
                    </span>
                    <p className="font-semibold">{section.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {sectionPath.get(section.id)}
                  </p>
                  {section.description ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {section.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <a
                    className="rounded-full bg-slate-100 px-3 py-1 text-slate-900"
                    href={`/tests/create?subjectId=${data.subject.id}&sectionId=${section.id}`}
                  >
                    Тест по разделу
                  </a>
                  <details className="relative">
                    <summary className="cursor-pointer rounded-full border border-slate-700 px-3 py-1">
                      ⋯
                    </summary>
                    <div className="absolute right-0 mt-2 grid w-40 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs shadow-xl">
                      <button
                        className="rounded-lg border border-slate-800 px-3 py-1 text-left"
                        onClick={() => moveSection(section.id, "up")}
                        disabled={index === 0}
                      >
                        Move up
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 px-3 py-1 text-left"
                        onClick={() => moveSection(section.id, "down")}
                        disabled={index === sortedSections.length - 1}
                      >
                        Move down
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 px-3 py-1 text-left"
                        onClick={() => renameSection(section.id)}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 px-3 py-1 text-left text-red-200"
                        onClick={() => deleteSection(section.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
