import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

type CardVariant = "surface" | "surface2" | "hero" | "danger";

type CardProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  variant?: CardVariant;
};

const VARIANT_CLASS: Record<CardVariant, string> = {
  surface: "",
  surface2: "sys-card--surface2",
  hero: "sys-card--hero",
  danger: "sys-card--danger",
};

export default function Card<T extends ElementType = "div">({
  as,
  children,
  className,
  interactive = false,
  variant = "surface",
  ...rest
}: CardProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof CardProps<T>>) {
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      className={cx(
        "sys-card",
        VARIANT_CLASS[variant],
        interactive && "sys-card--interactive",
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
