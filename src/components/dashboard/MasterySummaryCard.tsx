import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import Stat from "@/components/system/Stat";
import { cx } from "@/lib/cx";

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

function formatDate(value: string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity yet";
  return date.toLocaleString();
}

export default function MasterySummaryCard({
  mastery,
  confidence,
  evidenceLabel,
  lastActivityAt,
  className,
}: MasterySummaryCardProps) {
  return (
    <Card interactive className={cx("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Mastery summary</p>
        <Pill tone={confidenceTone(confidence)}>
          {confidenceLabel(confidence)} {clamp01(confidence).toFixed(2)}
        </Pill>
      </div>

      <div className="mt-3">
        <Stat
          label="Estimated mastery"
          value={formatPercent(mastery)}
          helper={`Evidence: ${evidenceLabel}`}
          valueClassName="text-4xl"
        />
      </div>

      <div className="mt-4 radius-md border border-border bg-surface2/80 px-3 py-2 text-sm text-muted">
        <span className="text-muted">Last activity:</span> {formatDate(lastActivityAt)}
      </div>
    </Card>
  );
}
