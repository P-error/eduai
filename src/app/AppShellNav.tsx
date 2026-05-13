"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchCurrentUser } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  DEFAULT_DEMO_SCENE_ID,
  DEMO_NAV_TARGETS,
  demoSceneHref,
  getDemoSceneById,
  isDemoPath,
  isDemoSceneId,
} from "@/lib/demo-script";
import AuthActions from "./AuthActions";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";

const DEMO_NAV = [
  { href: demoSceneHref(DEMO_NAV_TARGETS.profile), label: "Profile", surface: "profile" },
  { href: demoSceneHref(DEMO_NAV_TARGETS.learn), label: "Learn", surface: "learn" },
  { href: demoSceneHref(DEMO_NAV_TARGETS.practice), label: "Practice", surface: "practice" },
  {
    href: demoSceneHref(DEMO_NAV_TARGETS.analytics),
    label: "Analytics",
    surface: "analytics",
  },
  { href: demoSceneHref(DEMO_NAV_TARGETS.topics), label: "Topics", surface: "topics" },
] as const;

function navItemClass(active: boolean) {
  return active
    ? "ui-action-primary ui-action-sm"
    : "ui-action-secondary ui-action-sm";
}

function localeButtonClass(active: boolean) {
  return active
    ? "ui-segment ui-segment-sm"
    : "ui-segment ui-segment-sm bg-transparent";
}

export default function AppShellNav() {
  const { locale, messages, setLocale } = useUiLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemo = isDemoPath(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const isPublicPath = pathname === "/" || pathname === "/login" || pathname === "/register";
  const rawDemoSceneId = searchParams.get("scene");
  const demoSceneId = isDemoSceneId(rawDemoSceneId)
    ? rawDemoSceneId
    : DEFAULT_DEMO_SCENE_ID;
  const demoSurface = getDemoSceneById(demoSceneId).surface;
  const [canSeeAdmin, setCanSeeAdmin] = useState(false);
  const userNav = [
    { href: "/topics", label: messages.shell.nav.topics },
    { href: DEFAULT_LEARNER_ENTRY_HREF, label: messages.shell.nav.learn },
    { href: "/practice", label: messages.shell.nav.practice },
    { href: "/analytics", label: messages.shell.nav.analytics },
    { href: "/profile", label: messages.shell.nav.profile },
  ] as const;

  useEffect(() => {
    if (isPublicPath || isDemo) {
      return;
    }

    let active = true;
    fetchCurrentUser()
      .then((user) => {
        if (!active) return;
        setCanSeeAdmin(Boolean(user?.isAdmin));
      })
      .catch(() => {
        if (!active) return;
        setCanSeeAdmin(false);
      });

    return () => {
      active = false;
    };
  }, [isDemo, isPublicPath]);

  return (
    <header className="ui-panel ui-panel-body overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="ui-eyebrow">
            EduAI
            </p>
            <h1 className="ui-title-md mt-2">
              {isDemo ? "Learning Workspace" : messages.shell.title}
            </h1>
          </div>
          {isDemo ? (
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip ui-chip-accent">
                Demo mode
              </span>
              <span className="ui-chip">
                Simulated data
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isDemo ? (
            <div
              className="ui-panel-soft inline-flex items-center rounded-full border border-slate-700 p-1"
              aria-label={messages.localeSwitcher.ariaLabel}
            >
              {(["en", "ru"] as const).map((nextLocale) => {
                const active = locale === nextLocale;
                return (
                  <button
                    key={nextLocale}
                    type="button"
                    className={localeButtonClass(active)}
                    data-active={active}
                    onClick={() => setLocale(nextLocale)}
                  >
                    {messages.localeSwitcher[nextLocale]}
                  </button>
                );
              })}
            </div>
          ) : null}
          <AuthActions />
        </div>
      </div>

      {!isPublicPath ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-4">
          <nav
            className="flex flex-wrap items-center gap-2"
            aria-label={isDemo ? "Demo navigation" : "Primary navigation"}
          >
            {isDemo
              ? DEMO_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={navItemClass(demoSurface === item.surface)}
                    aria-current={demoSurface === item.surface ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))
              : userNav.map((item) => {
                  const active =
                    item.href === DEFAULT_LEARNER_ENTRY_HREF
                      ? pathname === "/learn" || pathname.startsWith("/learn/")
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navItemClass(active)}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
          </nav>
          {canSeeAdmin && !isDemo ? (
            <Link
              href="/admin"
              className={navItemClass(isAdmin)}
              aria-current={isAdmin ? "page" : undefined}
            >
              {messages.shell.operator}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
