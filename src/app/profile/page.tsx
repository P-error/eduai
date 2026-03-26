"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-auth";
import { TARGET_SCORE_BAND } from "@/lib/tags";

type ConfidenceCell = {
  bestTag: string | null;
  confidence: number;
  sampleSize: number;
};

type ProfilePayload = {
  user: { id: string; createdAt: string };
  dataQuality: {
    attemptsTotal: number;
    attemptsLearningEligible: number;
    attemptsExcluded: number;
    excludedReasonsTop: Array<{ reason: string; count: number }>;
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
    recentAccuracy: number | null;
    currentDifficultyTarget: "easy" | "medium" | "hard" | null;
  }>;
  notes: {
    whatThisMeans: string[];
    limitations: string[];
  };
};

type PredictionsPayload = {
  forTests: {
    predicted: {
      expectedAccuracy: { value: number | null; confidence: number; basis: string };
      expectedTotalDurationMs: {
        value: number | null;
        confidence: number;
        basis: string;
      };
    };
    nextDifficultySuggestion: { value: "easy" | "medium" | "hard" | null; reason: string };
  };
  notes: {
    disclaimer: string[];
  };
};

function fmtPercent(value: number | null, digits = 0) {
  if (value == null) return "Not enough data yet";
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtMs(value: number | null) {
  if (value == null) return "Not enough data yet";
  return `${Math.round(value)} ms`;
}

function fmtTag(cell: ConfidenceCell | undefined) {
  if (!cell || !cell.bestTag || cell.sampleSize === 0) return "Not enough data yet";
  return `${cell.bestTag} (conf ${cell.confidence.toFixed(2)}, n=${cell.sampleSize})`;
}

function ConfidenceBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-slate-200" style={{ width: `${width}%` }} />
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [predictions, setPredictions] = useState<PredictionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const [profileResponse, predictionsResponse] = await Promise.all([
        authFetch("/api/users/me/profile"),
        authFetch("/api/users/me/predictions"),
      ]);
      if (!profileResponse.ok) {
        if (active) {
          setError("Failed to load profile.");
          setLoading(false);
        }
        return;
      }
      const json = (await profileResponse.json()) as ProfilePayload;
      if (active) {
        setProfile(json);
        if (predictionsResponse.ok) {
          const predictionsJson =
            (await predictionsResponse.json()) as PredictionsPayload;
          setPredictions(predictionsJson);
        }
        setLoading(false);
      }
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Loading learning profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-slate-900/60 p-6">
        <p>{error ?? "Profile unavailable."}</p>
      </div>
    );
  }

  const eligibleRate =
    profile.dataQuality.attemptsTotal > 0
      ? profile.dataQuality.attemptsLearningEligible / profile.dataQuality.attemptsTotal
      : null;

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Learning profile (v2)</h2>
        <p className="mt-2 text-sm text-slate-300">
          Transparent profile of your UX and pedagogy signals. Confidence is
          conservative and depends on sample size.
        </p>
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/practice"
              className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
            >
              Practice now
            </Link>
            <Link
              href="/learn"
              className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm"
            >
              Ask in chat
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Overview</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <div className="flex justify-between"><span>Total attempts</span><span>{profile.dataQuality.attemptsTotal}</span></div>
          <div className="flex justify-between"><span>Learning-eligible</span><span>{fmtPercent(eligibleRate)}</span></div>
          <div className="flex justify-between"><span>Excluded attempts</span><span>{profile.dataQuality.attemptsExcluded}</span></div>
          <div className="flex justify-between"><span>Last updated</span><span>{profile.dataQuality.lastUpdatedAt ? new Date(profile.dataQuality.lastUpdatedAt).toLocaleString() : "Not enough data yet"}</span></div>
        </div>
        <div className="mt-3 text-xs text-slate-400">
          {profile.dataQuality.excludedReasonsTop.length > 0
            ? `Top exclusions: ${profile.dataQuality.excludedReasonsTop
                .map((item) => `${item.reason} (${item.count})`)
                .join(", ")}`
            : "No excluded attempts yet."}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">How you learn best</h3>
        <div className="mt-3 grid gap-3 text-sm text-slate-300">
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span>Tone</span>
              <span>{fmtTag(profile.ux.effectivePreferences.tone)}</span>
            </div>
            <div className="mt-2">
              <ConfidenceBar value={profile.ux.effectivePreferences.tone.confidence} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span>Explanation style</span>
              <span>{fmtTag(profile.ux.effectivePreferences.explanation_style)}</span>
            </div>
            <div className="mt-2">
              <ConfidenceBar value={profile.ux.effectivePreferences.explanation_style.confidence} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span>Response format</span>
              <span>{fmtTag(profile.ux.effectivePreferences.response_format)}</span>
            </div>
            <div className="mt-2">
              <ConfidenceBar value={profile.ux.effectivePreferences.response_format.confidence} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Your current level</h3>
        <div className="mt-2 grid gap-2 text-sm text-slate-300">
          <div className="flex justify-between"><span>Current difficulty target</span><span>{profile.pedagogy.currentDifficultyTarget ?? "Not enough data yet"}</span></div>
          <div className="flex justify-between"><span>Target band</span><span>{profile.pedagogy.band.low.toFixed(2)}-{profile.pedagogy.band.high.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Recent accuracy</span><span>{profile.pedagogy.recentAccuracy.sampleSize > 0 ? `${fmtPercent(profile.pedagogy.recentAccuracy.value, 1)} (n=${profile.pedagogy.recentAccuracy.sampleSize})` : "Not enough data yet"}</span></div>
          <div className="flex justify-between"><span>Cognitive process</span><span>{fmtTag(profile.pedagogy.effectivePreferences.cognitive_process)}</span></div>
          <div className="flex justify-between"><span>Task family</span><span>{fmtTag(profile.pedagogy.effectivePreferences.task_family)}</span></div>
          <div className="flex justify-between"><span>Context</span><span>{fmtTag(profile.pedagogy.effectivePreferences.context)}</span></div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Engagement</h3>
        <div className="mt-2 grid gap-2 text-sm text-slate-300">
          <div className="flex justify-between"><span>Average total duration</span><span>{fmtMs(profile.ux.engagement.avgTotalDurationMs)}</span></div>
          <div className="flex justify-between"><span>Average first-answer time</span><span>{fmtMs(profile.ux.engagement.avgPerQuestionFirstAnswerMs)}</span></div>
          <div className="flex justify-between"><span>Average answer changes</span><span>{profile.ux.engagement.avgAnswerChangeCount == null ? "Not enough data yet" : profile.ux.engagement.avgAnswerChangeCount.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Predictions</h3>
        {!predictions ? (
          <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
        ) : (
          <div className="mt-2 grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between">
              <span>Expected accuracy</span>
              <span>
                {fmtPercent(predictions.forTests.predicted.expectedAccuracy.value, 1)}
                {" "}
                (conf {predictions.forTests.predicted.expectedAccuracy.confidence.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between">
              <span>Expected total duration</span>
              <span>
                {fmtMs(predictions.forTests.predicted.expectedTotalDurationMs.value)}
                {" "}
                (conf {predictions.forTests.predicted.expectedTotalDurationMs.confidence.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between">
              <span>Next difficulty suggestion</span>
              <span>{predictions.forTests.nextDifficultySuggestion.value ?? "Not enough data yet"}</span>
            </div>
            <p className="text-xs text-slate-400">
              Predictions are heuristic proxies based on your recent activity.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Per-subject summary</h3>
        {profile.subjects.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2">Subject</th>
                  <th className="pb-2">Attempts</th>
                  <th className="pb-2">Recent accuracy</th>
                  <th className="pb-2">Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {profile.subjects.map((subject) => (
                  <tr key={subject.subjectId} className="border-t border-slate-800 text-slate-300">
                    <td className="py-2">{subject.subjectTitle}</td>
                    <td className="py-2">{subject.attempts}</td>
                    <td className="py-2">{fmtPercent(subject.recentAccuracy, 1)}</td>
                    <td className="py-2">{subject.currentDifficultyTarget ?? "Not enough data yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold">Notes and limitations</h3>
        <p className="mt-2 text-xs text-slate-400">
          Difficulty band: {TARGET_SCORE_BAND.low.toFixed(2)}-{TARGET_SCORE_BAND.high.toFixed(2)}.
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          What this means
        </p>
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-300">
          {profile.notes.whatThisMeans.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Limitations
        </p>
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-300">
          {profile.notes.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
