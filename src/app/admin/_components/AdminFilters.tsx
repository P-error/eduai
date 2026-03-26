"use client";

import { useMemo } from "react";

export type AdminFilterValue = {
  window: "7d" | "30d" | "all";
  policyMode:
    | "any"
    | "personalization_on"
    | "personalization_off"
    | "manual_delivery_override";
  subjectId: string;
  includeExcluded: boolean;
};

export default function AdminFilters({
  value,
  subjects,
  onChange,
}: {
  value: AdminFilterValue;
  subjects: Array<{ id: string; title: string }>;
  onChange: (value: AdminFilterValue) => void;
}) {
  const subjectOptions = useMemo(
    () => [{ id: "", title: "All subjects" }, ...subjects],
    [subjects],
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-slate-300">
          Window
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={value.window}
            onChange={(event) =>
              onChange({
                ...value,
                window: event.target.value as AdminFilterValue["window"],
              })
            }
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="all">all</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-300">
          Policy mode
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={value.policyMode}
            onChange={(event) =>
              onChange({
                ...value,
                policyMode: event.target.value as AdminFilterValue["policyMode"],
              })
            }
          >
            <option value="any">any</option>
            <option value="personalization_on">personalized</option>
            <option value="personalization_off">standard</option>
            <option value="manual_delivery_override">manual override</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-300">
          Subject
          <select
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={value.subjectId}
            onChange={(event) => onChange({ ...value, subjectId: event.target.value })}
          >
            {subjectOptions.map((subject) => (
              <option key={subject.id || "all"} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={value.includeExcluded}
            onChange={(event) =>
              onChange({ ...value, includeExcluded: event.target.checked })
            }
          />
          Include excluded samples
        </label>
      </div>
    </div>
  );
}
