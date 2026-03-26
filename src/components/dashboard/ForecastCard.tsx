import Link from "next/link";
import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";

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

function confidenceLabel(value: number) {
  const normalized = clamp01(value);
  if (normalized < 0.34) return "Low";
  if (normalized < 0.67) return "Medium";
  return "High";
}

function confidenceTone(value: number): "muted" | "primary" | "success" {
  const normalized = clamp01(value);
  if (normalized < 0.34) return "muted";
  if (normalized < 0.67) return "primary";
  return "success";
}

function formatPercent(value: number | null) {
  if (value == null) return "No data yet";
  return `${(clamp01(value) * 100).toFixed(0)}%`;
}

function formatDurationRange(value: number | null, confidence: number) {
  if (value == null) return "No data yet";
  const normalizedConfidence = clamp01(confidence);
  const spread = Math.max(0.12, 0.38 - normalizedConfidence * 0.25);
  const low = Math.max(0, Math.round((value * (1 - spread)) / 1000));
  const high = Math.max(low, Math.round((value * (1 + spread)) / 1000));
  return `${low}-${high} sec`;
}

export default function ForecastCard({
  expectedAccuracy,
  expectedDurationMs,
  className,
}: ForecastCardProps) {
  const confidence =
    expectedAccuracy?.confidence ?? expectedDurationMs?.confidence ?? 0;

  return (
    <Card variant="hero" interactive className={cx("p-6 md:p-8", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Next test forecast</p>
          <h3 className="mt-2 text-2xl font-semibold text-text md:text-3xl">
            Forecast before you press start
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Based on your recent attempts and answered questions.
          </p>
        </div>
        <Pill tone={confidenceTone(confidence)}>
          {confidenceLabel(confidence)} ({clamp01(confidence).toFixed(2)})
        </Pill>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="radius-md border border-border bg-surface2/80 p-4">
          <Stat
            label="Expected accuracy"
            value={formatPercent(expectedAccuracy?.value ?? null)}
            helper={expectedAccuracy?.basis ?? "heuristic proxy"}
            valueClassName="text-3xl"
          />
        </div>
        <div className="radius-md border border-border bg-surface2/80 p-4">
          <Stat
            label="Expected duration"
            value={formatDurationRange(expectedDurationMs?.value ?? null, confidence)}
            helper={expectedDurationMs?.basis ?? "range widens when confidence is low"}
            valueClassName="text-3xl"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="sys-button-primary" href="/practice">
          Start practice
        </Link>
        <Link className="sys-button-secondary" href="/insights">
          Review insight context
        </Link>
      </div>
    </Card>
  );
}
