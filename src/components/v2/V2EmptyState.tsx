import Link from "next/link";
import { v2ButtonClass } from "@/components/v2/V2Button";
import V2Card from "@/components/v2/V2Card";

export default function V2EmptyState({
  actionHref,
  actionLabel,
  body,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  body: string;
  title: string;
}) {
  return (
    <V2Card className="v2-empty-state">
      <h3 className="v2-title-md">{title}</h3>
      <p className="v2-copy mt-2">{body}</p>
      {actionHref && actionLabel ? (
        <div className="mt-5">
          <Link className={v2ButtonClass({ size: "lg" })} href={actionHref}>
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </V2Card>
  );
}
