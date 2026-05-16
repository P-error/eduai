import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export function v2ButtonClass({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
} = {}) {
  return cx(
    "v2-button",
    `v2-button-${variant}`,
    size !== "md" && `v2-button-${size}`,
    className,
  );
}

export default function V2Button({
  children,
  className,
  size = "md",
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={v2ButtonClass({ className, size, variant })}
      {...props}
    >
      {children}
    </button>
  );
}
