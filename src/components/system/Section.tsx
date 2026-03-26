import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type SectionProps = {
  children: ReactNode;
  className?: string;
};

export default function Section({ children, className }: SectionProps) {
  return <section className={cx("section-stack", className)}>{children}</section>;
}
