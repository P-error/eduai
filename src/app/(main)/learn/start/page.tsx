"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import {
  DEFAULT_LEARNER_ENTRY_HREF,
  buildLoginHrefForNext,
} from "@/lib/learner-flow-contract";

type LearnerFlowEntryResponse = {
  ok?: boolean;
  target?: {
    href?: string;
  };
};

export default function LearnEntryPage() {
  const { messages } = useUiLocale();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveEntry() {
      const response = await authFetch("/api/learner-flow/entry");
      if (response.status === 401) {
        window.location.replace(buildLoginHrefForNext(DEFAULT_LEARNER_ENTRY_HREF));
        return;
      }

      if (!response.ok) {
        if (active) {
          setError(messages.learn.errorContinue);
        }
        return;
      }

      const payload = (await response.json()) as LearnerFlowEntryResponse;
      const nextHref = payload.target?.href;
      if (!nextHref) {
        if (active) {
          setError(messages.learn.errorContinue);
        }
        return;
      }

      window.location.replace(nextHref);
    }

    void resolveEntry();

    return () => {
      active = false;
    };
  }, [messages.learn.errorContinue]);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-sm text-slate-300">
        {error ?? messages.authGate.checkingAccess}
      </p>
    </div>
  );
}
