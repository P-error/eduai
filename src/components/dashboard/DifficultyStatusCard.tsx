import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import { cx } from "@/lib/cx";

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
  if (value === "easy" || value === "medium" || value === "hard") return value;
  return "Unknown";
}

function humanReason(value: string | null) {
  if (!value) return "Reason was not logged.";
  if (value === "INCREASE") return "Recent accuracy was above target band.";
  if (value === "DECREASE") return "Recent accuracy was below target band.";
  if (value === "WITHIN_BAND") return "Recent accuracy was inside target band.";
  if (value === "COOLDOWN") return "Difficulty cooldown prevented immediate change.";
  if (value === "LOW_N") return "Not enough clean attempts yet.";
  return `Policy reason: ${value}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function DifficultyStatusCard({
  currentDifficulty,
  recentChange,
  className,
}: DifficultyStatusCardProps) {
  const changedAt = formatDate(recentChange?.at ?? null);

  return (
    <Card interactive className={cx("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Difficulty status</p>
        <Pill tone={difficultyTone(currentDifficulty)}>
          {humanDifficulty(currentDifficulty)}
        </Pill>
      </div>

      <div className="mt-4 radius-md border border-border bg-surface2/80 px-3 py-2 text-sm text-text">
        Current target: {humanDifficulty(currentDifficulty)}
      </div>

      <div className="mt-3 text-sm text-muted">
        {recentChange?.changed ? (
          <p>
            Recently changed. {humanReason(recentChange.reason)}
            {changedAt ? ` (${changedAt})` : ""}
          </p>
        ) : (
          <p>No recent difficulty change inferred from stored attempts.</p>
        )}
      </div>
    </Card>
  );
}
