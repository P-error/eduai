"use client";

import Card from "@/components/system/Card";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";
import type { DashboardAttempt } from "./types";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";

type ConsistencyPanelProps = {
  attempts: DashboardAttempt[];
  className?: string;
};

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number | null, emptyText: string) {
  if (value == null) return emptyText;
  return `${(value * 100).toFixed(1)}%`;
}

function formatSeconds(valueMs: number | null, emptyText: string, unit: string) {
  if (valueMs == null) return emptyText;
  return `${Math.round(valueMs / 1000)} ${unit}`;
}

export default function ConsistencyPanel({ attempts, className }: ConsistencyPanelProps) {
  const { messages } = useUiLocale();
  const lastTen = attempts.slice(0, 10);

  const accuracyDiffs = lastTen
    .map((attempt) => {
      if (attempt.predictedAccuracy == null || attempt.actualAccuracy == null) return null;
      return Math.abs(attempt.predictedAccuracy - attempt.actualAccuracy);
    })
    .filter((value): value is number => value != null);

  const durationDiffs = lastTen
    .map((attempt) => {
      if (
        attempt.predictedTotalDurationMs == null ||
        attempt.actualTotalDurationMs == null
      ) {
        return null;
      }
      return Math.abs(
        attempt.predictedTotalDurationMs - attempt.actualTotalDurationMs,
      );
    })
    .filter((value): value is number => value != null);

  const accuracyMae = average(accuracyDiffs);
  const durationMaeMs = average(durationDiffs);

  return (
    <Card interactive className={cx("p-5", className)}>
      <p className="text-xs uppercase tracking-[0.2em] text-muted">
        {messages.dashboard.consistency.title}
      </p>
      <div className="mt-3 grid gap-3 text-sm">
        <div className="radius-md border border-border bg-surface2/80 px-3 py-3">
          <Stat
            label={messages.dashboard.consistency.meanAbsoluteError}
            value={formatPercent(accuracyMae, messages.dashboard.forecast.noData)}
            helper={`${messages.dashboard.consistency.samples}: ${accuracyDiffs.length}`}
            valueClassName="text-2xl"
          />
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">{messages.dashboard.consistency.whatIsThis}</summary>
            {messages.dashboard.consistency.accuracyHelp}
          </details>
        </div>

        <div className="radius-md border border-border bg-surface2/80 px-3 py-3">
          <Stat
            label={messages.dashboard.consistency.durationDeviation}
            value={formatSeconds(
              durationMaeMs,
              messages.dashboard.forecast.noData,
              messages.common.sec,
            )}
            helper={`${messages.dashboard.consistency.samples}: ${durationDiffs.length}`}
            valueClassName="text-2xl"
          />
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">{messages.dashboard.consistency.whatIsThis}</summary>
            {messages.dashboard.consistency.durationHelp}
          </details>
        </div>
      </div>
    </Card>
  );
}
