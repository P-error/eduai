"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { fetchCurrentUser } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  DEFAULT_LEARNER_ENTRY_HREF,
  buildLoginHrefForNext,
  buildRelativeHref,
} from "@/lib/learner-flow-contract";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/demo"]);

function ProtectedGate({
  children,
  isAdminPath,
  redirectAfterLogin,
}: {
  children: React.ReactNode;
  isAdminPath: boolean;
  redirectAfterLogin: string;
}) {
  const { messages } = useUiLocale();
  const [status, setStatus] = useState<"checking" | "allowed" | "forbidden">(
    "checking",
  );

  useEffect(() => {
    let active = true;

    fetchCurrentUser()
      .then((data) => {
        if (!active) return;
        if (!data?.id) {
          setStatus("forbidden");
          window.location.replace(buildLoginHrefForNext(redirectAfterLogin));
          return;
        }
        if (isAdminPath && !data.isAdmin) {
          setStatus("forbidden");
          window.location.replace(DEFAULT_LEARNER_ENTRY_HREF);
          return;
        }
        setStatus("allowed");
      })
      .catch(() => {
        if (!active) return;
        setStatus("forbidden");
        window.location.replace(buildLoginHrefForNext(redirectAfterLogin));
      });
    return () => {
      active = false;
    };
  }, [isAdminPath, redirectAfterLogin]);

  if (status === "allowed") {
    return <>{children}</>;
  }

  if (status === "checking") {
    return (
      <div className="ui-panel ui-panel-tight ui-panel-muted">
        <p className="ui-copy-sm">{messages.authGate.checkingAccess}</p>
      </div>
    );
  }

  return (
    <div className="ui-panel ui-panel-tight ui-panel-muted">
      <p className="ui-copy-sm">
        {isAdminPath
          ? messages.authGate.adminRedirect
          : messages.authGate.signInRedirect}
      </p>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isAdminPath = pathname.startsWith("/admin");
  const redirectAfterLogin = buildRelativeHref(pathname, searchParams.toString());

  if (isPublicPath) {
    return <>{children}</>;
  }

  return (
    <ProtectedGate
      key={`${pathname}?${searchParams.toString()}`}
      isAdminPath={isAdminPath}
      redirectAfterLogin={redirectAfterLogin}
    >
      {children}
    </ProtectedGate>
  );
}
