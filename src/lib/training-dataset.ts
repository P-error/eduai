import { createHmac } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { summarizeEvaluationEpisode } from "@/lib/evaluation";
import { optionalEnv, requireEnvWithDevFallback } from "@/lib/env";
import {
  buildEduAiNativePedagogyArtifactSlotMetadata,
  resolveEduAiNativePedagogyArtifactMetadataPath,
  resolveEduAiNativePedagogyArtifactPath,
} from "@/lib/model-artifact-slot";
import {
  DEFAULT_TRAINING_DATASET_PHASE,
  TRAINING_DATASET_FILE_FORMAT,
  TRAINING_DATASET_MANIFEST_VERSION,
  TRAINING_DATASET_METADATA_VERSION,
  TRAINING_DATASET_PHASE_ROOTS,
  TRAINING_DATASET_PREFERRED_FUTURE_FORMAT,
  TRAINING_DATASET_SCHEMA_VERSION,
  type TrainingDatasetPhase,
  type TrainingDatasetSchemaColumn,
  normalizeTrainingDatasetPhase,
} from "@/lib/training-dataset-contract";
import { getTrainingEligibilitySnapshot } from "@/lib/training-eligibility";

const DEFAULT_TIME_RANGE_DAYS = 365;
const DEFAULT_MAX_EPISODES = 5_000;

type TrainingDatasetExportOptions = {
  phase?: TrainingDatasetPhase | null;
  timeRangeDays?: number;
  maxEpisodes?: number;
  completedOnly?: boolean;
  consentOnly?: boolean;
  outputRoot?: string | null;
  generatedAtIso?: string | null;
};

type NormalizedTrainingDatasetExportOptions = {
  phase: TrainingDatasetPhase;
  timeRangeDays: number;
  maxEpisodes: number;
  completedOnly: boolean;
  consentOnly: boolean;
  outputRoot: string | null;
  generatedAtIso: string;
};

type TrainingDatasetRecord = {
  schemaVersion: string;
  snapshotPhase: TrainingDatasetPhase;
  snapshotExportedAtIso: string;
  datasetPhase: TrainingDatasetPhase;
  datasetOrigin: string;
  learnerRef: string;
  episodeRef: string;
  stepRef: string;
  contentRef: string;
  linkedContentRef: string | null;
  subjectRef: string | null;
  sectionRef: string | null;
  consentGranted: boolean;
  consentVersion: string | null;
  consentWithdrawnAtIso: string | null;
  futureTrainingEligible: boolean;
  excludedFromFutureTraining: boolean;
  excludedFromFutureTrainingAtIso: string | null;
  trainingExclusionReason: string | null;
  episodeStatus: string;
  episodeObjectiveKey: string;
  episodeProtocolKey: string;
  episodePolicyArm: string;
  assignmentSource: string | null;
  selectionMode: string | null;
  personalizationMode: string | null;
  policyMode: string | null;
  policyId: string | null;
  assignmentRuntimePolicyId: string | null;
  assignmentBackendKind: string | null;
  assignmentBackendId: string | null;
  topic: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  familyKey: string | null;
  sequenceIndex: number;
  sequenceRole: string;
  touchpointType: string;
  contentKind: string;
  signalQuality: string;
  itemRole: string;
  itemVariant: string;
  linkageKind: string;
  holdoutStrategy: string;
  delayedMinutes: number | null;
  deliveredDifficulty: string | null;
  deliveredDepth: string | null;
  decisionRuntimePolicyId: string | null;
  decisionBackendKind: string | null;
  decisionBackendId: string | null;
  episodeCreatedAtIso: string;
  deliveredAtIso: string;
  outcomeRecordedAtIso: string | null;
  episodeExpectedSequenceJson: string;
  episodeCompletedSequenceJson: string;
  episodeMissingSequenceJson: string;
  episodePrimaryOutcomeCount: number;
  outcomeAttemptRef: string | null;
  outcomeAccuracy: number | null;
  outcomeQuestionCount: number | null;
  outcomeTotalDurationMs: number | null;
  outcomeLearningEligible: boolean | null;
  episodePrecheckAccuracy: number | null;
  episodePostcheckAccuracy: number | null;
  episodeHoldoutAccuracy: number | null;
  episodeDelayedRecheckAccuracy: number | null;
  labelPostcheckMinusPrecheck: number | null;
  labelHoldoutMinusPrecheck: number | null;
  labelDelayedRecheckMinusPrecheck: number | null;
  labelNextPrimaryOutcomeRole: string | null;
  labelNextPrimaryOutcomeAccuracy: number | null;
  labelNextPrimaryOutcomeDurationMs: number | null;
};

