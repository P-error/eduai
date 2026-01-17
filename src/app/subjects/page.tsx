"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

type Collection = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type Subject = {
  id: string;
  title: string;
  description: string | null;
  collectionId: string | null;
  archivedAt: string | null;
};

export default function SubjectsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collectionName, setCollectionName] = useState("");
  const [collectionParentId, setCollectionParentId] = useState("");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [subjectDescription, setSubjectDescription] = useState("");
  const [subjectCollectionId, setSubjectCollectionId] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    const [collectionsRes, subjectsRes] = await Promise.all([
      authFetch("/api/collections"),
      authFetch("/api/subjects"),
    ]);

    if (!collectionsRes.ok || !subjectsRes.ok) {
      setError("Failed to load subjects.");
      setLoading(false);
      return;
    }

    const [collectionsJson, subjectsJson] = await Promise.all([
      collectionsRes.json(),
      subjectsRes.json(),
    ]);

    setCollections(collectionsJson);
    setSubjects(subjectsJson);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const collectionsByParent = useMemo(() => {
    const map = new Map<string | null, Collection[]>();
    for (const collection of collections) {
      const key = collection.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(collection);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [collections]);

  const subjectsByCollection = useMemo(() => {
    const map = new Map<string | null, Subject[]>();
    for (const subject of subjects) {
      const key = subject.collectionId ?? null;
      const list = map.get(key) ?? [];
      list.push(subject);
      map.set(key, list);
    }
    return map;
  }, [subjects]);

  async function createCollection(event: React.FormEvent) {
    event.preventDefault();
    setCreatingCollection(true);
    setError(null);
    try {
      const response = await authFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: collectionName,
          parentId: collectionParentId || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setError(json?.error?.message ?? "Failed to create collection.");
        return;
      }
      setCollectionName("");
      setCollectionParentId("");
      await loadData();
    } finally {
      setCreatingCollection(false);
    }
  }

  async function createSubject(event: React.FormEvent) {
    event.preventDefault();
    setCreatingSubject(true);
    setError(null);
    try {
      const response = await authFetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subjectTitle,
          description: subjectDescription || null,
          collectionId: subjectCollectionId || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setError(json?.error?.message ?? "Failed to create subject.");
        return;
      }
      setSubjectTitle("");
      setSubjectDescription("");
      setSubjectCollectionId("");
      await loadData();
    } finally {
      setCreatingSubject(false);
    }
  }

  async function renameCollection(id: string) {
    const name = window.prompt("New collection name");
    if (!name) return;
    await authFetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await loadData();
  }

  async function deleteCollection(id: string) {
    if (!window.confirm("Delete collection?")) return;
    await authFetch(`/api/collections/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function renameSubject(id: string) {
    const title = window.prompt("New subject title");
    if (!title) return;
    await authFetch(`/api/subjects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await loadData();
  }

  async function archiveSubject(id: string) {
    if (!window.confirm("Archive subject?")) return;
    await authFetch(`/api/subjects/${id}`, { method: "DELETE" });
    await loadData();
  }

  function renderCollectionTree(parentId: string | null, depth = 0): JSX.Element[] {
    const list = collectionsByParent.get(parentId) ?? [];
      return list.flatMap((collection) => {
        const isDefault = collection.name === DEFAULT_COLLECTION_NAME && collection.parentId === null;
        const subjectList = subjectsByCollection.get(collection.id) ?? [];
        return [
          <div
            key={collection.id}
            className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm"
            style={{ marginLeft: depth * 12 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase text-slate-500">Collection</p>
                <a
                  className="text-base font-semibold underline"
                  href={`/collections/${collection.id}`}
                >
                  {collection.name}
                </a>
              </div>
              <div className="flex gap-2 text-xs">
                {isDefault ? (
                  <span className="text-slate-500">Default</span>
                ) : (
                  <>
                    <button
                      className="rounded-full border border-slate-700 px-3 py-1"
                      onClick={() => renameCollection(collection.id)}
                    >
                      Rename
                    </button>
                    <button
                      className="rounded-full border border-slate-700 px-3 py-1"
                      onClick={() => deleteCollection(collection.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          {subjectList.length > 0 ? (
            <div className="mt-3 grid gap-2 text-xs text-slate-300">
              {subjectList.map((subject) => (
                <div
                  key={subject.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2"
                >
                  <div>
                    <p className="text-xs uppercase text-slate-500">Subject</p>
                    <a
                      className="text-sm font-semibold underline"
                      href={`/subjects/${subject.id}`}
                    >
                      {subject.title}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <a
                      className="rounded-full border border-slate-700 px-3 py-1"
                      href={`/tests/create?subjectId=${subject.id}`}
                    >
                      Start test
                    </a>
                    <button
                      className="rounded-full border border-slate-700 px-3 py-1"
                      onClick={() => renameSubject(subject.id)}
                    >
                      Rename
                    </button>
                    <button
                      className="rounded-full border border-slate-700 px-3 py-1"
                      onClick={() => archiveSubject(subject.id)}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>,
        ...renderCollectionTree(collection.id, depth + 1),
      ];
    });
  }

  const unassignedSubjects = subjectsByCollection.get(null) ?? [];

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Subjects</h2>
        <p className="mt-2 text-sm text-slate-300">
          Organize your subjects in collections. Tests and chat can reference
          only your own subjects.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Subjects in the “{DEFAULT_COLLECTION_NAME}” collection are excluded
          from statistics.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <p>Loading...</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={createCollection}
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <h3 className="text-lg font-semibold">Create collection</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <label className="grid gap-2">
              Name
              <input
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2">
              Parent
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={collectionParentId}
                onChange={(event) => setCollectionParentId(event.target.value)}
              >
                <option value="">No parent</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
            disabled={creatingCollection}
          >
            {creatingCollection ? "Creating..." : "Create collection"}
          </button>
        </form>

        <form
          onSubmit={createSubject}
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <h3 className="text-lg font-semibold">Create subject</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <label className="grid gap-2">
              Title
              <input
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={subjectTitle}
                onChange={(event) => setSubjectTitle(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2">
              Description
              <textarea
                rows={3}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={subjectDescription}
                onChange={(event) => setSubjectDescription(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              Collection
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={subjectCollectionId}
                onChange={(event) => setSubjectCollectionId(event.target.value)}
              >
                <option value="">No collection</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
            disabled={creatingSubject}
          >
            {creatingSubject ? "Creating..." : "Create subject"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Collections & subjects</h3>
        <div className="mt-4 grid gap-3">
          {renderCollectionTree(null)}
          {unassignedSubjects.length > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
              <p className="text-xs uppercase text-slate-500">
                Unassigned subjects
              </p>
              <div className="mt-2 grid gap-2">
                {unassignedSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2"
                  >
                    <a className="underline" href={`/subjects/${subject.id}`}>
                      {subject.title}
                    </a>
                    <div className="flex gap-2 text-xs">
                      <a
                        className="rounded-full border border-slate-700 px-3 py-1"
                        href={`/tests/create?subjectId=${subject.id}`}
                      >
                        Start test
                      </a>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1"
                        onClick={() => renameSubject(subject.id)}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1"
                        onClick={() => archiveSubject(subject.id)}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
