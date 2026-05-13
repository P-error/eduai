"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { useUiPreferences } from "@/components/settings/UiPreferencesProvider";
import Card from "@/components/system/Card";
import Pill from "@/components/system/Pill";
import Section from "@/components/system/Section";
import { authFetch } from "@/lib/client-auth";
import {
  formatAxisLabel,
  formatDifficultyLabel,
  formatLearningExclusionReasonLabel,
  formatPreferenceValue,
  getUiDateLocale,
  localizeErrorMessage,
} from "@/lib/ui-locale";
import type { LearningExclusionReasonCode } from "@/lib/learning-evidence-contract";
import type {
  UiContrastMode,
  UiFontScale,
  UiThemeMode,
} from "@/lib/ui-preferences";

type ConfidenceCell = {
  bestTag: string | null;
  confidence: number;
  sampleSize: number;
};

type PredictionCell = {
  value: number | null;
  confidence: number;
  basis: string;
};

type ProfilePayload = {
  user: { id: string; createdAt: string };
  dataQuality: {
    attemptsTotal: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    excludedReasonsTop: Array<{ reason: LearningExclusionReasonCode | "UNKNOWN"; count: number }>;
    lastUpdatedAt: string | null;
  };
  ux: {
    effectivePreferences: {
      tone: ConfidenceCell;
      explanation_style: ConfidenceCell;
      response_format: ConfidenceCell & { bestTag: "mcq" | null };
    };
    engagement: {
      avgTotalDurationMs: number | null;
      avgPerQuestionFirstAnswerMs: number | null;
      avgAnswerChangeCount: number | null;
    };
  };
  pedagogy: {
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
    band: { low: number; high: number };
    recentAccuracy: { value: number | null; sampleSize: number };
    effectivePreferences: {
      cognitive_process: ConfidenceCell;
      task_family: ConfidenceCell;
      context: ConfidenceCell;
    };
  };
  subjects: Array<{
    subjectId: string;
    subjectTitle: string;
    attempts: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    recentAccuracy: number | null;
    recentEvidenceCount: number;
    isDefaultCollection: boolean;
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
  }>;
  notes: {
    whatThisMeans: string[];
    limitations: string[];
  };
};

type PredictionsPayload = {
  forTests: {
    recommendedDecision: {
      difficulty: "easy" | "medium" | "hard";
      depth: "brief" | "standard" | "detailed";
    };
    predicted: {
      expectedAccuracy: PredictionCell;
      expectedTotalDurationMs: PredictionCell;
    };
    nextDifficultySuggestion: {
      value: "easy" | "medium" | "hard" | null;
      reason: string;
    };
  };
};

type PreferencesPayload = {
  declared: Record<string, string>;
  effective: Record<string, string>;
};

type MePayload = {
  id: string;
  email?: string | null;
  name?: string | null;
  testsTaken?: number;
  personalizationReady?: boolean;
};

type ResearchConsentPayload = {
  consent: {
    consentGranted: boolean;
    consentVersion: string | null;
    consentGrantedAtIso: string | null;
    consentWithdrawnAtIso: string | null;
    futureTrainingEligible: boolean;
    excludedFromFutureTraining: boolean;
    excludedFromFutureTrainingAtIso: string | null;
    exclusionReason: string | null;
  };
};

type ProfileTabKey = "account" | "accessibility" | "preferences" | "system";

const VISIBLE_PREFERENCE_KEYS = [
  "difficulty_target",
  "depth",
  "tone",
  "explanation_style",
] as const;

type VisiblePreferenceKey = (typeof VISIBLE_PREFERENCE_KEYS)[number];

function fmtPercent(value: number | null, emptyText: string, digits = 0) {
  if (value == null) return emptyText;
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtMs(value: number | null, emptyText: string, locale: "en" | "ru") {
  if (value == null) return emptyText;
  const unit = locale === "ru" ? "мс" : "ms";
  return `${Math.round(value)} ${unit}`;
}

function formatPreferenceOrFallback(
  axis: string,
  value: string | null | undefined,
  locale: "en" | "ru",
  emptyText: string,
) {
  if (!value) return emptyText;
  return formatPreferenceValue(axis, value, locale) ?? value;
}

function fmtTag(params: {
  axis: string;
  cell: ConfidenceCell | undefined;
  emptyText: string;
  locale: "en" | "ru";
}) {
  if (!params.cell || !params.cell.bestTag || params.cell.sampleSize === 0) {
    return params.emptyText;
  }
  const confidenceLabel = params.locale === "ru" ? "дов." : "conf";
  return `${formatPreferenceOrFallback(
    params.axis,
    params.cell.bestTag,
    params.locale,
    params.emptyText,
  )} (${confidenceLabel} ${params.cell.confidence.toFixed(2)}, n=${params.cell.sampleSize})`;
}

function ConfidenceBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-surface2/90">
      <div className="h-full rounded-full bg-slate-200" style={{ width: `${width}%` }} />
    </div>
  );
}

