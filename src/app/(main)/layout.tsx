import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import "../globals.css";
import "@/lib/startup-env";
import AuthGate from "../AuthGate";
import AppShellNav from "../AppShellNav";
import StatusPanel from "../StatusPanel";
import { UiLocaleProvider } from "@/components/i18n/UiLocaleProvider";
import { UiPreferencesProvider } from "@/components/settings/UiPreferencesProvider";
import { UI_LOCALE_COOKIE_NAME, normalizeUiLocale } from "@/lib/ui-locale";
import {
  normalizeUiPreferences,
  UI_CONTRAST_COOKIE_NAME,
  UI_FONT_SCALE_COOKIE_NAME,
  UI_THEME_COOKIE_NAME,
} from "@/lib/ui-preferences";

export const metadata: Metadata = {
  title: "EduAI Workspace",
  description: "Learning workspace: Profile, Learn, Practice, Analytics, Topics",
};

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeUiLocale(
    cookieStore.get(UI_LOCALE_COOKIE_NAME)?.value,
  );
  const initialPreferences = normalizeUiPreferences({
    theme: cookieStore.get(UI_THEME_COOKIE_NAME)?.value,
    fontScale: cookieStore.get(UI_FONT_SCALE_COOKIE_NAME)?.value,
    contrast: cookieStore.get(UI_CONTRAST_COOKIE_NAME)?.value,
  });

  return (
    <html
      lang={initialLocale}
      data-ui-theme={initialPreferences.theme}
      data-ui-font-scale={initialPreferences.fontScale}
      data-ui-contrast={initialPreferences.contrast}
    >
      <body className="eduai-main-ui min-h-screen antialiased">
        <UiPreferencesProvider initialPreferences={initialPreferences}>
          <UiLocaleProvider initialLocale={initialLocale}>
            <div className="mx-auto flex min-h-screen w-full max-w-[1340px] flex-col gap-5 px-4 py-5 sm:px-5 md:px-6 md:py-6">
              <Suspense
                fallback={<div className="ui-panel h-[118px]" />}
              >
                <AppShellNav />
              </Suspense>
              <main className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_292px]">
                <section className="min-w-0">
                  <AuthGate>{children}</AuthGate>
                </section>
                <div className="order-first min-w-0 xl:order-none">
                  <Suspense fallback={null}>
                    <StatusPanel />
                  </Suspense>
                </div>
              </main>
            </div>
          </UiLocaleProvider>
        </UiPreferencesProvider>
      </body>
    </html>
  );
}
