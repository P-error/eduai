"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { getUiDateLocale } from "@/lib/ui-locale";
import { SectionCard, StatGrid } from "./_components/ChartBlocks";

type OperationalSummaryPayload = {
  readiness: {
    ok: boolean;
    checkedAtIso: string;
    checks: Array<{
      key: string;
      label: string;
      status: "ok" | "warn" | "error";
      message: string;
      details?: Record<string, unknown> | null;
    }>;
  };
  runtime: {
    source: string;
    warning: string | null;
    policyId: string;
    backendKind: string;
    artifactPath: string | null;
    rateLimiterBackend: string;
  };
  artifactSlot: {
    slotMetadataStatus: string;
    slotStatus: string;
    runtimeIntegrationStatus: string;
    artifactExists: boolean;
    warning: string | null;
    runtimeArtifactStatus: string;
    runtimeArtifactWarning: string | null;
  };
  consent: {
    totalUsers: number;
    consentGranted: number;
    consentWithdrawn: number;
    excludedFromFutureTraining: number;
    futureTrainingEligible: number;
  };
  exports: {
    dataset: { path: string; requiresAdmin: boolean };
    evaluation: { path: string; requiresAdmin: boolean };
  };
  recentDangerousActions: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    result: string;
    createdAtIso: string;
    actor: {
      id: string | null;
      email: string | null;
      name: string | null;
    };
  }>;
};

type AuditEventsPayload = {
  events: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    result: string;
    ipAddress: string | null;
    createdAtIso: string;
    actor: {
      id: string | null;
      email: string | null;
      name: string | null;
    };
    summary: Record<string, unknown> | null;
  }>;
};

function formatTime(value: string | null, locale: "en" | "ru", emptyText: string) {
  if (!value) return emptyText;
  return new Date(value).toLocaleString(getUiDateLocale(locale));
}

