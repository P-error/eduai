"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { TAGS_BY_AXIS, TAG_AXES } from "@/lib/tags";

type PreferencesPayload = {
  declared: Record<string, string>;
  effective: Record<string, string>;
};

export default function ProfilePage() {
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [effective, setEffective] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      const response = await authFetch("/api/users/me/preferences");
      if (!response.ok) return;
      const json = (await response.json()) as PreferencesPayload;
      if (active) {
        setDeclared(json.declared ?? {});
        setEffective(json.effective ?? {});
        setLoading(false);
      }
    }
    loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  const hasEffective = Object.keys(effective).length > 0;
  const differsFromEffective = useMemo(() => {
    if (!hasEffective) return false;
    return TAG_AXES.some((axis) => declared[axis] !== effective[axis]);
  }, [declared, effective, hasEffective]);

  async function savePreferences() {
    setSaving(true);
    setMessage(null);
    const response = await authFetch("/api/users/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(declared),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setMessage(json.message ?? "Failed to save preferences.");
      setSaving(false);
      return;
    }
    setMessage("Preferences saved.");
    setSaving(false);
  }

  async function applyEffective() {
    setSaving(true);
    setMessage(null);
    const response = await authFetch("/api/users/me/preferences/apply", {
      method: "POST",
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setMessage(json.message ?? "No effective preferences yet.");
      setSaving(false);
      return;
    }
    const json = (await response.json()) as { declared: Record<string, string> };
    setDeclared(json.declared ?? {});
    setMessage("Effective preferences applied.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Profile preferences</h2>
        <p className="mt-2 text-sm text-slate-300">
          Set your declared learning preferences. Effective preferences are
          learned from test performance.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Declared preferences</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {TAG_AXES.map((axis) => (
            <label key={axis} className="grid gap-2 text-sm">
              <span className="text-slate-300">{axis}</span>
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
                value={declared[axis] ?? ""}
                onChange={(event) =>
                  setDeclared((prev) => ({
                    ...prev,
                    [axis]: event.target.value,
                  }))
                }
              >
                <option value="">Unset</option>
                {TAGS_BY_AXIS[axis].map((tag) => (
                  <option key={tag.key} value={tag.key}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            onClick={savePreferences}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save preferences"}
          </button>
          <button
            className="rounded-full border border-slate-700 px-4 py-2"
            onClick={applyEffective}
            disabled={!hasEffective || !differsFromEffective || saving}
          >
            Apply effective preferences
          </button>
          {message ? <span className="text-sm text-slate-300">{message}</span> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Effective preferences</h3>
        <div className="mt-4 grid gap-2 text-sm text-slate-300">
          {TAG_AXES.map((axis) => (
            <div key={axis} className="flex justify-between">
              <span>{axis}</span>
              <span>{effective[axis] ?? "-"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
