import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type PillTone = "primary" | "success" | "warning" | "danger" | "muted";

type PillProps = {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
};

export default function Pill({
  children,
  tone = "muted",
  className,
}: PillProps) {
  return (
    <span className={cx("sys-pill", `sys-pill--${tone}`, className)}>{children}</span>
  );
}
