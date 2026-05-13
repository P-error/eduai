"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  buildRegisterHrefForNext,
  pickPostAuthRedirectHref,
} from "@/lib/learner-flow-contract";
import { localizeErrorMessage } from "@/lib/ui-locale";

export default function LoginPage() {
  const { messages, locale } = useUiLocale();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextHref = pickPostAuthRedirectHref(searchParams.get("next"));
  const registerHref = buildRegisterHrefForNext(searchParams.get("next"));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier,
        password,
      }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(
        localizeErrorMessage(
          json,
          locale,
          messages.login.errorFallback,
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
        <p className="ui-eyebrow">{messages.authActions.signIn}</p>
        <h2 className="ui-title-lg mt-3">{messages.login.title}</h2>
        <p className="ui-copy-sm mt-2">
          {messages.login.subtitle}
        </p>
        <form onSubmit={handleSubmit} className="ui-form-grid mt-6">
          <label className="ui-label">
            {messages.login.email}
            <input
              className="ui-input"
              type="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>
          <label className="ui-label">
            {messages.login.password}
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
            {loading ? messages.login.loading : messages.login.submit}
          </button>
          <p className="ui-copy-sm">
            {messages.login.noAccount}{" "}
            <Link className="font-medium underline underline-offset-2" href={registerHref}>
              {messages.login.createAccount}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
