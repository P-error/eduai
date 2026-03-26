import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  loadPredictionBacktestRows,
  type BacktestAttemptRow,
} from "@/lib/prediction-backtest";
import { optionalEnv, requireEnvWithDevFallback } from "@/lib/env";
import { getActivePredictionModelParams } from "@/lib/prediction-params";

export const DATASET_VERSION = "eduai_dataset_v1_2026_02";

const DEFAULT_TIME_RANGE_DAYS = 30;
const DEFAULT_MAX_ATTEMPTS = 5000;
const MAX_MAX_ATTEMPTS = 10_000;
const RECENT_HISTORY_WINDOW = 10;

type ExportFormat = "jsonl" | "csv";

export type DatasetExportOptions = {
  timeRangeDays?: number;
  maxAttempts?: number;
  eligibleOnly?: boolean;
  consentOnly?: boolean;
  format?: ExportFormat;
};

type NormalizedDatasetExportOptions = {
  timeRangeDays: number;
  maxAttempts: number;
  eligibleOnly: boolean;
  consentOnly: boolean;
  format: ExportFormat;
};

type UserConsentMeta = {
  researchConsentAt: Date | null;
  researchConsentVersion: string | null;
};

type ExportHistoryState = {
  totalQuestions: number;
  correctQuestions: number;
  recentAccuracies: number[];
  recentDurationPerQuestion: number[];
  lastAttemptAt: Date | null;
};

export type DatasetExportRecord = {
  datasetVersion: string;
  generatedAtIso: string;
  userKey: string;
  subjectKey: string;
  policyId: string | null;
  predictorVersion: string | null;
  learningEligible: boolean | null;
  consentGranted: boolean;
  consentVersion: string | null;
  difficultyTarget: string | null;
  responseFormat: string | null;
  questionCount: number;
  userHistory_totalQuestionsBefore: number;
  userHistory_recentAccuracy: number | null;
  userHistory_betaPosteriorMean: number | null;
  userHistory_recentDurationPerQuestion: number | null;
  timeSinceLastAttemptSec: number | null;
  actualAccuracy: number | null;
  actualTotalDurationMs: number | null;
};

type BuildRecordsResult = {
  records: DatasetExportRecord[];
  counts: {
    scanned: number;
    exported: number;
    filteredByEligibility: number;
    filteredByConsent: number;
  };
};

export type DatasetExportResult = {
  datasetVersion: string;
  generatedAtIso: string;
  format: ExportFormat;
  filters: NormalizedDatasetExportOptions;
  counts: BuildRecordsResult["counts"];
  timeRange: {
    days: number;
    since: string;
    until: string;
  };
  content: string;
};

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeOptions(options: DatasetExportOptions): NormalizedDatasetExportOptions {
  const format = options.format === "csv" ? "csv" : "jsonl";
  return {
    timeRangeDays: parsePositiveInt(
      options.timeRangeDays,
      DEFAULT_TIME_RANGE_DAYS,
      1,
      365,
    ),
    maxAttempts: parsePositiveInt(
      options.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
      1,
      MAX_MAX_ATTEMPTS,
    ),
    eligibleOnly: options.eligibleOnly !== false,
    consentOnly: options.consentOnly !== false,
    format,
  };
}

