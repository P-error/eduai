"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type PromptTemplate = {
  id: string;
  key: string;
  version: number;
  template: string;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
};

export default function PromptTemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadTemplates(key?: string) {
    setLoading(true);
    setError(null);
    const url = key ? `/api/admin/prompt-templates?key=${key}` : "/api/admin/prompt-templates";
    const response = await authFetch(url);
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      setError(json?.error?.message ?? "Failed to load templates.");
      setLoading(false);
      return;
    }
    setTemplates(json.data);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const keys = useMemo(() => {
    return Array.from(new Set(templates.map((template) => template.key))).sort();
  }, [templates]);

  const versions = useMemo(() => {
    return templates
      .filter((template) => template.key === selectedKey)
      .sort((a, b) => b.version - a.version);
  }, [templates, selectedKey]);

  useEffect(() => {
    if (selectedKey && versions.length > 0) {
      const active = versions.find((template) => template.isActive) ?? versions[0];
      const timer = window.setTimeout(() => {
        setSelectedId(active.id);
        setContent(active.template);
        setNotes(active.notes ?? "");
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [selectedKey, versions]);

  const selected = versions.find((template) => template.id === selectedId);

  async function saveTemplate() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    const response = await authFetch(`/api/admin/prompt-templates/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, notes }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      setError(json?.error?.message ?? "Failed to update template.");
      setSaving(false);
      return;
    }
    await loadTemplates(selectedKey);
    setMessage("Template updated.");
    setSaving(false);
  }

  async function duplicateTemplate() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    const response = await authFetch("/api/admin/prompt-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: selected.key,
        baseId: selected.id,
        content,
        notes,
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      setError(json?.error?.message ?? "Failed to create new version.");
      setSaving(false);
      return;
    }
    await loadTemplates(selected.key);
    setMessage("New version created.");
    setSaving(false);
  }

  async function activateTemplate() {
    if (!selected) return;
    if (!window.confirm("Activate this version? It will affect future generations.")) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await authFetch(
      `/api/admin/prompt-templates/${selected.id}/activate`,
      { method: "POST" },
    );
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      setError(json?.error?.message ?? "Failed to activate template.");
      setSaving(false);
      return;
    }
    await loadTemplates(selected.key);
    setMessage("Active version updated.");
    setSaving(false);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Prompt templates</h2>
        <p className="mt-2 text-sm text-slate-300">
          Manage prompt versions. Activate a version to apply it to new generations.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Keys</h3>
          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Loading...</p>
          ) : (
            <div className="mt-4 grid gap-2 text-sm">
              {keys.map((key) => {
                const active = templates.find(
                  (template) => template.key === key && template.isActive,
                );
                return (
                  <button
                    key={key}
                    className={`rounded-xl border px-3 py-2 text-left ${
                      selectedKey === key
                        ? "border-slate-500 bg-slate-950"
                        : "border-slate-800 bg-slate-900"
                    }`}
                    onClick={() => {
                      setSelectedKey(key);
                      loadTemplates(key);
                    }}
                  >
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{key}</span>
                      <span>v{active?.version ?? "-"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Versions</h3>
          {selectedKey ? (
            <>
              <div className="mt-4 grid gap-2 text-sm">
                {versions.map((template) => (
                  <button
                    key={template.id}
                    className={`rounded-xl border px-3 py-2 text-left ${
                      selectedId === template.id
                        ? "border-slate-500 bg-slate-950"
                        : "border-slate-800 bg-slate-900"
                    }`}
                    onClick={() => {
                      setSelectedId(template.id);
                      setContent(template.template);
                      setNotes(template.notes ?? "");
                    }}
                  >
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>v{template.version}</span>
                      <span>{template.isActive ? "Active" : "Inactive"}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Updated {new Date(template.updatedAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>

              {selected ? (
                <div className="mt-6 grid gap-3 text-sm">
                  <label className="grid gap-2">
                    Content
                    <textarea
                      rows={10}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2">
                    Notes
                    <textarea
                      rows={2}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
                      type="button"
                      onClick={saveTemplate}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="rounded-full border border-slate-700 px-4 py-2"
                      type="button"
                      onClick={duplicateTemplate}
                      disabled={saving}
                    >
                      Duplicate as new version
                    </button>
                    <button
                      className="rounded-full border border-slate-700 px-4 py-2"
                      type="button"
                      onClick={activateTemplate}
                      disabled={saving || selected.isActive}
                    >
                      Activate
                    </button>
                  </div>
                  {message ? (
                    <p className="text-xs text-slate-400">{message}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Select a key.</p>
          )}
        </div>
      </div>
    </section>
  );
}
