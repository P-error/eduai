"use client";

import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import type { DashboardAttempt } from "./types";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { getUiDateLocale } from "@/lib/ui-locale";

type TrendMiniChartProps = {
  attempts: DashboardAttempt[];
  className?: string;
};

const SVG_WIDTH = 360;
const SVG_HEIGHT = 160;
const PAD_X = 20;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatDateLabel(value: string, locale: "en" | "ru") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(getUiDateLocale(locale));
}

export default function TrendMiniChart({ attempts, className }: TrendMiniChartProps) {
  const { locale, messages } = useUiLocale();
  const points = [...attempts]
    .slice(0, 10)
    .reverse()
    .map((attempt) => ({
      label: formatDateLabel(attempt.createdAt, locale),
      actual: attempt.actualAccuracy,
      predicted: attempt.predictedAccuracy,
    }));

  if (points.length === 0) {
    return (
      <Card variant="surface2" className={className}>
        <div className="p-6">
          <h3 className="text-lg font-semibold">{messages.dashboard.trend.titleEmpty}</h3>
          <p className="mt-3 text-sm text-muted">
            {messages.dashboard.trend.noAttempts}
          </p>
        </div>
      </Card>
    );
  }

  const hasPredicted = points.some((point) => point.predicted != null);
  const plotWidth = SVG_WIDTH - PAD_X * 2;
  const plotHeight = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const xAt = (index: number) => PAD_X + step * index;
  const yAt = (value: number) => PAD_TOP + (1 - clamp01(value)) * plotHeight;

  function buildPath(values: Array<number | null>) {
    let path = "";
    let isDrawing = false;

    values.forEach((value, index) => {
      if (value == null) {
        isDrawing = false;
        return;
      }
      const x = xAt(index);
      const y = yAt(value);
      if (!isDrawing) {
        path += `M ${x} ${y}`;
        isDrawing = true;
      } else {
        path += ` L ${x} ${y}`;
      }
    });

    return path;
  }

  const actualPath = buildPath(points.map((point) => point.actual));
  const predictedPath = buildPath(points.map((point) => point.predicted));

  return (
    <Card variant="surface2" className={className}>
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{messages.dashboard.trend.title}</h3>
          <div className="flex items-center gap-2 text-xs">
            <Pill tone="muted">{messages.dashboard.trend.actual}</Pill>
            <Pill tone="primary">{messages.dashboard.trend.predicted}</Pill>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto radius-md border border-border bg-surface/80 p-2">
          <svg
            className="h-[160px] w-full min-w-[280px]"
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            role="img"
            aria-label={messages.dashboard.trend.ariaLabel}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = yAt(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_X}
                    x2={SVG_WIDTH - PAD_X}
                    y1={y}
                    y2={y}
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                  />
                  <text
                    x={4}
                    y={y + 4}
                    fill="hsl(var(--muted))"
                    fontSize="9"
                  >
                    {Math.round(tick * 100)}
                  </text>
                </g>
              );
            })}

            <path
              d={actualPath}
              fill="none"
              stroke="hsl(var(--text))"
              strokeWidth="2"
            />

            {hasPredicted ? (
              <path
                d={predictedPath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
            ) : null}

            {points.map((point, index) => {
              if (point.actual == null) return null;
              return (
                <circle
                  key={`${index}-${point.label}`}
                  cx={xAt(index)}
                  cy={yAt(point.actual)}
                  r="3"
                  fill="hsl(var(--text))"
                />
              );
            })}
          </svg>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{points[0]?.label ?? "-"}</span>
          <span>{points[points.length - 1]?.label ?? "-"}</span>
        </div>

        {!hasPredicted ? (
          <p className="mt-3 text-xs text-muted">
            {messages.dashboard.trend.predictedMissing}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
