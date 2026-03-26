import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type StatProps = {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  className?: string;
  valueClassName?: string;
};

export default function Stat({
  label,
  value,
  helper,
  className,
  valueClassName,
}: StatProps) {
  return (
    <div className={cx("sys-stat", className)}>
      <p className="sys-stat__label">{label}</p>
      <p className={cx("sys-stat__value", valueClassName)}>{value}</p>
      {helper ? <p className="sys-stat__helper">{helper}</p> : null}
    </div>
  );
}
