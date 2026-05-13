import type { Metadata } from "next";
import { Suspense } from "react";
import "../globals.css";
import "@/lib/startup-env";
import AuthGate from "../AuthGate";
import AppShellNav from "../AppShellNav";
import StatusPanel from "../StatusPanel";
import { UiLocaleProvider } from "@/components/i18n/UiLocaleProvider";
import { DEFAULT_UI_LOCALE } from "@/lib/ui-locale";

export const metadata: Metadata = {
  title: "EduAI Workspace",
  description: "Learning workspace: Profile, Learn, Practice, Analytics, Topics",
};

function DemoShellFallback() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
      Loading demo workspace...
    </div>
  );
}

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_UI_LOCALE}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <UiLocaleProvider initialLocale={DEFAULT_UI_LOCALE}>
          <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
            <Suspense
              fallback={<div className="h-[118px] rounded-3xl border border-slate-800 bg-slate-900/60" />}
            >
              <AppShellNav />
            </Suspense>
            <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section className="min-w-0">
                <Suspense fallback={<DemoShellFallback />}>
                  <AuthGate>{children}</AuthGate>
                </Suspense>
              </section>
              <div className="hidden lg:block">
                <Suspense fallback={null}>
                  <StatusPanel />
                </Suspense>
              </div>
            </main>
          </div>
        </UiLocaleProvider>
      </body>
    </html>
  );
}
