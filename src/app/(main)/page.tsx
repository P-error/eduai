"use client";

import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";

export default function Home() {
  const { messages } = useUiLocale();

  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="ui-panel ui-panel-hero ui-panel-body">
        <p className="ui-eyebrow">{messages.shell.title}</p>
        <h2 className="ui-title-xl mt-3">{messages.home.heroTitle}</h2>
        <p className="ui-copy mt-4 max-w-3xl">
          {messages.home.heroBody}
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a className="ui-action-primary px-4" href={DEFAULT_LEARNER_ENTRY_HREF}>
            {messages.home.startEpisode}
          </a>
        </div>
      </div>
      <div className="ui-panel ui-panel-body ui-panel-soft">
        <h3 className="ui-title-md">{messages.home.transparencyTitle}</h3>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          {messages.home.transparencyItems.map((item) => (
            <li key={item} className="ui-copy-sm">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