function parsePredictionMeta(byTagJson: unknown) {
  const root =
    byTagJson && typeof byTagJson === "object"
      ? (byTagJson as Record<string, unknown>)
      : {};
  const meta =
    root._meta && typeof root._meta === "object"
      ? (root._meta as Record<string, unknown>)
      : {};
  const policy =
    meta.policy && typeof meta.policy === "object"
      ? (meta.policy as Record<string, unknown>)
      : {};
  const prediction =
    meta.prediction && typeof meta.prediction === "object"
      ? (meta.prediction as Record<string, unknown>)
      : {};

  const policyIdFromPrediction =
    typeof prediction.policyId === "string" ? prediction.policyId : null;
  const policyIdFromPolicy =
    typeof policy.policyId === "string" ? policy.policyId : null;

  return {
    policyId: policyIdFromPrediction ?? policyIdFromPolicy,
    predictorVersion:
      typeof prediction.predictorVersion === "string"
        ? prediction.predictorVersion
        : null,
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pseudonymize(secret: string, prefix: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${prefix}:${value}`)
    .digest("hex")
    .slice(0, 24);
}

function resolveSecret() {
  const datasetSecret = optionalEnv("DATASET_EXPORT_SECRET");
  if (datasetSecret) return datasetSecret;
  return requireEnvWithDevFallback("JWT_SECRET", "dev-secret");
}

function normalizeDurationPerQuestion(row: BacktestAttemptRow) {
  if (
    row.actualTotalDurationMs != null &&
    Number.isFinite(row.actualTotalDurationMs) &&
    row.actualTotalDurationMs > 0 &&
    row.questionCount > 0
  ) {
    return row.actualTotalDurationMs / row.questionCount;
  }
  return null;
}

function newHistoryState(): ExportHistoryState {
  return {
    totalQuestions: 0,
    correctQuestions: 0,
    recentAccuracies: [],
    recentDurationPerQuestion: [],
    lastAttemptAt: null,
  };
}

function pushBounded(list: number[], value: number, limit: number) {
  list.push(value);
  if (list.length > limit) {
    list.shift();
  }
}

function secondsBetween(older: Date | null, newer: Date) {
  if (!older) return null;
  return Math.max(0, Math.floor((newer.getTime() - older.getTime()) / 1000));
}

function normalizeRows(rows: BacktestAttemptRow[]) {
  return [...rows].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    if (diff !== 0) return diff;
    return a.attemptId.localeCompare(b.attemptId);
  });
}

export function buildDatasetExportRecordsFromRows(params: {
  rows: BacktestAttemptRow[];
  consentByUserId: Map<string, UserConsentMeta>;
  generatedAtIso: string;
  options: Pick<NormalizedDatasetExportOptions, "eligibleOnly" | "consentOnly">;
  betaA?: number;
  betaB?: number;
  secret?: string;
}): BuildRecordsResult {
  const {
    rows,
    consentByUserId,
    generatedAtIso,
    options,
    betaA = 1,
    betaB = 1,
    secret = resolveSecret(),
  } = params;

  const orderedRows = normalizeRows(rows);
  const historyByUser = new Map<string, ExportHistoryState>();
  const records: DatasetExportRecord[] = [];

  const counts = {
    scanned: 0,
    exported: 0,
    filteredByEligibility: 0,
    filteredByConsent: 0,
  };

  for (const row of orderedRows) {
    counts.scanned += 1;

    const history = historyByUser.get(row.userId) ?? newHistoryState();
    const consent = consentByUserId.get(row.userId) ?? {
      researchConsentAt: null,
      researchConsentVersion: null,
    };
    const consentGranted = Boolean(consent.researchConsentAt);

    const includeByEligibility = !options.eligibleOnly || row.learningEligible === true;
    const includeByConsent = !options.consentOnly || consentGranted;

    if (!includeByEligibility) {
      counts.filteredByEligibility += 1;
    }
    if (!includeByConsent) {
      counts.filteredByConsent += 1;
    }

    if (includeByEligibility && includeByConsent) {
      const meta = parsePredictionMeta(row.byTagJson);
      const userHistoryRecentAccuracy = average(history.recentAccuracies);
      const userHistoryRecentDurationPerQuestion = average(
        history.recentDurationPerQuestion,
      );
      const userHistoryBetaPosteriorMean =
        history.totalQuestions > 0
          ? (betaA + history.correctQuestions) /
            (betaA + betaB + history.totalQuestions)
          : null;

      records.push({
        datasetVersion: DATASET_VERSION,
        generatedAtIso,
        userKey: pseudonymize(secret, "user", row.userId),
        subjectKey: pseudonymize(secret, "subject", row.subjectId),
        policyId: meta.policyId,
        predictorVersion: meta.predictorVersion,
        learningEligible: row.learningEligible,
        consentGranted,
        consentVersion: consent.researchConsentVersion,
        difficultyTarget: row.difficultyTarget,
        responseFormat: row.responseFormat,
        questionCount: row.questionCount,
        userHistory_totalQuestionsBefore: history.totalQuestions,
        userHistory_recentAccuracy: userHistoryRecentAccuracy,
        userHistory_betaPosteriorMean:
          userHistoryBetaPosteriorMean == null
            ? null
            : clamp01(userHistoryBetaPosteriorMean),
        userHistory_recentDurationPerQuestion: userHistoryRecentDurationPerQuestion,
        timeSinceLastAttemptSec: secondsBetween(history.lastAttemptAt, row.createdAt),
        actualAccuracy: row.actualAccuracy,
        actualTotalDurationMs: row.actualTotalDurationMs,
      });
      counts.exported += 1;
    }

    // Build history strictly from earlier learning-eligible attempts only.
    if (row.learningEligible === true) {
      if (row.actualAccuracy != null) {
        const boundedAccuracy = clamp01(row.actualAccuracy);
        const correctCountApprox = Math.round(boundedAccuracy * row.questionCount);
        history.correctQuestions += Math.max(
          0,
          Math.min(row.questionCount, correctCountApprox),
        );
        pushBounded(history.recentAccuracies, boundedAccuracy, RECENT_HISTORY_WINDOW);
      }

      history.totalQuestions += row.questionCount;

      const durationPerQuestion = normalizeDurationPerQuestion(row);
      if (durationPerQuestion != null) {
        pushBounded(
          history.recentDurationPerQuestion,
          durationPerQuestion,
          RECENT_HISTORY_WINDOW,
        );
      }

      history.lastAttemptAt = row.createdAt;
    }

    historyByUser.set(row.userId, history);
  }

  return {
    records,
    counts,
  };
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function valueToCsvCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return csvEscape(String(value));
}

function toCsv(records: DatasetExportRecord[]) {
  const columns: Array<keyof DatasetExportRecord> = [
    "datasetVersion",
    "generatedAtIso",
    "userKey",
    "subjectKey",
    "policyId",
    "predictorVersion",
    "learningEligible",
    "consentGranted",
    "consentVersion",
    "difficultyTarget",
    "responseFormat",
    "questionCount",
    "userHistory_totalQuestionsBefore",
    "userHistory_recentAccuracy",
    "userHistory_betaPosteriorMean",
    "userHistory_recentDurationPerQuestion",
    "timeSinceLastAttemptSec",
    "actualAccuracy",
    "actualTotalDurationMs",
  ];

  const lines = [columns.join(",")];
  for (const record of records) {
    const cells = columns.map((column) => valueToCsvCell(record[column]));
    lines.push(cells.join(","));
  }

  return `${lines.join("\n")}\n`;
}

function toJsonl(records: DatasetExportRecord[]) {
  if (records.length === 0) return "";
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export async function getAdminDatasetExport(
  prisma: PrismaClient,
  options: DatasetExportOptions = {},
): Promise<DatasetExportResult> {
  const normalized = normalizeOptions(options);
  const generatedAtIso = new Date().toISOString();
  const activeParams = getActivePredictionModelParams();

  const loaded = await loadPredictionBacktestRows(prisma, {
    timeRangeDays: normalized.timeRangeDays,
    maxAttempts: normalized.maxAttempts,
    includeExcluded: true,
    includeUnknownEligibility: true,
  });

  const userIds = [...new Set(loaded.rows.map((row) => row.userId))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            researchConsentAt: true,
            researchConsentVersion: true,
          },
        })
      : [];

  const consentByUserId = new Map<string, UserConsentMeta>(
    users.map((user) => [
      user.id,
      {
        researchConsentAt: user.researchConsentAt,
        researchConsentVersion: user.researchConsentVersion,
      },
    ]),
  );

  const built = buildDatasetExportRecordsFromRows({
    rows: loaded.rows,
    consentByUserId,
    generatedAtIso,
    options: {
      eligibleOnly: normalized.eligibleOnly,
      consentOnly: normalized.consentOnly,
    },
    betaA: activeParams.betaA,
    betaB: activeParams.betaB,
  });

  return {
    datasetVersion: DATASET_VERSION,
    generatedAtIso,
    format: normalized.format,
    filters: normalized,
    counts: built.counts,
    timeRange: loaded.timeRange,
    content: normalized.format === "csv" ? toCsv(built.records) : toJsonl(built.records),
  };
}

export function runDatasetExportSyntheticSelfCheck() {
  const generatedAtIso = "2026-02-12T00:00:00.000Z";
  const consentByUserId = new Map<string, UserConsentMeta>([
    [
      "u1",
      {
        researchConsentAt: new Date("2026-01-01T00:00:00.000Z"),
        researchConsentVersion: "v1_2026_02",
      },
    ],
    [
      "u2",
      {
        researchConsentAt: null,
        researchConsentVersion: null,
      },
    ],
  ]);

  const rows: BacktestAttemptRow[] = [
    {
      attemptId: "a1",
      userId: "u1",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      subjectId: "s1",
      questionCount: 2,
      difficultyTarget: "medium",
      responseFormat: "mcq",
      score: 1,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          policy: { policyId: "v2_personalized" },
          prediction: {
            policyId: "v2_accuracy_beta_duration_unified",
            predictorVersion: "v3_duration_unified_2026_02",
          },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [5_000, 12_000],
      actualAccuracy: 1,
      actualTotalDurationMs: 20_000,
      loggedPrediction: {
        expectedAccuracy: 0.8,
        expectedTotalDurationMs: 18_000,
        durationConfidence: 0.2,
        durationBasis: "baseline_only",
        predictorVersion: "v3_duration_unified_2026_02",
      },
    },
    {
      attemptId: "a2",
      userId: "u1",
      createdAt: new Date("2026-01-02T10:00:00.000Z"),
      subjectId: "s1",
      questionCount: 2,
      difficultyTarget: "hard",
      responseFormat: "mcq",
      score: 0,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          prediction: {
            policyId: "v2_accuracy_beta_duration_unified",
            predictorVersion: "v3_duration_unified_2026_02",
          },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [7_000, 18_000],
      actualAccuracy: 0,
      actualTotalDurationMs: 40_000,
      loggedPrediction: {
        expectedAccuracy: 0.7,
        expectedTotalDurationMs: 32_000,
        durationConfidence: 0.5,
        durationBasis: "v3_duration_unified_2026_02|blend",
        predictorVersion: "v3_duration_unified_2026_02",
      },
    },
    {
      attemptId: "a3",
      userId: "u2",
      createdAt: new Date("2026-01-03T10:00:00.000Z"),
      subjectId: "s2",
      questionCount: 3,
      difficultyTarget: "easy",
      responseFormat: "mcq",
      score: 1,
      byTagJson: {
        _meta: {
          learning: { eligible: true },
          prediction: {
            policyId: "v2_accuracy_beta_duration_unified",
            predictorVersion: "v3_duration_unified_2026_02",
          },
        },
      },
      learningEligible: true,
      perQuestionFirstAnswerMsJson: [4_000, 10_000, 20_000],
      actualAccuracy: 1,
      actualTotalDurationMs: 24_000,
      loggedPrediction: {
        expectedAccuracy: 0.75,
        expectedTotalDurationMs: 20_000,
        durationConfidence: 0.1,
        durationBasis: "baseline_only",
        predictorVersion: "v3_duration_unified_2026_02",
      },
    },
  ];

  const built = buildDatasetExportRecordsFromRows({
    rows,
    consentByUserId,
    generatedAtIso,
    options: {
      eligibleOnly: true,
      consentOnly: true,
    },
    betaA: 1,
    betaB: 1,
    secret: "self-check-secret",
  });

  if (built.records.length !== 2) {
    throw new Error(
      `self-check failed: expected 2 exported records, got ${built.records.length}`,
    );
  }

  const first = built.records[0];
  const second = built.records[1];

  if (first.userHistory_totalQuestionsBefore !== 0) {
    throw new Error("self-check failed: first record must have zero history");
  }

  if (second.userHistory_totalQuestionsBefore !== 2) {
    throw new Error(
      `self-check failed: expected second history questions=2, got ${second.userHistory_totalQuestionsBefore}`,
    );
  }

  if (second.userHistory_recentAccuracy == null || Math.abs(second.userHistory_recentAccuracy - 1) > 1e-9) {
    throw new Error("self-check failed: second recent accuracy must be 1 from attempt #1 only");
  }

  if (
    second.userHistory_betaPosteriorMean == null ||
    Math.abs(second.userHistory_betaPosteriorMean - 0.75) > 1e-9
  ) {
    throw new Error(
      `self-check failed: expected beta posterior 0.75, got ${second.userHistory_betaPosteriorMean}`,
    );
  }

  if (built.records.some((record) => record.consentGranted !== true)) {
    throw new Error("self-check failed: consent filter leaked non-consenting records");
  }

  return {
    ok: true,
    exported: built.records.length,
    scanned: built.counts.scanned,
    checks: {
      consentFilter: true,
      noFutureLeakage: true,
    },
    note: "Record #2 features depend only on attempts strictly earlier than #2.",
  };
}
