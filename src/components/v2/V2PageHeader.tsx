import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export default function V2PageHeader({
  actions,
  children,
  eyebrow,
  title,
  className,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  eyebrow?: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={cx("v2-page-header", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="v2-eyebrow">{eyebrow}</p> : null}
        <h2 className="v2-title-lg mt-2">{title}</h2>
        {children ? <div className="v2-copy mt-3 max-w-3xl">{children}</div> : null}
      </div>
      {actions ? <div className="v2-page-header-actions">{actions}</div> : null}
    </div>
  );
}
