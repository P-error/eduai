"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getAuthToken } from "@/lib/client-auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/") {
      setReady(true);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!pathname.startsWith("/admin")) {
      setReady(true);
      return;
    }

    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const adminFlag = Boolean(data?.isAdmin);
        setIsAdmin(adminFlag);
        if (!adminFlag) {
          window.location.href = "/login";
          return;
        }
        setReady(true);
      })
      .catch(() => {
        setIsAdmin(false);
        window.location.href = "/login";
      });
  }, [pathname]);

  if (pathname === "/login" || pathname === "/") {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Checking authorization...</p>
      </div>
    );
  }

  if (pathname.startsWith("/admin") && isAdmin === false) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Admin access required.</p>
      </div>
    );
  }

  return <>{children}</>;
}
