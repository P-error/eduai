import Link from "next/link";

export default function ProgressPage() {
  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Progress</h2>
        <p className="mt-2 text-sm text-slate-300">
          Coming soon. Use Dashboard and Insights for current prediction visibility.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link className="rounded-full border border-slate-700 px-4 py-2" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="rounded-full border border-slate-700 px-4 py-2" href="/insights">
            Open insights
          </Link>
        </div>
      </div>
    </section>
  );
}
