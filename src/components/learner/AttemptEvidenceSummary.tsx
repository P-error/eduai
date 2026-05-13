"use client";

import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import type { LearnerAttemptEvidenceContract } from "@/lib/learning-evidence-contract";
import {
  formatAdaptiveImpactLabel,
  formatAttemptEvidenceNote,
  formatAttemptPathLabel,
  formatLearningExclusionReasonLabel,
} from "@/lib/ui-locale";

function toneForLearningStatus(eligible: boolean) {
  return eligible
    ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-100"
    : "border-amber-800/60 bg-amber-950/20 text-amber-100";
}

export default function AttemptEvidenceSummary({
  contract,
}: {
  contract: LearnerAttemptEvidenceContract;
}) {
  const { locale, messages } = useUiLocale();
  const exclusionReason = formatLearningExclusionReasonLabel(
    contract.learning.exclusionReasonCode,
    locale,
  );

  return (
    <div className="ui-panel ui-panel-tight text-sm">
      <p className="ui-eyebrow">
        {messages.testRunner.evidenceSummaryTitle}
      </p>
      <p className="ui-copy-sm mt-2">
        {messages.testRunner.evidenceSummaryBody}
      </p>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="ui-metric-item">
          <span>{messages.common.recordedAttempt}</span>
          <span>{messages.common.yes}</span>
        </div>
        <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toneForLearningStatus(contract.learning.eligible)}`}>
          <span>{messages.common.learningUpdates}</span>
          <span className="font-medium">
            {contract.learning.eligible
              ? messages.common.eligible
              : messages.common.excluded}
          </span>
        </div>
      </div>

      {exclusionReason ? (
        <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          <span className="font-medium">{messages.common.whyExcluded}: </span>
          <span>{exclusionReason}</span>
        </div>
      ) : null}

      <details className="ui-panel ui-panel-tight ui-panel-soft mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-text">
          {messages.testRunner.evidenceTechnicalDetails}
        </summary>
        <div className="ui-metric-grid mt-4 md:grid-cols-2">
          <div className="ui-metric-item">
            <span>{messages.common.adaptiveState}</span>
            <span>{formatAdaptiveImpactLabel(contract.adaptive.impactKind, locale)}</span>
          </div>
          <div className="ui-metric-item">
            <span>{messages.common.pathway}</span>
            <span>{formatAttemptPathLabel(contract.path.kind, locale)}</span>
          </div>
        </div>
        <p className="ui-meta mt-3">
          {formatAttemptEvidenceNote(contract, locale)}
        </p>
      </details>
    </div>
  );
}
