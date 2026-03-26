"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthActions from "./AuthActions";

const USER_NAV = [
  { href: "/learn", label: "Learn" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/profile", label: "Profile" },
  { href: "/insights", label: "Insights" },
] as const;

function navItemClass(active: boolean) {
  return active
    ? "rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
    : "rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100";
}

export default function AppShellNav() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <header className="rounded-3xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
            EduAI
          </p>
          <h1 className="text-lg font-semibold">Learning Workspace</h1>
        </div>
        <div className="flex items-center gap-2">
          <AuthActions />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {USER_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navItemClass(pathname === item.href || pathname.startsWith(`${item.href}/`))}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/admin"
          className={navItemClass(isAdmin)}
        >
          Admin
        </Link>
      </div>
    </header>
  );
}
