"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getAuthToken } from "@/lib/client-auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = getAuthToken();
  const [adminCheck, setAdminCheck] = useState<{
    token: string | null;
    status: "unknown" | "allowed" | "forbidden";
  }>({ token: null, status: "unknown" });
  const isPublicPath = pathname === "/login" || pathname === "/" || pathname === "/register";
  const isAdminPath = pathname.startsWith("/admin");
  const adminStatus =
    isAdminPath && token && adminCheck.token === token ? adminCheck.status : "unknown";

  useEffect(() => {
    if (isPublicPath || token) {
      return;
    }
    window.location.href = "/login";
  }, [isPublicPath, token]);

  useEffect(() => {
    if (!isAdminPath || !token) {
      return;
    }
    if (adminCheck.token === token && adminCheck.status !== "unknown") {
      return;
    }

    let active = true;
    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const adminFlag = Boolean(data?.isAdmin);
        setAdminCheck({
          token,
          status: adminFlag ? "allowed" : "forbidden",
        });
        if (!adminFlag) {
          window.location.href = "/login";
        }
      })
      .catch(() => {
        if (!active) return;
        setAdminCheck({
          token,
          status: "forbidden",
        });
        window.location.href = "/login";
      });
    return () => {
      active = false;
    };
  }, [adminCheck.status, adminCheck.token, isAdminPath, token]);

  if (isPublicPath) {
    return <>{children}</>;
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Checking authorization...</p>
      </div>
    );
  }

  if (isAdminPath && adminStatus === "unknown") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Checking authorization...</p>
      </div>
    );
  }

  if (isAdminPath && adminStatus === "forbidden") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Admin access required.</p>
      </div>
    );
  }

  return <>{children}</>;
}
