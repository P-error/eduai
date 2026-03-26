"use client";

import Link from "next/link";
import { useState } from "react";
import { setAuthToken } from "@/lib/client-auth";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [researchConsent, setResearchConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        researchConsent,
        ...(name.trim() ? { name } : {}),
      }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.message ?? "Registration failed.");
      setLoading(false);
      return;
    }

    const json = await response.json();
    setAuthToken(json.token);
    setLoading(false);
    window.location.href = "/dashboard";
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Create account</h2>
        <p className="mt-2 text-sm text-slate-300">
          Register with email and password to use protected learning routes.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            Email
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              required
            />
          </label>
          <label className="grid gap-2 text-sm">
            Password
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label className="grid gap-2 text-sm">
            Name (optional)
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input
              className="mt-1 h-4 w-4 rounded border border-slate-600 bg-slate-950"
              type="checkbox"
              checked={researchConsent}
              onChange={(event) => setResearchConsent(event.target.checked)}
            />
            <span>
              I consent to anonymized use of my results (scores, durations, metadata) for
              research/model improvement.
            </span>
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </button>
          <p className="text-sm text-slate-300">
            Already have an account?{" "}
            <Link className="underline underline-offset-2" href="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
