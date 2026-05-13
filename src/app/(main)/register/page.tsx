"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  buildLoginHrefForNext,
  pickPostAuthRedirectHref,
} from "@/lib/learner-flow-contract";
import { localizeErrorMessage } from "@/lib/ui-locale";

export default function RegisterPage() {
  const { messages, locale } = useUiLocale();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [researchConsent, setResearchConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextHref = pickPostAuthRedirectHref(searchParams.get("next"));
  const loginHref = buildLoginHrefForNext(searchParams.get("next"));

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
      setError(
        localizeErrorMessage(
          json,
          locale,
          messages.register.errorFallback,
        ),
      );
      setLoading(false);
      return;
    }

    await response.json().catch(() => null);
    setLoading(false);
    window.location.href = nextHref;
  }

  return (
    <section className="grid gap-6">
      <div className="ui-panel ui-panel-hero ui-panel-body mx-auto w-full max-w-2xl">
        <p className="ui-eyebrow">{messages.authActions.createAccount}</p>
        <h2 className="ui-title-lg mt-3">{messages.register.title}</h2>
        <p className="ui-copy-sm mt-2">
          {messages.register.subtitle}
        </p>
        <form onSubmit={handleSubmit} className="ui-form-grid mt-6">
          <label className="ui-label">
            {messages.register.email}
            <input
              className="ui-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              required
            />
          </label>
          <label className="ui-label">
            {messages.register.password}
            <input
              className="ui-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label className="ui-label">
            {messages.register.nameOptional}
            <input
              className="ui-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="ui-copy-sm flex items-start gap-3">
            <input
              className="ui-check mt-1 h-4 w-4 rounded border border-slate-600 bg-slate-950"
              type="checkbox"
              checked={researchConsent}
              onChange={(event) => setResearchConsent(event.target.checked)}
            />
            <span>
              {messages.register.consent}
            </span>
          </label>
          {error ? (
            <p className="ui-panel ui-panel-danger ui-panel-tight text-sm">
              {error}
            </p>
          ) : null}
          <button
            className="ui-action-primary w-full sm:w-auto"
            type="submit"
            disabled={loading}
          >
            {loading ? messages.register.creating : messages.register.createAccount}
          </button>
          <p className="ui-copy-sm">
            {messages.register.alreadyHaveAccount}{" "}
            <Link className="font-medium underline underline-offset-2" href={loginHref}>
              {messages.register.signIn}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
