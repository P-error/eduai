export default function Home() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-3xl font-semibold">
          Build adaptive tests and chat experiences
        </h2>
        <p className="mt-4 text-slate-300">
          This local playground generates LLM-based tests, tags each question on
          10 axes, and tracks personalization performance. Use it to experiment
          with instructional preferences and analytics without deploying to
          production.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a className="rounded-full bg-slate-100 px-4 py-2 text-slate-900" href="/tests/create">
            Start a test
          </a>
          <a className="rounded-full border border-slate-700 px-4 py-2" href="/chat">
            Open chat lab
          </a>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-8">
        <h3 className="text-xl font-semibold">What gets tracked</h3>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          <li>Generated test payloads + per-question tag assignments.</li>
          <li>Accuracy deltas before and after personalization.</li>
          <li>Declared vs effective preferences across 10 axes.</li>
          <li>Chat signals like “simplify” or “give an example”.</li>
        </ul>
      </div>
    </section>
  );
}
