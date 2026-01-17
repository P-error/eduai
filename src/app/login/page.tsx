"use client";

import { useState } from "react";
import { setAuthToken } from "@/lib/client-auth";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.message ?? "Login failed.");
      setLoading(false);
      return;
    }

    const json = await response.json();
    setAuthToken(json.token);
    setLoading(false);
    window.location.href = "/tests/create";
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Local login</h2>
        <p className="mt-2 text-sm text-slate-300">
          Enter a nickname or email to get a local JWT for this session.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            Nickname or email
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </section>
  );
}