type TrainingDatasetCounts = {
  scannedEpisodes: number;
  exportedEpisodes: number;
  exportedRows: number;
  filteredByConsent: number;
  filteredByStatus: number;
  filteredByPrimaryOutcomes: number;
  filteredItemsMissingDecision: number;
  rowsBySequenceRole: Record<string, number>;
  rowsByDatasetOrigin: Record<string, number>;
};

type TrainingDatasetSnapshot = {
  schemaVersion: typeof TRAINING_DATASET_SCHEMA_VERSION;
  generatedAtIso: string;
  phase: TrainingDatasetPhase;
  format: typeof TRAINING_DATASET_FILE_FORMAT;
  preferredFutureFormat: typeof TRAINING_DATASET_PREFERRED_FUTURE_FORMAT;
  filters: {
    phase: TrainingDatasetPhase;
    timeRangeDays: number;
    maxEpisodes: number;
    completedOnly: boolean;
    consentOnly: boolean;
  };
  timeRange: {
    since: string;
    until: string;
  };
  counts: TrainingDatasetCounts;
  records: TrainingDatasetRecord[];
  schema: TrainingDatasetSchemaColumn[];
};

export type TrainingDatasetExportResult = {
  snapshotId: string;
  snapshotDir: string;
  phaseRoot: string;
  snapshot: TrainingDatasetSnapshot;
  files: {
    dataset: { path: string; bytes: number };
    schema: { path: string; bytes: number };
    metadata: { path: string; bytes: number };
    manifest: { path: string; bytes: number };
  };
};

