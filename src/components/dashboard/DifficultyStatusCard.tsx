"use client";

import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import { cx } from "@/lib/cx";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { formatDifficultyLabel, getUiDateLocale } from "@/lib/ui-locale";

type DifficultyStatusCardProps = {
  currentDifficulty: string | null;
  recentChange: {
    changed: boolean;
    reason: string | null;
    at: string | null;
  } | null;
  className?: string;
};

function difficultyTone(value: string | null): "muted" | "success" | "warning" {
  if (value === "easy") return "success";
  if (value === "hard") return "warning";
  return "muted";
}

function humanDifficulty(value: string | null) {
  return value;
}

function humanReason(
  value: string | null,
  messages: ReturnType<typeof useUiLocale>["messages"],
) {
  if (!value) return messages.dashboard.difficulty.reasonMissing;
  if (value === "INCREASE") return messages.dashboard.difficulty.reasonIncrease;
  if (value === "DECREASE") return messages.dashboard.difficulty.reasonDecrease;
  if (value === "WITHIN_BAND") return messages.dashboard.difficulty.reasonWithinBand;
  if (value === "COOLDOWN") return messages.dashboard.difficulty.reasonCooldown;
  if (value === "LOW_N") return messages.dashboard.difficulty.reasonLowN;
  return messages.dashboard.difficulty.reasonFallback.replace("{reason}", value);
}

function formatDate(value: string | null, locale: "en" | "ru") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(getUiDateLocale(locale));
}

export default function DifficultyStatusCard({
  currentDifficulty,
  recentChange,
  className,
}: DifficultyStatusCardProps) {
  const { locale, messages } = useUiLocale();
  const changedAt = formatDate(recentChange?.at ?? null, locale);

  return (
    <Card interactive className={cx("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          {messages.dashboard.difficulty.title}
        </p>
        <Pill tone={difficultyTone(currentDifficulty)}>
          {formatDifficultyLabel(humanDifficulty(currentDifficulty), locale)}
        </Pill>
      </div>

      <div className="mt-4 radius-md border border-border bg-surface2/80 px-3 py-2 text-sm text-text">
        {messages.dashboard.difficulty.currentTarget}:{" "}
        {formatDifficultyLabel(humanDifficulty(currentDifficulty), locale)}
      </div>

      <div className="mt-3 text-sm text-muted">
        {recentChange?.changed ? (
          <p>
            {messages.dashboard.difficulty.recentlyChanged}{" "}
            {humanReason(recentChange.reason, messages)}
            {changedAt ? ` (${changedAt})` : ""}
          </p>
        ) : (
          <p>{messages.dashboard.difficulty.noRecentChange}</p>
        )}
      </div>
    </Card>
  );
}
