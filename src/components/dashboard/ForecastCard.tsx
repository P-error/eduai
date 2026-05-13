"use client";

import Link from "next/link";
import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";

type ForecastCell = {
  value: number | null;
  confidence: number;
  basis?: string | null;
};

type ForecastCardProps = {
  expectedAccuracy: ForecastCell | null;
  expectedDurationMs: ForecastCell | null;
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

function formatDurationRange(
  value: number | null,
  confidence: number,
  emptyText: string,
  unit: string,
) {
  if (value == null) return emptyText;
  const normalizedConfidence = clamp01(confidence);
  const spread = Math.max(0.12, 0.38 - normalizedConfidence * 0.25);
  const low = Math.max(0, Math.round((value * (1 - spread)) / 1000));
  const high = Math.max(low, Math.round((value * (1 + spread)) / 1000));
  return `${low}-${high} ${unit}`;
}

export default function ForecastCard({
  expectedAccuracy,
  expectedDurationMs,
  className,
}: ForecastCardProps) {
  const { messages } = useUiLocale();
  const confidence =
    expectedAccuracy?.confidence ?? expectedDurationMs?.confidence ?? 0;

  return (
    <Card variant="hero" interactive className={cx("p-6 md:p-8", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {messages.dashboard.forecast.eyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
            {messages.dashboard.forecast.title}
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {messages.dashboard.forecast.body}
          </p>
        </div>
        <Pill tone={confidenceTone(confidence)}>
          {confidenceLabel(confidence, messages.common)} ({clamp01(confidence).toFixed(2)})
        </Pill>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="radius-md border border-border bg-surface2/80 p-4">
          <Stat
            label={messages.dashboard.forecast.expectedAccuracy}
            value={formatPercent(expectedAccuracy?.value ?? null, messages.dashboard.forecast.noData)}
            helper={expectedAccuracy?.basis ?? messages.dashboard.forecast.accuracyHelper}
            valueClassName="text-3xl"
          />
        </div>
        <div className="radius-md border border-border bg-surface2/80 p-4">
          <Stat
            label={messages.dashboard.forecast.expectedDuration}
            value={formatDurationRange(
              expectedDurationMs?.value ?? null,
              confidence,
              messages.dashboard.forecast.noData,
              messages.common.sec,
            )}
            helper={expectedDurationMs?.basis ?? messages.dashboard.forecast.rangeHelper}
            valueClassName="text-3xl"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="sys-button-primary" href="/learn">
          {messages.dashboard.forecast.startEpisode}
        </Link>
        <Link className="sys-button-secondary" href="/practice">
          {messages.common.openPractice}
        </Link>
      </div>
    </Card>
  );
}
