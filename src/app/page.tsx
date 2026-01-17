export default function Home() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-3xl font-semibold">EduAI Lab</h2>
        <p className="mt-4 text-slate-300">
          Local sandbox for generating LLM-based tests and chat, tagging each
          question across 10 axes, and tracking personalization performance.
          Everything runs on your machine with Postgres + an external LLM.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a className="rounded-full bg-slate-100 px-4 py-2 text-slate-900" href="/login">
            Login to start
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
