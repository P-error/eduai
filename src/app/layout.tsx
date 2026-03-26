import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./AuthGate";
import AppShellNav from "./AppShellNav";
import StatusPanel from "./StatusPanel";

export const metadata: Metadata = {
  title: "EduAI Workspace",
  description: "Learning workspace: Learn, Dashboard, Practice, Profile, Insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
          <AppShellNav />
          <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0">
              <AuthGate>{children}</AuthGate>
            </section>
            <div className="hidden lg:block">
              <StatusPanel />
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
