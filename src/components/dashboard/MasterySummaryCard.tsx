"use client";

import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { getUiDateLocale } from "@/lib/ui-locale";

type MasterySummaryCardProps = {
  mastery: number | null;
  confidence: number;
  evidenceLabel: string;
  lastActivityAt: string | null;
  className?: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidenceLabel(value: number, labels: { low: string; medium: string; high: string }) {
  const normalized = clamp01(value);
  if (normalized < 0.34) return labels.low;
  if (normalized < 0.67) return labels.medium;
  return labels.high;
}

function confidenceTone(value: number): "muted" | "primary" | "success" {
  const normalized = clamp01(value);
  if (normalized < 0.34) return "muted";
  if (normalized < 0.67) return "primary";
  return "success";
}

function formatPercent(value: number | null, emptyText: string) {
  if (value == null) return emptyText;
  return `${(clamp01(value) * 100).toFixed(0)}%`;
}

function formatDate(value: string | null, emptyText: string, locale: "en" | "ru") {
  if (!value) return emptyText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyText;
  return date.toLocaleString(getUiDateLocale(locale));
}

export default function MasterySummaryCard({
  mastery,
  confidence,
  evidenceLabel,
  lastActivityAt,
  className,
}: MasterySummaryCardProps) {
  const { locale, messages } = useUiLocale();
  return (
    <Card interactive className={cx("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          {messages.dashboard.mastery.title}
        </p>
        <Pill tone={confidenceTone(confidence)}>
          {confidenceLabel(confidence, messages.common)} {clamp01(confidence).toFixed(2)}
        </Pill>
      </div>

      <div className="mt-3">
        <Stat
          label={messages.dashboard.mastery.estimatedMastery}
          value={formatPercent(mastery, messages.dashboard.mastery.noData)}
          helper={`${messages.dashboard.mastery.evidence}: ${evidenceLabel}`}
          valueClassName="text-4xl"
        />
      </div>

      <div className="mt-4 radius-md border border-border bg-surface2/80 px-3 py-2 text-sm text-muted">
        <span className="text-muted">{messages.dashboard.mastery.lastActivity}:</span>{" "}
        {formatDate(lastActivityAt, messages.dashboard.mastery.noActivity, locale)}
      </div>
    </Card>
  );
}