function PreferenceOptionGroup<T extends string>({
  label,
  helper,
  value,
  options,
  onChange,
}: {
  label: string;
  helper: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="sys-control-group">
      <div className="sys-control-header">
        <p className="sys-control-label">{label}</p>
        <p className="sys-control-helper">{helper}</p>
      </div>
      <div className="sys-control-options">
        {options.map((option) => (
          <button
            key={`${label}-${option.value}`}
            type="button"
            className="sys-control-option"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileTabButton({
  active,
  label,
  panelId,
  tabId,
  onClick,
}: {
  active: boolean;
  label: string;
  panelId: string;
  tabId: string;
  onClick: () => void;
}) {
  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      className={active ? "ui-segment" : "ui-segment bg-transparent"}
      data-active={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ProfileOverviewButton({
  active,
  body,
  label,
  onClick,
  pill,
}: {
  active: boolean;
  body: string;
  label: string;
  onClick: () => void;
  pill: string;
}) {
  return (
    <Card
      as="button"
      type="button"
      interactive
      variant={active ? "hero" : "surface2"}
      className="grid gap-3 p-4 text-left"
      aria-pressed={active}
      onClick={onClick}
    >
      <div>
        <Pill tone={active ? "primary" : "muted"}>{pill}</Pill>
      </div>
      <div>
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="mt-2 text-sm text-muted">{body}</p>
      </div>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ui-detail-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { locale, messages } = useUiLocale();
  const {
    contrast,
    fontScale,
    setContrast,
    setFontScale,
    setTheme,
    theme,
  } = useUiPreferences();

  const dateLocale = getUiDateLocale(locale);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("account");
  const [me, setMe] = useState<MePayload | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [preferences, setPreferences] = useState<PreferencesPayload | null>(null);
  const [researchConsent, setResearchConsent] =
    useState<ResearchConsentPayload["consent"] | null>(null);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountPending, setAccountPending] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState<Record<string, string>>({});
  const [preferencesPending, setPreferencesPending] = useState(false);
  const [preferencesNotice, setPreferencesNotice] = useState<string | null>(null);
  const [consentPending, setConsentPending] = useState(false);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const themeOptions: Array<{ value: UiThemeMode; label: string }> = [
    { value: "system", label: messages.profile.systemTheme },
    { value: "light", label: messages.profile.lightTheme },
    { value: "dark", label: messages.profile.darkTheme },
  ];
  const fontScaleOptions: Array<{ value: UiFontScale; label: string }> = [
    { value: "100", label: messages.profile.fontScale100 },
    { value: "110", label: messages.profile.fontScale110 },
    { value: "125", label: messages.profile.fontScale125 },
    { value: "140", label: messages.profile.fontScale140 },
  ];
  const contrastOptions: Array<{ value: UiContrastMode; label: string }> = [
    { value: "off", label: messages.profile.contrastOff },
    { value: "high", label: messages.profile.contrastOn },
  ];

  const tabItems = [
    { key: "account", label: messages.profile.tabAccount },
    { key: "accessibility", label: messages.profile.tabAccessibility },
    { key: "preferences", label: messages.profile.tabPreferences },
    { key: "system", label: messages.profile.tabSystem },
  ] as const satisfies Array<{ key: ProfileTabKey; label: string }>;

  const overviewItems = [
    {
      key: "accessibility",
      label: messages.profile.tabAccessibility,
      body: messages.profile.interfaceSettingsBody,
    },
    {
      key: "preferences",
      label: messages.profile.tabPreferences,
      body: messages.profile.myPreferencesBody,
    },
    {
      key: "system",
      label: messages.profile.tabSystem,
      body: messages.profile.personalizationBody,
    },
    {
      key: "account",
      label: messages.profile.tabAccount,
      body: messages.profile.dataAndConsentBody,
    },
  ] as const satisfies Array<{ key: ProfileTabKey; label: string; body: string }>;

  const preferenceFields = [
    {
      key: "difficulty_target",
      label: messages.profile.preferredDifficulty,
      helper: messages.profile.preferredDifficultyHelp,
      options: [
        { value: "", label: messages.profile.noPreference },
        { value: "easy", label: formatDifficultyLabel("easy", locale) },
        { value: "medium", label: formatDifficultyLabel("medium", locale) },
        { value: "hard", label: formatDifficultyLabel("hard", locale) },
      ],
    },
    {
      key: "depth",
      label: messages.profile.preferredDepth,
      helper: messages.profile.preferredDepthHelp,
      options: [
        { value: "", label: messages.profile.noPreference },
        {
          value: "brief",
          label: formatPreferenceOrFallback(
            "depth",
            "brief",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "standard",
          label: formatPreferenceOrFallback(
            "depth",
            "standard",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "detailed",
          label: formatPreferenceOrFallback(
            "depth",
            "detailed",
            locale,
            messages.profile.noPreference,
          ),
        },
      ],
    },
    {
      key: "tone",
      label: messages.profile.preferredTone,
      helper: messages.profile.preferredToneHelp,
      options: [
        { value: "", label: messages.profile.noPreference },
        {
          value: "formal",
          label: formatPreferenceOrFallback(
            "tone",
            "formal",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "friendly",
          label: formatPreferenceOrFallback(
            "tone",
            "friendly",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "direct",
          label: formatPreferenceOrFallback(
            "tone",
            "direct",
            locale,
            messages.profile.noPreference,
          ),
        },
      ],
    },
    {
      key: "explanation_style",
      label: messages.profile.preferredExplanationStyle,
      helper: messages.profile.preferredExplanationStyleHelp,
      options: [
        { value: "", label: messages.profile.noPreference },
        {
          value: "stepwise",
          label: formatPreferenceOrFallback(
            "explanation_style",
            "stepwise",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "concise",
          label: formatPreferenceOrFallback(
            "explanation_style",
            "concise",
            locale,
            messages.profile.noPreference,
          ),
        },
        {
          value: "exploratory",
          label: formatPreferenceOrFallback(
            "explanation_style",
            "exploratory",
            locale,
            messages.profile.noPreference,
          ),
        },
      ],
    },
  ] as const satisfies Array<{
    key: VisiblePreferenceKey;
    label: string;
    helper: string;
    options: Array<{ value: string; label: string }>;
  }>;

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);

      const [
        meResponse,
        profileResponse,
        predictionsResponse,
        preferencesResponse,
        consentResponse,
      ] = await Promise.all([
        authFetch("/api/users/me"),
        authFetch("/api/users/me/profile"),
        authFetch("/api/users/me/predictions"),
        authFetch("/api/users/me/preferences"),
        authFetch("/api/users/me/research-consent"),
      ]);

      if (
        !profileResponse.ok ||
        !meResponse.ok ||
        !preferencesResponse.ok ||
        !consentResponse.ok
      ) {
        if (active) {
          setError(messages.profile.errorLoad);
          setLoading(false);
        }
        return;
      }

      const [meJson, profileJson, preferencesJson, consentJson] = await Promise.all([
        meResponse.json() as Promise<MePayload>,
        profileResponse.json() as Promise<ProfilePayload>,
        preferencesResponse.json() as Promise<PreferencesPayload>,
        consentResponse.json() as Promise<ResearchConsentPayload>,
      ]);

      let predictionsJson: PredictionsPayload | null = null;
      if (predictionsResponse.ok) {
        predictionsJson = (await predictionsResponse.json()) as PredictionsPayload;
      }

      if (!active) return;

      setMe(meJson);
      setProfile(profileJson);
      setPreferences(preferencesJson);
      setResearchConsent(consentJson.consent);
      setPredictions(predictionsJson);
      setAccountNameDraft(meJson.name ?? "");
      setPreferencesDraft({ ...preferencesJson.declared });
      setAccountNotice(null);
      setPreferencesNotice(null);
      setError(null);
      setLoading(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [locale, messages.profile.errorLoad]);

  const eligibleRate = useMemo(() => {
    if (!profile || profile.dataQuality.attemptsTotal === 0) {
      return null;
    }
    return profile.dataQuality.attemptsLearningEligible / profile.dataQuality.attemptsTotal;
  }, [profile]);

  const accountDirty = (accountNameDraft.trim() || "") !== (me?.name?.trim() ?? "");
  const preferencesDirty = VISIBLE_PREFERENCE_KEYS.some(
    (key) => (preferencesDraft[key] ?? "") !== (preferences?.declared[key] ?? ""),
  );

  async function updateResearchConsent(consented: boolean) {
    setConsentPending(true);
    setConsentNotice(null);

    try {
      const response = await authFetch("/api/users/me/research-consent", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ consented }),
      });

      if (!response.ok) {
        throw new Error(messages.profile.researchConsentFailure);
      }

      const json = (await response.json()) as ResearchConsentPayload & { ok?: boolean };
      setResearchConsent(json.consent);
      setConsentNotice(
        consented
          ? messages.profile.researchConsentEnabled
          : messages.profile.researchConsentDisabled,
      );
    } catch (actionError) {
      setConsentNotice(
        actionError instanceof Error
          ? actionError.message
          : messages.profile.researchConsentFailure,
      );
    } finally {
      setConsentPending(false);
    }
  }

  async function saveAccount() {
    setAccountPending(true);
    setAccountNotice(null);

    try {
      const response = await authFetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: accountNameDraft.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as unknown;
        throw new Error(
          localizeErrorMessage(
            errorJson,
            locale,
            messages.profile.accountSaveFailed,
          ),
        );
      }

      const json = (await response.json()) as { ok: boolean; user: MePayload };
      setMe(json.user);
      setAccountNameDraft(json.user.name ?? "");
      setAccountNotice(messages.profile.accountSaved);
    } catch (actionError) {
      setAccountNotice(
        actionError instanceof Error
          ? actionError.message
          : messages.profile.accountSaveFailed,
      );
    } finally {
      setAccountPending(false);
    }
  }

  async function savePreferences() {
    if (!preferences) return;

    setPreferencesPending(true);
    setPreferencesNotice(null);

    try {
      const payload = {
        ...preferences.declared,
        ...preferencesDraft,
      };

      const response = await authFetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as unknown;
        throw new Error(
          localizeErrorMessage(
            errorJson,
            locale,
            messages.profile.preferencesSaveFailed,
          ),
        );
      }

      const json = (await response.json()) as {
        ok: boolean;
        declared: Record<string, string>;
      };
      setPreferences((current) =>
        current
          ? {
              ...current,
              declared: json.declared,
            }
          : current,
      );
      setPreferencesDraft({ ...json.declared });
      setPreferencesNotice(messages.profile.preferencesSaved);
    } catch (actionError) {
      setPreferencesNotice(
        actionError instanceof Error
          ? actionError.message
          : messages.profile.preferencesSaveFailed,
      );
    } finally {
      setPreferencesPending(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6" role="status" aria-live="polite">
        <p className="ui-title-md text-base">{messages.profile.loadingProfile}</p>
        <p className="ui-copy-sm mt-2">{messages.profile.loadingProfileBody}</p>
      </Card>
    );
  }

  if (error || !profile || !preferences || !me) {
    return (
      <Card variant="danger" className="p-6" role="alert">
        <p className="font-medium">{error ?? messages.profile.unavailable}</p>
        <p className="mt-2 text-sm">{messages.profile.unavailableNextStep}</p>
        <div className="mt-4">
          <Link className="sys-button-secondary" href="/learn">
            {messages.profile.openLearn}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Section>
      <Card variant="hero" className="p-6 sm:p-8">
        <p className="ui-eyebrow">
          {messages.shell.nav.profile}
        </p>
        <h2 className="ui-title-lg mt-3">{messages.profile.title}</h2>
        <p className="ui-copy-sm mt-2 max-w-3xl">
          {messages.profile.subtitle}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/learn"
            className="sys-button-primary"
          >
            {messages.profile.openLearn}
          </Link>
          <Link
            href="/practice"
            className="sys-button-secondary"
          >
            {messages.profile.openPractice}
          </Link>
          <Link
            href="/analytics"
            className="sys-button-secondary"
          >
            {messages.profile.openAnalytics}
          </Link>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewItems.map((item, index) => (
          <ProfileOverviewButton
            key={item.key}
            active={activeTab === item.key}
            label={item.label}
            body={item.body}
            pill={`${index + 1}`}
            onClick={() => setActiveTab(item.key)}
          />
        ))}
      </div>

      <Card variant="surface2" className="p-3">
        <div role="tablist" aria-label={messages.shell.nav.profile} className="flex flex-wrap gap-2">
          {tabItems.map((tab) => {
            const panelId = `profile-panel-${tab.key}`;
            const tabId = `profile-tab-${tab.key}`;
            return (
              <ProfileTabButton
                key={tab.key}
                active={activeTab === tab.key}
                label={tab.label}
                panelId={panelId}
                tabId={tabId}
                onClick={() => setActiveTab(tab.key)}
              />
            );
          })}
        </div>
      </Card>

      {activeTab === "account" ? (
        <div
          id="profile-panel-account"
          role="tabpanel"
          aria-labelledby="profile-tab-account"
          className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-lg font-semibold">{messages.profile.tabAccount}</h3>
            <p className="mt-3 text-sm text-slate-300">{messages.profile.accountEditHelp}</p>
            <div className="mt-6 grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {messages.profile.displayName}
                </span>
                <span className="text-xs text-slate-400">
                  {messages.profile.displayNameHelp}
                </span>
                <input
                  type="text"
                  value={accountNameDraft}
                  maxLength={120}
                  placeholder={messages.profile.displayNamePlaceholder}
                  className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-400"
                  onChange={(event) => setAccountNameDraft(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="sys-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!accountDirty || accountPending}
                onClick={saveAccount}
              >
                {accountPending
                  ? messages.profile.savingAccount
                  : messages.profile.saveAccount}
              </button>
              <p className="text-sm text-slate-300" role="status" aria-live="polite">
                {accountNotice ??
                  (!accountDirty ? messages.profile.noAccountChanges : "")}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">{messages.profile.accountAndContext}</h3>
              <div className="mt-4 grid gap-3">
                <DetailRow
                  label={messages.profile.displayName}
                  value={me.name ?? messages.common.notSet}
                />
                <DetailRow
                  label={messages.profile.email}
                  value={me.email ?? messages.common.notSet}
                />
                <DetailRow
                  label={messages.profile.memberSince}
                  value={new Date(profile.user.createdAt).toLocaleString(dateLocale)}
                />
                <DetailRow
                  label={messages.profile.structuredAttempts}
                  value={profile.dataQuality.attemptsTotal}
                />
                <DetailRow
                  label={messages.profile.adaptiveReadiness}
                  value={
                    me.personalizationReady ? messages.common.ready : messages.common.growing
                  }
                />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">
                {messages.profile.researchConsentAndTrainingEligibility}
              </h3>
              <div className="mt-4 grid gap-3">
                <DetailRow
                  label={messages.profile.consentStatus}
                  value={
                    researchConsent?.consentGranted
                      ? messages.common.granted
                      : messages.common.notGranted
                  }
                />
                <DetailRow
                  label={messages.profile.futureTrainingEligibility}
                  value={
                    researchConsent?.futureTrainingEligible
                      ? messages.common.eligible
                      : messages.common.excluded
                  }
                />
                <DetailRow
                  label={messages.profile.consentGrantedAt}
                  value={
                    researchConsent?.consentGrantedAtIso
                      ? new Date(researchConsent.consentGrantedAtIso).toLocaleString(
                          dateLocale,
                        )
                      : messages.common.notRecorded
                  }
                />
                <DetailRow
                  label={messages.profile.consentWithdrawnAt}
                  value={
                    researchConsent?.consentWithdrawnAtIso
                      ? new Date(researchConsent.consentWithdrawnAtIso).toLocaleString(
                          dateLocale,
                        )
                      : messages.common.notWithdrawn
                  }
                />
                <DetailRow
                  label={messages.profile.exclusionReason}
                  value={researchConsent?.exclusionReason ?? messages.common.none}
                />
                <DetailRow
                  label={messages.profile.consentVersion}
                  value={researchConsent?.consentVersion ?? messages.common.notRecorded}
                />
              </div>
              <p className="mt-4 text-xs text-slate-400">
                {messages.profile.withdrawConsentNote}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    consentPending || researchConsent?.futureTrainingEligible === true
                  }
                  onClick={() => updateResearchConsent(true)}
                >
                  {consentPending
                    ? messages.profile.savingConsent
                    : messages.profile.saveConsent}
                </button>
                <button
                  type="button"
                  className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={consentPending || researchConsent?.consentGranted !== true}
                  onClick={() => updateResearchConsent(false)}
                >
                  {messages.profile.withdrawConsent}
                </button>
              </div>
              {consentNotice ? (
                <p className="mt-3 text-sm text-slate-300" role="status" aria-live="polite">
                  {consentNotice}
                </p>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  {researchConsent?.consentGranted
                    ? messages.profile.consentAlreadyEnabled
                    : messages.profile.consentNotEnabled}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "accessibility" ? (
        <div
          id="profile-panel-accessibility"
          role="tabpanel"
          aria-labelledby="profile-tab-accessibility"
          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <h3 className="text-lg font-semibold">
            {messages.profile.tabAccessibility}
          </h3>
          <p className="mt-3 text-sm text-slate-300">
            {messages.profile.appearanceIntro}
          </p>
          <p className="mt-2 text-xs text-slate-400">{messages.profile.appearanceHelp}</p>
          <div className="mt-6 grid gap-5">
            <PreferenceOptionGroup
              label={messages.profile.appearanceTheme}
              helper={messages.profile.appearanceThemeHelp}
              value={theme}
              options={themeOptions}
              onChange={setTheme}
            />
            <PreferenceOptionGroup
              label={messages.profile.appearanceFontScale}
              helper={messages.profile.appearanceFontScaleHelp}
              value={fontScale}
              options={fontScaleOptions}
              onChange={setFontScale}
            />
            <PreferenceOptionGroup
              label={messages.profile.appearanceHighContrast}
              helper={messages.profile.appearanceHighContrastHelp}
              value={contrast}
              options={contrastOptions}
              onChange={setContrast}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "preferences" ? (
        <div
          id="profile-panel-preferences"
          role="tabpanel"
          aria-labelledby="profile-tab-preferences"
          className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
        >
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-lg font-semibold">{messages.profile.tabPreferences}</h3>
            <p className="mt-3 text-sm text-slate-300">{messages.profile.preferencesIntro}</p>
            <p className="mt-2 text-xs text-slate-400">{messages.profile.preferencesHelp}</p>
            <div className="mt-6 grid gap-5">
              {preferenceFields.map((field) => (
                <PreferenceOptionGroup
                  key={field.key}
                  label={field.label}
                  helper={field.helper}
                  value={(preferencesDraft[field.key] ?? "") as string}
                  options={field.options}
                  onChange={(value) =>
                    setPreferencesDraft((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="sys-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!preferencesDirty || preferencesPending}
                onClick={savePreferences}
              >
                {preferencesPending
                  ? messages.profile.savingPreferences
                  : messages.profile.savePreferences}
              </button>
              <p className="text-sm text-slate-300" role="status" aria-live="polite">
                {preferencesNotice ??
                  (!preferencesDirty ? messages.profile.noPreferenceChanges : "")}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-lg font-semibold">{messages.profile.savedPreferences}</h3>
            <p className="mt-3 text-sm text-slate-300">{messages.profile.preferencesHelp}</p>
            <div className="mt-4 grid gap-3">
              {preferenceFields.map((field) => (
                <div
                  key={`saved-${field.key}`}
                  className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <div className="flex justify-between gap-4 text-sm text-slate-300">
                    <span>{field.label}</span>
                    <span className="text-right">
                      {formatPreferenceOrFallback(
                        field.key,
                        preferences.declared[field.key],
                        locale,
                        messages.profile.noPreference,
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "system" ? (
        <div
          id="profile-panel-system"
          role="tabpanel"
          aria-labelledby="profile-tab-system"
          className="grid gap-4"
        >
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-lg font-semibold">{messages.profile.tabSystem}</h3>
            <p className="mt-3 text-sm text-slate-300">{messages.profile.systemReadOnly}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">{messages.profile.systemSummary}</h3>
              <div className="mt-4 grid gap-3">
                <DetailRow
                  label={messages.profile.currentDifficultyTarget}
                  value={
                    profile.pedagogy.currentDifficultyTarget
                      ? formatDifficultyLabel(
                          profile.pedagogy.currentDifficultyTarget,
                          locale,
                        )
                      : messages.common.notEnoughDataYet
                  }
                />
                <DetailRow
                  label={messages.profile.systemCurrentDepthTarget}
                  value={
                    predictions
                      ? formatPreferenceOrFallback(
                          "depth",
                          predictions.forTests.recommendedDecision.depth,
                          locale,
                          messages.common.notEnoughDataYet,
                        )
                      : messages.common.notEnoughDataYet
                  }
                />
                <DetailRow
                  label={messages.profile.nextDifficultySuggestion}
                  value={
                    predictions?.forTests.nextDifficultySuggestion.value
                      ? formatDifficultyLabel(
                          predictions.forTests.nextDifficultySuggestion.value,
                          locale,
                        )
                      : messages.common.notEnoughDataYet
                  }
                />
                <DetailRow
                  label={messages.profile.recentAccuracy}
                  value={
                    profile.pedagogy.recentAccuracy.sampleSize > 0
                      ? `${fmtPercent(
                          profile.pedagogy.recentAccuracy.value,
                          messages.common.notEnoughDataYet,
                          1,
                        )} (n=${profile.pedagogy.recentAccuracy.sampleSize})`
                      : messages.common.notEnoughDataYet
                  }
                />
                <DetailRow
                  label={messages.common.expectedTotalDuration}
                  value={
                    predictions
                      ? fmtMs(
                          predictions.forTests.predicted.expectedTotalDurationMs.value,
                          messages.common.notEnoughDataYet,
                          locale,
                        )
                      : messages.common.notEnoughDataYet
                  }
                />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold">{messages.profile.engagementSignals}</h3>
              <div className="mt-4 grid gap-3">
                <DetailRow
                  label={messages.profile.averageTotalDuration}
                  value={fmtMs(
                    profile.ux.engagement.avgTotalDurationMs,
                    messages.common.notEnoughDataYet,
                    locale,
                  )}
                />
                <DetailRow
                  label={messages.profile.averageFirstAnswerTime}
                  value={fmtMs(
                    profile.ux.engagement.avgPerQuestionFirstAnswerMs,
                    messages.common.notEnoughDataYet,
                    locale,
                  )}
                />
                <DetailRow
                  label={messages.profile.averageAnswerChanges}
                  value={
                    profile.ux.engagement.avgAnswerChangeCount == null
                      ? messages.common.notEnoughDataYet
                      : profile.ux.engagement.avgAnswerChangeCount.toFixed(2)
                  }
                />
              </div>
            </div>
          </div>

          <details className="ui-panel ui-panel-body">
            <summary className="cursor-pointer text-sm font-semibold text-text">
              {messages.profile.personalizationDetails}
            </summary>
            <p className="ui-copy-sm mt-3">{messages.profile.personalizationDetailsBody}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="ui-panel ui-panel-tight ui-panel-soft">
                <h3 className="ui-title-md text-base">{messages.profile.systemObservations}</h3>
                <div className="mt-4 grid gap-3">
                  <div className="ui-panel ui-panel-tight">
                    <div className="flex items-center justify-between gap-3">
                      <span>{formatAxisLabel("tone", locale)}</span>
                      <span>
                        {fmtTag({
                          axis: "tone",
                          cell: profile.ux.effectivePreferences.tone,
                          emptyText: messages.common.notEnoughDataYet,
                          locale,
                        })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ConfidenceBar value={profile.ux.effectivePreferences.tone.confidence} />
                    </div>
                  </div>
                  <div className="ui-panel ui-panel-tight">
                    <div className="flex items-center justify-between gap-3">
                      <span>{formatAxisLabel("explanation_style", locale)}</span>
                      <span>
                        {fmtTag({
                          axis: "explanation_style",
                          cell: profile.ux.effectivePreferences.explanation_style,
                          emptyText: messages.common.notEnoughDataYet,
                          locale,
                        })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ConfidenceBar
                        value={profile.ux.effectivePreferences.explanation_style.confidence}
                      />
                    </div>
                  </div>
                  <div className="ui-panel ui-panel-tight">
                    <div className="flex items-center justify-between gap-3">
                      <span>{messages.profile.practiceFormat}</span>
                      <span>
                        {fmtTag({
                          axis: "response_format",
                          cell: profile.ux.effectivePreferences.response_format,
                          emptyText: messages.common.notEnoughDataYet,
                          locale,
                        })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ConfidenceBar
                        value={profile.ux.effectivePreferences.response_format.confidence}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="ui-panel ui-panel-tight ui-panel-soft">
                <h3 className="ui-title-md text-base">{messages.profile.evidenceQuality}</h3>
                <div className="ui-detail-list mt-4">
                  <DetailRow
                    label={messages.profile.totalAttempts}
                    value={profile.dataQuality.attemptsTotal}
                  />
                  <DetailRow
                    label={messages.profile.learningEligibleShare}
                    value={fmtPercent(eligibleRate, messages.common.notEnoughDataYet)}
                  />
                  <DetailRow
                    label={messages.profile.excludedAttempts}
                    value={profile.dataQuality.attemptsExcluded}
                  />
                  <DetailRow
                    label={messages.profile.lastUpdated}
                    value={
                      profile.dataQuality.lastUpdatedAt
                        ? new Date(profile.dataQuality.lastUpdatedAt).toLocaleString(dateLocale)
                        : messages.common.notEnoughDataYet
                    }
                  />
                </div>
                <p className="ui-meta mt-4">
                  {profile.dataQuality.excludedReasonsTop.length > 0
                    ? `${messages.profile.topExclusions}: ${profile.dataQuality.excludedReasonsTop
                        .map(
                          (item) =>
                            `${formatLearningExclusionReasonLabel(item.reason, locale)} (${item.count})`,
                        )
                        .join(", ")}`
                    : messages.profile.noExcludedAttempts}
                </p>
              </div>
            </div>
          </details>

          <details className="ui-panel ui-panel-body">
            <summary className="cursor-pointer text-sm font-semibold text-text">
              {messages.profile.topicLearningHistory}
            </summary>
            <p className="ui-copy-sm mt-3">{messages.profile.topicLearningHistoryBody}</p>
            {profile.subjects.length === 0 ? (
              <div className="ui-panel ui-panel-tight ui-panel-soft mt-4">
                <p className="ui-copy-sm">{messages.common.notEnoughDataYet}.</p>
                <div className="mt-3">
                  <Link className="ui-action-secondary ui-action-sm" href="/learn">
                    {messages.profile.openLearn}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="ui-table-wrap mt-4">
                <table className="ui-table text-left">
                  <thead>
                    <tr>
                      <th>{messages.practice.topic}</th>
                      <th>{messages.profile.attempts}</th>
                      <th>{messages.profile.recentAccuracy}</th>
                      <th>{formatAxisLabel("difficulty_target", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.subjects.map((subject) => (
                      <tr key={subject.subjectId}>
                        <td>
                          <Link
                            className="underline underline-offset-2"
                            href={`/topics/${subject.subjectId}`}
                          >
                            {subject.subjectTitle}
                          </Link>
                          <p className="ui-meta mt-1">
                            {`${subject.isDefaultCollection ? `${messages.topics.topicGroupNameDefault} · ` : ""}${messages.common.learningUpdates}: ${subject.attemptsLearningEligible}, ${messages.profile.excludedAttempts}: ${subject.attemptsExcluded}`}
                          </p>
                        </td>
                        <td>{subject.attempts}</td>
                        <td>
                          {fmtPercent(
                            subject.recentAccuracy,
                            messages.common.notEnoughDataYet,
                            1,
                          )}
                          {subject.recentEvidenceCount > 0 ? (
                            <p className="ui-meta mt-1">
                              n={subject.recentEvidenceCount}
                            </p>
                          ) : null}
                        </td>
                        <td>
                          {subject.currentDifficultyTarget
                            ? formatDifficultyLabel(subject.currentDifficultyTarget, locale)
                            : messages.common.notEnoughDataYet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <details className="ui-panel ui-panel-body">
            <summary className="cursor-pointer text-sm font-semibold text-text">
              {messages.profile.notesTitle}
            </summary>
            <ul className="ui-copy-sm mt-4 list-disc space-y-2 pl-5">
              {profile.notes.whatThisMeans.map((note) => (
                <li key={note}>{note}</li>
              ))}
              {profile.notes.limitations.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </Section>
  );
}
