export default function Home() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-3xl font-semibold">Learn. Practice. Improve.</h2>
        <p className="mt-4 text-slate-300">
          This workspace helps you learn through guided chat and practice tests.
          It adapts explanations and difficulty to your progress, then shows
          transparent insights and confidence.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a className="rounded-full bg-slate-100 px-4 py-2 text-slate-900" href="/learn">
            Start learning
          </a>
          <a className="rounded-full border border-slate-700 px-4 py-2" href="/practice">
            Start practice
          </a>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-8">
        <h3 className="text-xl font-semibold">How it stays transparent</h3>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          <li>Expected accuracy and time are shown as heuristic proxies.</li>
          <li>Confidence increases only with enough high-quality samples.</li>
          <li>Standard mode stays available as a neutral baseline.</li>
          <li>Admin observability tracks quality, calibration, and drift.</li>
        </ul>
      </div>
    </section>
  );
}
