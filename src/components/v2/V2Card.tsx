import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

export default function V2Card<T extends ElementType = "div">({
  as,
  children,
  className,
  interactive = false,
  tone = "default",
  ...props
}: {
  as?: T;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  tone?: "default" | "soft" | "success" | "warning" | "danger";
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">) {
  const Component = as ?? "div";

  return (
    <Component
      className={cx(
        "v2-card",
        tone !== "default" && `v2-card-${tone}`,
        interactive && "v2-card-interactive",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
