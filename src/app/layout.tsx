import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduAI Lab",
  description: "Local LLM personalization lab for tests and chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-950 text-slate-100 antialiased`}
      >
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                EduAI Lab
              </p>
              <h1 className="text-2xl font-semibold">LLM Personalization Lab</h1>
            </div>
            <nav className="flex flex-wrap gap-3 text-sm">
              <a className="rounded-full border border-slate-700 px-4 py-2" href="/tests/create">
                Create Test
              </a>
              <a className="rounded-full border border-slate-700 px-4 py-2" href="/tests/stats">
                Stats
              </a>
              <a className="rounded-full border border-slate-700 px-4 py-2" href="/chat">
                Chat
              </a>
              <a className="rounded-full border border-slate-700 px-4 py-2" href="/admin/analytics">
                Analytics
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
