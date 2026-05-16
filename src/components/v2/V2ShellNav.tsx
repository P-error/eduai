"use client";

import Link from "next/link";
import type { UiLocale, UiMessages } from "@/lib/ui-locale";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";
import AuthActions from "@/app/AuthActions";
import UiVersionToggle from "@/components/settings/UiVersionToggle";

type V2ShellNavProps = {
  canSeeAdmin: boolean;
  isAdmin: boolean;
  isPublicPath: boolean;
  locale: UiLocale;
  messages: UiMessages;
  pathname: string;
  setLocale: (locale: UiLocale) => void;
};

function isActive(pathname: string, href: string) {
  if (href === DEFAULT_LEARNER_ENTRY_HREF) {
    return pathname === "/learn" || pathname.startsWith("/learn/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function V2ShellNav({
  canSeeAdmin,
  isAdmin,
  isPublicPath,
  locale,
  messages,
  pathname,
  setLocale,
}: V2ShellNavProps) {
  const nav = [
    { href: DEFAULT_LEARNER_ENTRY_HREF, label: messages.shell.nav.learn },
    { href: "/practice", label: messages.shell.nav.practice },
    { href: "/topics", label: messages.shell.nav.topics },
    { href: "/analytics", label: messages.shell.nav.analytics },
    { href: "/profile", label: messages.shell.nav.profile },
  ] as const;

  return (
    <header className="v2-shell-nav">
      <div className="v2-shell-nav-top">
        <Link className="v2-brand" href={DEFAULT_LEARNER_ENTRY_HREF}>
          EduAI
        </Link>
        <div className="v2-shell-actions">
          <div
            className="ui-panel-soft inline-flex items-center rounded-full border border-slate-700 p-1"
            aria-label={messages.localeSwitcher.ariaLabel}
          >
            {(["en", "ru"] as const).map((nextLocale) => (
              <button
                key={nextLocale}
                type="button"
                className={`ui-segment ui-segment-sm ${
                  locale === nextLocale ? "" : "bg-transparent"
                }`}
                data-active={locale === nextLocale}
                onClick={() => setLocale(nextLocale)}
              >
                {messages.localeSwitcher[nextLocale]}
              </button>
            ))}
          </div>
          <UiVersionToggle compact />
          <AuthActions />
        </div>
      </div>

      {!isPublicPath ? (
        <div className="v2-shell-nav-bottom">
          <nav className="v2-nav-list" aria-label="Primary navigation">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  className="v2-nav-link"
                  data-active={active}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
            {canSeeAdmin ? (
              <Link
                className="v2-nav-link"
                data-active={isAdmin}
                href="/admin"
                aria-current={isAdmin ? "page" : undefined}
              >
                {messages.shell.operator}
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
