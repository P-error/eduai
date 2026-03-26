"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearAuthToken, getAuthToken } from "@/lib/client-auth";

type MeResponse = {
  name?: string | null;
  email?: string | null;
};

export default function AuthActions() {
  const token = getAuthToken();
  const hasToken = Boolean(token);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeResponse | null) => {
        if (!active || !data) return;
        setLabel(data.name ?? data.email ?? "User");
      })
      .catch(() => {
        if (!active) return;
        setLabel("User");
      });

    return () => {
      active = false;
    };
  }, [token]);

  if (!hasToken) {
    return (
      <div className="flex items-center gap-2">
        <Link className="rounded-full border border-slate-700 px-4 py-2" href="/login">
          Login
        </Link>
        <Link className="rounded-full border border-slate-700 px-4 py-2" href="/register">
          Register
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase text-slate-400">
        {label ?? "User"}
      </span>
      <button
        className="rounded-full border border-slate-700 px-4 py-2"
        type="button"
        onClick={() => {
          clearAuthToken();
          window.location.href = "/login";
        }}
      >
        Logout
      </button>
    </div>
  );
}
