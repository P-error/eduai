import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export default function PageShell({ children, className }: PageShellProps) {
  return <div className={cx("page-shell", className)}>{children}</div>;
}
