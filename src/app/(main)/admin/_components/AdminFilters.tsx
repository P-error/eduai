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
    <div className="ui-panel ui-panel-tight">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="ui-label text-xs">
          Window
          <select
            className="ui-select text-sm"
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
        <label className="ui-label text-xs">
          Policy mode
          <select
            className="ui-select text-sm"
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
        <label className="ui-label text-xs">
          Subject
          <select
            className="ui-select text-sm"
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
        <label className="ui-copy-sm flex items-end gap-2">
          <input
            className="ui-check"
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
