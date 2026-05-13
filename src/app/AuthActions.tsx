"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchCurrentUser, logoutUser } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { DEMO_USER_NAME, isDemoPath } from "@/lib/demo-script";

type MeResponse = {
  id?: string;
  name?: string | null;
  email?: string | null;
};

export default function AuthActions() {
  const { messages } = useUiLocale();
  const pathname = usePathname();
  const isDemo = isDemoPath(pathname);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const isPublicPath = pathname === "/" || pathname === "/login" || pathname === "/register";

  useEffect(() => {
    let active = true;

    if (isDemo) {
      return () => {
        active = false;
      };
    }

    fetchCurrentUser()
      .then((data: MeResponse | null) => {
        if (!active) return;
        setMe(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMe(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isDemo]);

  if (isDemo) {
    return (
      <div className="flex items-center gap-2">
        <span className="ui-meta uppercase tracking-[0.16em]">{DEMO_USER_NAME}</span>
        <span className="ui-chip ui-chip-info">
          Simulated account
        </span>
      </div>
    );
  }

  if (loading && !isPublicPath) {
    return (
      <div
        className="ui-panel-soft h-11 w-32 rounded-full border border-slate-800"
        aria-hidden="true"
      />
    );
  }

  if (!me?.id) {
    if (!isPublicPath) {
      return null;
    }

    return (
      <div className="flex items-center gap-2">
        <Link className="ui-action-secondary ui-action-sm" href="/login">
          {messages.authActions.signIn}
        </Link>
        <Link className="ui-action-secondary ui-action-sm" href="/register">
          {messages.authActions.createAccount}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="ui-meta uppercase tracking-[0.16em]">
        {me.name ?? me.email ?? messages.authActions.userFallback}
      </span>
      <button
        className="ui-action-secondary ui-action-sm"
        type="button"
        onClick={async () => {
          await logoutUser();
          window.location.href = "/login";
        }}
      >
        {messages.authActions.signOut}
      </button>
    </div>
  );
}
