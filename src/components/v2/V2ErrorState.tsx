import type { ReactNode } from "react";
import V2Card from "@/components/v2/V2Card";

export default function V2ErrorState({
  children,
  title = "Не удалось выполнить действие",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <V2Card tone="danger" role="alert" className="v2-error-state">
      <p className="v2-eyebrow">Ошибка</p>
      <h3 className="v2-title-sm mt-2">{title}</h3>
      <div className="v2-copy mt-2">{children}</div>
    </V2Card>
  );
}
