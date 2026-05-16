"use client";

import { cx } from "@/lib/cx";
import { useUiVersion } from "@/components/settings/UiVersionProvider";

export default function UiVersionToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { uiVersion, setUiVersion } = useUiVersion();

  return (
    <div
      className={cx(
        "ui-panel-soft inline-flex items-center rounded-full border border-slate-700 p-1",
        className,
      )}
      aria-label="UI version"
    >
      <button
        type="button"
        className={cx(
          "ui-segment",
          compact && "ui-segment-sm",
          uiVersion !== "classic" && "bg-transparent",
        )}
        data-active={uiVersion === "classic"}
        onClick={() => setUiVersion("classic")}
      >
        Classic UI
      </button>
      <button
        type="button"
        className={cx(
          "ui-segment",
          compact && "ui-segment-sm",
          uiVersion !== "v2" && "bg-transparent",
        )}
        data-active={uiVersion === "v2"}
        onClick={() => setUiVersion("v2")}
      >
        New UI
      </button>
    </div>
  );
}