export default function AdminOverviewPage() {
  const { locale, messages } = useUiLocale();
  const [summary, setSummary] = useState<OperationalSummaryPayload | null>(null);
  const [audit, setAudit] = useState<AuditEventsPayload["events"]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const [summaryResponse, auditResponse] = await Promise.all([
        authFetch("/api/admin/operational-summary"),
        authFetch("/api/admin/audit-events?limit=20"),
      ]);

      if (!summaryResponse.ok || !auditResponse.ok) {
        if (active) {
          setError(messages.adminOverview.errorLoad);
        }
        return;
      }

      const [summaryJson, auditJson] = await Promise.all([
        summaryResponse.json() as Promise<OperationalSummaryPayload>,
        auditResponse.json() as Promise<AuditEventsPayload>,
      ]);

      if (!active) return;
      setSummary(summaryJson);
      setAudit(auditJson.events);
    }

    load();
    return () => {
      active = false;
    };
  }, [messages.adminOverview.errorLoad]);

  if (error) {
    return (
      <section className="rounded-3xl border border-red-900/50 bg-slate-900/70 p-6">
        <p>{error}</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <p>{messages.adminOverview.loading}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">{messages.adminOverview.operationalAdmin}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {messages.adminOverview.subtitle}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {messages.adminOverview.checked}:{" "}
          {formatTime(summary.readiness.checkedAtIso, locale, messages.common.notRecorded)}
        </p>
      </div>

      <SectionCard title={messages.adminOverview.systemSnapshot}>
        <StatGrid
          items={[
            {
              label: messages.adminOverview.readiness,
              value: summary.readiness.ok ? messages.common.ready : messages.adminOverview.notReady,
            },
            {
              label: messages.adminOverview.runtimeBackend,
              value: summary.runtime.backendKind,
            },
            {
              label: messages.adminOverview.policyMode,
              value: summary.runtime.policyId,
            },
            {
              label: messages.adminOverview.rateLimiter,
              value: summary.runtime.rateLimiterBackend,
            },
            {
              label: messages.adminOverview.trainingEligibleUsers,
              value: String(summary.consent.futureTrainingEligible),
            },
            {
              label: messages.adminOverview.excludedUsers,
              value: String(summary.consent.excludedFromFutureTraining),
            },
          ]}
        />
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={messages.adminOverview.activeRuntime}>
          <div className="grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.selectionSource}</span>
              <span>{summary.runtime.source}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.policyId}</span>
              <span>{summary.runtime.policyId}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.backendKind}</span>
              <span>{summary.runtime.backendKind}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.artifactPath}</span>
              <span>{summary.runtime.artifactPath ?? messages.adminOverview.notConfigured}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.runtimeWarning}</span>
              <span>{summary.runtime.warning ?? messages.common.none}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={messages.adminOverview.artifactSlot}>
          <div className="grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.slotMetadataStatus}</span>
              <span>{summary.artifactSlot.slotMetadataStatus}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.slotState}</span>
              <span>{summary.artifactSlot.slotStatus}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.runtimeIntegration}</span>
              <span>{summary.artifactSlot.runtimeIntegrationStatus}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.artifactPresent}</span>
              <span>{summary.artifactSlot.artifactExists ? messages.common.yes : messages.common.no}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.runtimeArtifactStatus}</span>
              <span>{summary.artifactSlot.runtimeArtifactStatus}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>{messages.adminOverview.warning}</span>
              <span>
                {summary.artifactSlot.warning ??
                  summary.artifactSlot.runtimeArtifactWarning ??
                  messages.common.none}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={messages.adminOverview.consentAndTrainingEligibility}>
          <StatGrid
            items={[
              { label: messages.adminOverview.totalUsers, value: String(summary.consent.totalUsers) },
              {
                label: messages.adminOverview.consentGranted,
                value: String(summary.consent.consentGranted),
              },
              {
                label: messages.adminOverview.consentWithdrawn,
                value: String(summary.consent.consentWithdrawn),
              },
              {
                label: messages.adminOverview.futureTrainingEligible,
                value: String(summary.consent.futureTrainingEligible),
              },
              {
                label: messages.adminOverview.explicitlyExcluded,
                value: String(summary.consent.excludedFromFutureTraining),
              },
            ]}
          />
        </SectionCard>

        <SectionCard title={messages.adminOverview.exports}>
          <div className="grid gap-3 text-sm">
            <Link
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
              href={summary.exports.dataset.path}
            >
              {messages.adminOverview.datasetExport}
            </Link>
            <Link
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
              href={summary.exports.evaluation.path}
            >
              {messages.adminOverview.evaluationExport}
            </Link>
            <Link
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
              href="/admin/prompt-templates"
            >
              {messages.adminOverview.promptTemplates}
            </Link>
            <Link
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
              href="/admin/episodes"
            >
              {messages.adminOverview.episodeInspection}
            </Link>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={messages.adminOverview.readinessChecks}>
        <div className="grid gap-3">
          {summary.readiness.checks.map((check) => (
            <div
              key={check.key}
              className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{check.label}</span>
                <span className="uppercase text-slate-400">{check.status}</span>
              </div>
              <p className="mt-2 text-slate-300">{check.message}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={messages.adminOverview.dangerousActions}>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-400">{messages.adminOverview.noActions}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">{messages.adminOverview.time}</th>
                  <th className="pb-2">{messages.adminOverview.actor}</th>
                  <th className="pb-2">{messages.adminOverview.action}</th>
                  <th className="pb-2">{messages.adminOverview.target}</th>
                  <th className="pb-2">{messages.adminOverview.actionResult}</th>
                  <th className="pb-2">{messages.adminOverview.ip}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((event) => (
                  <tr key={event.id} className="border-t border-slate-800 text-slate-300">
                    <td className="py-2">
                      {formatTime(event.createdAtIso, locale, messages.common.notRecorded)}
                    </td>
                    <td className="py-2">
                      {event.actor.email ??
                        event.actor.name ??
                        event.actor.id ??
                        messages.adminOverview.unknownActor}
                    </td>
                    <td className="py-2">{event.action}</td>
                    <td className="py-2">
                      {event.targetType}
                      {event.targetId ? `:${event.targetId}` : ""}
                    </td>
                    <td className="py-2">{event.result}</td>
                    <td className="py-2">{event.ipAddress ?? messages.adminOverview.unknownActor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