const TRAINING_DATASET_SCHEMA_COLUMNS: TrainingDatasetSchemaColumn[] = [
  {
    name: "schemaVersion",
    type: "string",
    nullable: false,
    description: "Canonical training dataset schema version.",
  },
  {
    name: "snapshotPhase",
    type: "string",
    nullable: false,
    description: "Phase root used for the current snapshot export.",
  },
  {
    name: "snapshotExportedAtIso",
    type: "datetime",
    nullable: false,
    description: "Snapshot export timestamp.",
  },
  {
    name: "datasetPhase",
    type: "string",
    nullable: false,
    description: "Operational phase marker stored on the evaluation episode.",
  },
  {
    name: "datasetOrigin",
    type: "string",
    nullable: false,
    description: "Operational origin marker stored on the evaluation episode.",
  },
  {
    name: "learnerRef",
    type: "string",
    nullable: false,
    description: "Stable pseudonymous learner reference.",
  },
  {
    name: "episodeRef",
    type: "string",
    nullable: false,
    description: "Stable pseudonymous episode reference.",
  },
  {
    name: "stepRef",
    type: "string",
    nullable: false,
    description: "Stable pseudonymous episode-item reference.",
  },
  {
    name: "contentRef",
    type: "string",
    nullable: false,
    description: "Stable pseudonymous delivered artifact reference.",
  },
  {
    name: "linkedContentRef",
    type: "string",
    nullable: true,
    description: "Stable pseudonymous linkage target when the step points to earlier content.",
  },
  {
    name: "subjectRef",
    type: "string",
    nullable: true,
    description: "Stable pseudonymous subject reference.",
  },
  {
    name: "sectionRef",
    type: "string",
    nullable: true,
    description: "Stable pseudonymous section reference.",
  },
  {
    name: "consentGranted",
    type: "boolean",
    nullable: false,
    description: "Research consent flag at export time.",
  },
  {
    name: "consentVersion",
    type: "string",
    nullable: true,
    description: "Stored research consent version.",
  },
  {
    name: "consentWithdrawnAtIso",
    type: "datetime",
    nullable: true,
    description: "Timestamp of consent withdrawal when future training is disabled.",
  },
  {
    name: "futureTrainingEligible",
    type: "boolean",
    nullable: false,
    description: "Whether the learner remains eligible for future training/export inclusion.",
  },
  {
    name: "excludedFromFutureTraining",
    type: "boolean",
    nullable: false,
    description: "Explicit exclusion flag for future training/model-building datasets.",
  },
  {
    name: "excludedFromFutureTrainingAtIso",
    type: "datetime",
    nullable: true,
    description: "Timestamp when explicit future-training exclusion was recorded.",
  },
  {
    name: "trainingExclusionReason",
    type: "string",
    nullable: true,
    description: "Explicit reason why the learner is excluded from future training export.",
  },
  {
    name: "episodeStatus",
    type: "string",
    nullable: false,
    description: "Episode completion status from the operational protocol state.",
  },
  {
    name: "episodeObjectiveKey",
    type: "string",
    nullable: false,
    description: "Evaluation objective identifier.",
  },
  {
    name: "episodeProtocolKey",
    type: "string",
    nullable: false,
    description: "Evaluation protocol identifier.",
  },
  {
    name: "episodePolicyArm",
    type: "string",
    nullable: false,
    description: "Assigned policy/comparison arm.",
  },
  {
    name: "assignmentSource",
    type: "string",
    nullable: true,
    description: "How the arm assignment was selected.",
  },
  {
    name: "selectionMode",
    type: "string",
    nullable: true,
    description: "Assignment selection mode.",
  },
  {
    name: "personalizationMode",
    type: "string",
    nullable: true,
    description: "Personalization on/off mode from the assignment envelope.",
  },
  {
    name: "policyMode",
    type: "string",
    nullable: true,
    description: "High-level policy mode from the assignment envelope.",
  },
  {
    name: "policyId",
    type: "string",
    nullable: true,
    description: "Policy identifier from the assignment envelope.",
  },
  {
    name: "assignmentRuntimePolicyId",
    type: "string",
    nullable: true,
    description: "Runtime policy id recorded at the episode-assignment layer.",
  },
  {
    name: "assignmentBackendKind",
    type: "string",
    nullable: true,
    description: "Runtime backend kind recorded at the episode-assignment layer.",
  },
  {
    name: "assignmentBackendId",
    type: "string",
    nullable: true,
    description: "Runtime backend id recorded at the episode-assignment layer.",
  },
  {
    name: "topic",
    type: "string",
    nullable: true,
    description: "Human-readable topic string used for the episode.",
  },
  {
    name: "conceptKey",
    type: "string",
    nullable: true,
    description: "Canonical concept linkage key.",
  },
  {
    name: "skillKey",
    type: "string",
    nullable: true,
    description: "Canonical skill linkage key.",
  },
  {
    name: "familyKey",
    type: "string",
    nullable: true,
    description: "Practice-effect family key for same-skill groupings.",
  },
  {
    name: "sequenceIndex",
    type: "integer",
    nullable: false,
    description: "Episode-local step order.",
  },
  {
    name: "sequenceRole",
    type: "string",
    nullable: false,
    description: "Protocol step role such as precheck or learning_content.",
  },
  {
    name: "touchpointType",
    type: "string",
    nullable: false,
    description: "Touchpoint type from the evaluation protocol.",
  },
  {
    name: "contentKind",
    type: "string",
    nullable: false,
    description: "Stored artifact kind such as generated_test or chat_session.",
  },
  {
    name: "signalQuality",
    type: "string",
    nullable: false,
    description: "Primary/secondary signal quality label.",
  },
  {
    name: "itemRole",
    type: "string",
    nullable: false,
    description: "Training/evaluation/supporting role inside the protocol.",
  },
  {
    name: "itemVariant",
    type: "string",
    nullable: false,
    description: "Practice-effect item variant label.",
  },
  {
    name: "linkageKind",
    type: "string",
    nullable: false,
    description: "Protocol linkage label to earlier content.",
  },
  {
    name: "holdoutStrategy",
    type: "string",
    nullable: false,
    description: "Holdout strategy selected for the episode item.",
  },
  {
    name: "delayedMinutes",
    type: "integer",
    nullable: true,
    description: "Delay window before delayed recheck, when used.",
  },
  {
    name: "deliveredDifficulty",
    type: "string",
    nullable: true,
    description: "Delivered pedagogical difficulty.",
  },
  {
    name: "deliveredDepth",
    type: "string",
    nullable: true,
    description: "Delivered pedagogical explanation depth.",
  },
  {
    name: "decisionRuntimePolicyId",
    type: "string",
    nullable: true,
    description: "Runtime policy id recorded at the step-delivery layer.",
  },
  {
    name: "decisionBackendKind",
    type: "string",
    nullable: true,
    description: "Runtime backend kind recorded at the step-delivery layer.",
  },
  {
    name: "decisionBackendId",
    type: "string",
    nullable: true,
    description: "Runtime backend id recorded at the step-delivery layer.",
  },
  {
    name: "episodeCreatedAtIso",
    type: "datetime",
    nullable: false,
    description: "Episode creation timestamp.",
  },
  {
    name: "deliveredAtIso",
    type: "datetime",
    nullable: false,
    description: "Step delivery timestamp.",
  },
  {
    name: "outcomeRecordedAtIso",
    type: "datetime",
    nullable: true,
    description: "Recorded step-outcome timestamp when a test was submitted.",
  },
  {
    name: "episodeExpectedSequenceJson",
    type: "json_string",
    nullable: false,
    description: "JSON array of expected sequence roles for the episode.",
  },
  {
    name: "episodeCompletedSequenceJson",
    type: "json_string",
    nullable: false,
    description: "JSON array of completed sequence roles for the episode.",
  },
  {
    name: "episodeMissingSequenceJson",
    type: "json_string",
    nullable: false,
    description: "JSON array of missing sequence roles for the episode.",
  },
  {
    name: "episodePrimaryOutcomeCount",
    type: "integer",
    nullable: false,
    description: "Number of recorded primary test outcomes on the episode.",
  },
  {
    name: "outcomeAttemptRef",
    type: "string",
    nullable: true,
    description: "Stable pseudonymous attempt reference for recorded test outcomes.",
  },
  {
    name: "outcomeAccuracy",
    type: "number",
    nullable: true,
    description: "Recorded accuracy for the current step when the step is a test.",
  },
  {
    name: "outcomeQuestionCount",
    type: "integer",
    nullable: true,
    description: "Recorded question count for the current step outcome.",
  },
  {
    name: "outcomeTotalDurationMs",
    type: "integer",
    nullable: true,
    description: "Recorded completion time in milliseconds for the current step outcome.",
  },
  {
    name: "outcomeLearningEligible",
    type: "boolean",
    nullable: true,
    description: "Learning-eligibility flag for the current step outcome.",
  },
  {
    name: "episodePrecheckAccuracy",
    type: "number",
    nullable: true,
    description: "Episode-level precheck accuracy, when recorded.",
  },
  {
    name: "episodePostcheckAccuracy",
    type: "number",
    nullable: true,
    description: "Episode-level postcheck accuracy, when recorded.",
  },
  {
    name: "episodeHoldoutAccuracy",
    type: "number",
    nullable: true,
    description: "Episode-level holdout accuracy, when recorded.",
  },
  {
    name: "episodeDelayedRecheckAccuracy",
    type: "number",
    nullable: true,
    description: "Episode-level delayed recheck accuracy, when recorded.",
  },
  {
    name: "labelPostcheckMinusPrecheck",
    type: "number",
    nullable: true,
    description: "Derived label candidate: postcheck accuracy minus precheck accuracy.",
  },
  {
    name: "labelHoldoutMinusPrecheck",
    type: "number",
    nullable: true,
    description: "Derived label candidate: holdout accuracy minus precheck accuracy.",
  },
  {
    name: "labelDelayedRecheckMinusPrecheck",
    type: "number",
    nullable: true,
    description: "Derived label candidate: delayed recheck accuracy minus precheck accuracy.",
  },
  {
    name: "labelNextPrimaryOutcomeRole",
    type: "string",
    nullable: true,
    description: "First later primary-outcome role after the current step.",
  },
  {
    name: "labelNextPrimaryOutcomeAccuracy",
    type: "number",
    nullable: true,
    description: "First later primary-outcome accuracy after the current step.",
  },
  {
    name: "labelNextPrimaryOutcomeDurationMs",
    type: "integer",
    nullable: true,
    description: "First later primary-outcome duration after the current step.",
  },
];

