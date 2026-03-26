"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { authFetch } from "@/lib/client-auth";

type Collection = {
  id: string;
  name: string;
  parentId: string | null;
};

type Subject = {
  id: string;
  title: string;
  description: string | null;
  collectionId: string | null;
};

export default function CollectionDetailsPage() {
  const params = useParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [children, setChildren] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadCollection() {
      const [collectionsRes, subjectsRes] = await Promise.all([
        authFetch("/api/collections"),
        authFetch("/api/subjects"),
      ]);

      if (!collectionsRes.ok || !subjectsRes.ok) {
        if (active) setError("Failed to load collection.");
        return;
      }

      const [collectionsJson, subjectsJson] = await Promise.all([
        collectionsRes.json(),
        subjectsRes.json(),
      ]);

      if (!active) return;
      const allCollections = collectionsJson as Collection[];
      const allSubjects = subjectsJson as Subject[];

      const current = allCollections.find((entry) => entry.id === params.id);
      if (!current) {
        setError("Collection not found.");
        return;
      }

      setCollection(current);
      setSubjects(allSubjects.filter((subject) => subject.collectionId === params.id));
      setChildren(allCollections.filter((entry) => entry.parentId === params.id));
    }

    loadCollection();
    return () => {
      active = false;
    };
  }, [params.id]);

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-slate-200">{error}</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading collection...</p>
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">{collection.name}</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="rounded-full border border-slate-700 px-4 py-2" href="/subjects">
            Back to subjects
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Subjects in this collection</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {subjects.length === 0 ? (
            <p className="text-slate-500">No subjects yet.</p>
          ) : (
            subjects.map((subject) => (
              <div
                key={subject.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <Link className="underline" href={`/subjects/${subject.id}`}>
                  {subject.title}
                </Link>
                <div className="flex gap-2 text-xs">
                  <Link
                    className="rounded-full border border-slate-700 px-3 py-1"
                    href={`/tests/create?subjectId=${subject.id}`}
                  >
                    Start test
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Sub-collections</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {children.length === 0 ? (
            <p className="text-slate-500">No sub-collections.</p>
          ) : (
            children.map((child) => (
              <Link
                key={child.id}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 underline"
                href={`/collections/${child.id}`}
              >
                {child.name}
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
