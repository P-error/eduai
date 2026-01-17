"use client";

import { useEffect, useState } from "react";
import { clearAuthToken, getAuthToken } from "@/lib/client-auth";

type MeResponse = {
  name?: string | null;
  email?: string | null;
};

export default function AuthActions() {
  const [hasToken, setHasToken] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const isAuthed = Boolean(token);
    setHasToken(isAuthed);
    if (!isAuthed) {
      setLabel(null);
      return;
    }

    fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MeResponse | null) => {
        if (!data) return;
        setLabel(data.name ?? data.email ?? "User");
      })
      .catch(() => {
        setLabel("User");
      });
  }, []);

  if (!hasToken) {
    return (
      <a className="rounded-full border border-slate-700 px-4 py-2" href="/login">
        Login
      </a>
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