const TRAINING_DATASET_CSV_COLUMNS: Array<keyof TrainingDatasetRecord> =
  TRAINING_DATASET_SCHEMA_COLUMNS.map(
    (column) => column.name as keyof TrainingDatasetRecord,
  );

function asObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function clampNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parsePositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function valueToCsvCell(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return csvEscape(String(value));
}

function toCsv(records: TrainingDatasetRecord[]) {
  const lines = [TRAINING_DATASET_CSV_COLUMNS.join(",")];
  for (const record of records) {
    const cells = TRAINING_DATASET_CSV_COLUMNS.map((column) =>
      valueToCsvCell(record[column]),
    );
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
}

function resolveSecret() {
  const exportSecret = optionalEnv("DATASET_EXPORT_SECRET");
  if (exportSecret) {
    return exportSecret;
  }
  return requireEnvWithDevFallback("JWT_SECRET", "dev-secret");
}

function pseudonymize(secret: string, prefix: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${prefix}:${value}`)
    .digest("hex")
    .slice(0, 24);
}

function jsonString(value: unknown) {
  return JSON.stringify(value);
}

function normalizeOptions(
  options: TrainingDatasetExportOptions,
): NormalizedTrainingDatasetExportOptions {
  const phase = normalizeTrainingDatasetPhase(
    options.phase ?? DEFAULT_TRAINING_DATASET_PHASE,
  );
  return {
    phase,
    timeRangeDays: parsePositiveInt(
      options.timeRangeDays,
      DEFAULT_TIME_RANGE_DAYS,
      1,
      3650,
    ),
    maxEpisodes: parsePositiveInt(
      options.maxEpisodes,
      DEFAULT_MAX_EPISODES,
      1,
      100_000,
    ),
    completedOnly: options.completedOnly !== false,
    consentOnly:
      typeof options.consentOnly === "boolean"
        ? options.consentOnly
        : phase === "real",
    outputRoot: options.outputRoot?.trim() || null,
    generatedAtIso: options.generatedAtIso?.trim() || new Date().toISOString(),
  };
}

function emptyCounts(): TrainingDatasetCounts {
  return {
    scannedEpisodes: 0,
    exportedEpisodes: 0,
    exportedRows: 0,
    filteredByConsent: 0,
    filteredByStatus: 0,
    filteredByPrimaryOutcomes: 0,
    filteredItemsMissingDecision: 0,
    rowsBySequenceRole: {},
    rowsByDatasetOrigin: {},
  };
}

function incrementCounter(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function diffNumbers(left: number | null, right: number | null) {
  if (left == null || right == null) {
    return null;
  }
  return right - left;
}

function resolveNextPrimaryOutcome(
  summary: ReturnType<typeof summarizeEvaluationEpisode>,
  sequenceIndex: number,
) {
  return (
    summary.primaryOutcomes.find(
      (outcome) => outcome.sequenceIndex > sequenceIndex,
    ) ?? null
  );
}

function toRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath) || ".";
}

function buildSnapshotId(params: {
  generatedAtIso: string;
  phase: TrainingDatasetPhase;
}) {
  const timestamp = params.generatedAtIso
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${TRAINING_DATASET_SCHEMA_VERSION}__${params.phase}__${timestamp}`;
}

function resolvePhaseRoot(params: {
  phase: TrainingDatasetPhase;
  outputRoot: string | null;
}) {
  const baseRoot = params.outputRoot
    ? path.isAbsolute(params.outputRoot)
      ? params.outputRoot
      : path.join(process.cwd(), params.outputRoot)
    : process.cwd();
  return path.join(baseRoot, TRAINING_DATASET_PHASE_ROOTS[params.phase]);
}

export async function getTrainingDatasetSnapshot(
  prisma: PrismaClient,
  options: TrainingDatasetExportOptions = {},
): Promise<TrainingDatasetSnapshot> {
  const normalized = normalizeOptions(options);
  const since = new Date(
    Date.now() - normalized.timeRangeDays * 24 * 60 * 60 * 1000,
  );
  const secret = resolveSecret();
  const counts = emptyCounts();

  const latestEpisodes = await prisma.evaluationEpisode.findMany({
    where: {
      createdAt: { gte: since },
      datasetPhase: normalized.phase,
    },
    orderBy: { createdAt: "desc" },
    take: normalized.maxEpisodes,
    select: {
      id: true,
      userId: true,
      subjectId: true,
      sectionId: true,
      datasetPhase: true,
      datasetOrigin: true,
      objectiveKey: true,
      protocolKey: true,
      status: true,
      policyArm: true,
      topic: true,
      conceptKey: true,
      skillKey: true,
      assignmentJson: true,
      designJson: true,
      createdAt: true,
      user: {
        select: {
          researchConsentAt: true,
          researchConsentVersion: true,
          researchConsentWithdrawnAt: true,
          trainingDataExclusionAt: true,
          trainingDataExclusionReason: true,
        },
      },
      items: {
        orderBy: { sequenceIndex: "asc" },
        select: {
          id: true,
          episodeId: true,
          contentKind: true,
          contentId: true,
          sequenceIndex: true,
          sequenceRole: true,
          touchpointType: true,
          signalQuality: true,
          itemRole: true,
          itemVariant: true,
          linkageKind: true,
          linkedContentId: true,
          familyKey: true,
          conceptKey: true,
          skillKey: true,
          holdoutStrategy: true,
          delayedMinutes: true,
          policyArm: true,
          subjectId: true,
          sectionId: true,
          topic: true,
          pedagogicalDecisionJson: true,
          decisionRuntimeJson: true,
          outcomeJson: true,
          deliveredAt: true,
          outcomeRecordedAt: true,
        },
      },
    },
  });
  const episodes = [...latestEpisodes].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  const records: TrainingDatasetRecord[] = [];

  for (const episode of episodes) {
    counts.scannedEpisodes += 1;

    const eligibility = getTrainingEligibilitySnapshot(episode.user);
    if (normalized.consentOnly && !eligibility.futureTrainingEligible) {
      counts.filteredByConsent += 1;
      continue;
    }

    const summary = summarizeEvaluationEpisode({
      episode: {
        id: episode.id,
        objectiveKey: episode.objectiveKey,
        protocolKey: episode.protocolKey,
        status: episode.status,
        policyArm: episode.policyArm,
        subjectId: episode.subjectId,
        sectionId: episode.sectionId,
        topic: episode.topic,
        conceptKey: episode.conceptKey,
        skillKey: episode.skillKey,
        assignmentJson: episode.assignmentJson as Prisma.JsonValue,
        designJson: episode.designJson as Prisma.JsonValue,
        createdAt: episode.createdAt,
      },
      items: episode.items.map((item) => ({
        ...item,
        pedagogicalDecisionJson: item.pedagogicalDecisionJson as Prisma.JsonValue | null,
        decisionRuntimeJson: item.decisionRuntimeJson as Prisma.JsonValue | null,
        outcomeJson: item.outcomeJson as Prisma.JsonValue | null,
      })),
    });

    if (normalized.completedOnly && summary.status !== "completed") {
      counts.filteredByStatus += 1;
      continue;
    }

    if (summary.primaryOutcomes.length === 0) {
      counts.filteredByPrimaryOutcomes += 1;
      continue;
    }

    const precheckAccuracy =
      summary.primaryOutcomes.find((item) => item.sequenceRole === "precheck")
        ?.accuracy ?? null;
    const postcheckAccuracy =
      summary.primaryOutcomes.find((item) => item.sequenceRole === "postcheck")
        ?.accuracy ?? null;
    const holdoutAccuracy =
      summary.primaryOutcomes.find((item) => item.sequenceRole === "holdout")
        ?.accuracy ?? null;
    const delayedAccuracy =
      summary.primaryOutcomes.find(
        (item) => item.sequenceRole === "delayed_recheck",
      )?.accuracy ?? null;

    let episodeRowCount = 0;

    for (const item of summary.items) {
      if (item.pedagogicalDecision == null) {
        counts.filteredItemsMissingDecision += 1;
        continue;
      }

      const nextPrimaryOutcome = resolveNextPrimaryOutcome(summary, item.sequenceIndex);
      const decisionRuntime = asObject(item.decisionRuntime);
      const outcome = item.outcome;

      records.push({
        schemaVersion: TRAINING_DATASET_SCHEMA_VERSION,
        snapshotPhase: normalized.phase,
        snapshotExportedAtIso: normalized.generatedAtIso,
        datasetPhase: normalizeTrainingDatasetPhase(episode.datasetPhase),
        datasetOrigin: episode.datasetOrigin,
        learnerRef: pseudonymize(secret, "learner", episode.userId),
        episodeRef: pseudonymize(secret, "episode", episode.id),
        stepRef: pseudonymize(secret, "episode_item", item.id),
        contentRef: pseudonymize(secret, "content", item.contentId),
        linkedContentRef: item.linkedContentId
          ? pseudonymize(secret, "content", item.linkedContentId)
          : null,
        subjectRef: episode.subjectId
          ? pseudonymize(secret, "subject", episode.subjectId)
          : null,
        sectionRef: episode.sectionId
          ? pseudonymize(secret, "section", episode.sectionId)
          : null,
        consentGranted: eligibility.consentGranted,
        consentVersion: eligibility.consentVersion,
        consentWithdrawnAtIso: eligibility.consentWithdrawnAtIso,
        futureTrainingEligible: eligibility.futureTrainingEligible,
        excludedFromFutureTraining: eligibility.excludedFromFutureTraining,
        excludedFromFutureTrainingAtIso:
          eligibility.excludedFromFutureTrainingAtIso,
        trainingExclusionReason: eligibility.exclusionReason,
        episodeStatus: summary.status,
        episodeObjectiveKey: summary.objectiveKey,
        episodeProtocolKey: summary.protocolKey,
        episodePolicyArm: summary.arm,
        assignmentSource: summary.assignment.assignmentSource,
        selectionMode: summary.assignment.selectionMode,
        personalizationMode: summary.assignment.personalizationMode,
        policyMode: summary.assignment.policyMode,
        policyId: summary.assignment.policyId,
        assignmentRuntimePolicyId: summary.assignment.runtimePolicyId,
        assignmentBackendKind: summary.assignment.backendKind,
        assignmentBackendId: summary.assignment.backendId,
        topic: summary.topic,
        conceptKey: item.conceptKey ?? summary.conceptKey,
        skillKey: item.skillKey ?? summary.skillKey,
        familyKey: item.familyKey,
        sequenceIndex: item.sequenceIndex,
        sequenceRole: item.sequenceRole,
        touchpointType: item.touchpointType,
        contentKind: item.contentKind,
        signalQuality: item.signalQuality,
        itemRole: item.itemRole,
        itemVariant: item.itemVariant,
        linkageKind: item.linkageKind,
        holdoutStrategy: item.holdoutStrategy,
        delayedMinutes: item.delayedMinutes,
        deliveredDifficulty: item.pedagogicalDecision.difficulty,
        deliveredDepth: item.pedagogicalDecision.depth,
        decisionRuntimePolicyId:
          typeof decisionRuntime?.runtimePolicyId === "string"
            ? decisionRuntime.runtimePolicyId
            : null,
        decisionBackendKind:
          typeof decisionRuntime?.backendKind === "string"
            ? decisionRuntime.backendKind
            : null,
        decisionBackendId:
          typeof decisionRuntime?.backendId === "string"
            ? decisionRuntime.backendId
            : null,
        episodeCreatedAtIso: summary.timing.episodeCreatedAtIso,
        deliveredAtIso: item.deliveredAtIso,
        outcomeRecordedAtIso: item.outcomeRecordedAtIso,
        episodeExpectedSequenceJson: jsonString(summary.sequence.expected),
        episodeCompletedSequenceJson: jsonString(summary.sequence.completed),
        episodeMissingSequenceJson: jsonString(summary.sequence.missing),
        episodePrimaryOutcomeCount: summary.primaryOutcomes.length,
        outcomeAttemptRef:
          typeof outcome?.attemptId === "string"
            ? pseudonymize(secret, "attempt", outcome.attemptId)
            : null,
        outcomeAccuracy: clampNumber(outcome?.accuracy),
        outcomeQuestionCount:
          typeof outcome?.questionCount === "number"
            ? Math.floor(outcome.questionCount)
            : null,
        outcomeTotalDurationMs:
          typeof outcome?.totalDurationMs === "number"
            ? Math.floor(outcome.totalDurationMs)
            : null,
        outcomeLearningEligible:
          typeof outcome?.learningEligible === "boolean"
            ? outcome.learningEligible
            : null,
        episodePrecheckAccuracy: clampNumber(precheckAccuracy),
        episodePostcheckAccuracy: clampNumber(postcheckAccuracy),
        episodeHoldoutAccuracy: clampNumber(holdoutAccuracy),
        episodeDelayedRecheckAccuracy: clampNumber(delayedAccuracy),
        labelPostcheckMinusPrecheck: clampNumber(
          diffNumbers(precheckAccuracy, postcheckAccuracy),
        ),
        labelHoldoutMinusPrecheck: clampNumber(
          diffNumbers(precheckAccuracy, holdoutAccuracy),
        ),
        labelDelayedRecheckMinusPrecheck: clampNumber(
          diffNumbers(precheckAccuracy, delayedAccuracy),
        ),
        labelNextPrimaryOutcomeRole: nextPrimaryOutcome?.sequenceRole ?? null,
        labelNextPrimaryOutcomeAccuracy: clampNumber(
          nextPrimaryOutcome?.accuracy ?? null,
        ),
        labelNextPrimaryOutcomeDurationMs:
          nextPrimaryOutcome?.totalDurationMs != null
            ? Math.floor(nextPrimaryOutcome.totalDurationMs)
            : null,
      });

      episodeRowCount += 1;
      counts.exportedRows += 1;
      incrementCounter(counts.rowsBySequenceRole, item.sequenceRole);
      incrementCounter(counts.rowsByDatasetOrigin, episode.datasetOrigin);
    }

    if (episodeRowCount > 0) {
      counts.exportedEpisodes += 1;
    }
  }

  return {
    schemaVersion: TRAINING_DATASET_SCHEMA_VERSION,
    generatedAtIso: normalized.generatedAtIso,
    phase: normalized.phase,
    format: TRAINING_DATASET_FILE_FORMAT,
    preferredFutureFormat: TRAINING_DATASET_PREFERRED_FUTURE_FORMAT,
    filters: {
      phase: normalized.phase,
      timeRangeDays: normalized.timeRangeDays,
      maxEpisodes: normalized.maxEpisodes,
      completedOnly: normalized.completedOnly,
      consentOnly: normalized.consentOnly,
    },
    timeRange: {
      since: since.toISOString(),
      until: normalized.generatedAtIso,
    },
    counts,
    records,
    schema: TRAINING_DATASET_SCHEMA_COLUMNS,
  };
}

export async function exportTrainingDatasetSnapshot(
  prisma: PrismaClient,
  options: TrainingDatasetExportOptions = {},
): Promise<TrainingDatasetExportResult> {
  const snapshot = await getTrainingDatasetSnapshot(prisma, options);
  const normalized = normalizeOptions({
    ...options,
    phase: snapshot.phase,
    generatedAtIso: snapshot.generatedAtIso,
  });
  const phaseRoot = resolvePhaseRoot({
    phase: snapshot.phase,
    outputRoot: normalized.outputRoot,
  });
  const snapshotId = buildSnapshotId({
    generatedAtIso: snapshot.generatedAtIso,
    phase: snapshot.phase,
  });
  const snapshotDir = path.join(phaseRoot, snapshotId);
  mkdirSync(snapshotDir, { recursive: true });

  const datasetPath = path.join(snapshotDir, "dataset.csv");
  const schemaPath = path.join(snapshotDir, "schema.json");
  const metadataPath = path.join(snapshotDir, "metadata.json");
  const manifestPath = path.join(snapshotDir, "manifest.json");

  const futureArtifactSlot = buildEduAiNativePedagogyArtifactSlotMetadata();
  const datasetContent = toCsv(snapshot.records);
  const schemaContent = `${JSON.stringify(
    {
      schemaVersion: snapshot.schemaVersion,
      fileFormat: snapshot.format,
      preferredFutureFormat: snapshot.preferredFutureFormat,
      columns: snapshot.schema,
    },
    null,
    2,
  )}\n`;
  const metadataContent = `${JSON.stringify(
    {
      metadataVersion: TRAINING_DATASET_METADATA_VERSION,
      snapshotId,
      generatedAtIso: snapshot.generatedAtIso,
      phase: snapshot.phase,
      filters: snapshot.filters,
      timeRange: snapshot.timeRange,
      counts: snapshot.counts,
      contract: {
        schemaVersion: snapshot.schemaVersion,
        fileFormat: snapshot.format,
        preferredFutureFormat: snapshot.preferredFutureFormat,
      },
      futureArtifactSlot,
    },
    null,
    2,
  )}\n`;

  writeFileSync(datasetPath, datasetContent, "utf8");
  writeFileSync(schemaPath, schemaContent, "utf8");
  writeFileSync(metadataPath, metadataContent, "utf8");

  const manifestContent = `${JSON.stringify(
    {
      manifestVersion: TRAINING_DATASET_MANIFEST_VERSION,
      snapshotId,
      phaseRoot: toRelativePath(phaseRoot),
      snapshotDir: toRelativePath(snapshotDir),
      files: {
        dataset: {
          path: toRelativePath(datasetPath),
          format: snapshot.format,
          bytes: statSync(datasetPath).size,
          rows: snapshot.records.length,
        },
        schema: {
          path: toRelativePath(schemaPath),
          bytes: statSync(schemaPath).size,
        },
        metadata: {
          path: toRelativePath(metadataPath),
          bytes: statSync(metadataPath).size,
        },
      },
      futureArtifactSlot: {
        placeholderMetadataPath: toRelativePath(
          resolveEduAiNativePedagogyArtifactMetadataPath(),
        ),
        reservedArtifactPath: toRelativePath(
          resolveEduAiNativePedagogyArtifactPath(),
        ),
        runtimeIntegrationStatus: futureArtifactSlot.runtimeIntegrationStatus,
      },
      report: {
        rowsExported: snapshot.counts.exportedRows,
        episodesExported: snapshot.counts.exportedEpisodes,
        filteredByConsent: snapshot.counts.filteredByConsent,
        filteredByStatus: snapshot.counts.filteredByStatus,
        filteredByPrimaryOutcomes: snapshot.counts.filteredByPrimaryOutcomes,
        filteredItemsMissingDecision:
          snapshot.counts.filteredItemsMissingDecision,
      },
    },
    null,
    2,
  )}\n`;

  writeFileSync(manifestPath, manifestContent, "utf8");

  return {
    snapshotId,
    snapshotDir,
    phaseRoot,
    snapshot,
    files: {
      dataset: {
        path: datasetPath,
        bytes: statSync(datasetPath).size,
      },
      schema: {
        path: schemaPath,
        bytes: statSync(schemaPath).size,
      },
      metadata: {
        path: metadataPath,
        bytes: statSync(metadataPath).size,
      },
      manifest: {
        path: manifestPath,
        bytes: statSync(manifestPath).size,
      },
    },
  };
}
