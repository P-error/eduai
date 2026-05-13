import type { PrismaClient } from "@prisma/client";
import { isDefaultCollectionName } from "@/lib/collection-constants";
import {
  buildLearnerAttemptEvidenceContract,
  normalizeLearningExclusionReason,
  type LearnerAttemptEvidenceContract,
  type LearningExclusionReasonCode,
} from "@/lib/learning-evidence-contract";

const RECENT_EVIDENCE_WINDOW = 10;

type DifficultyTarget = "easy" | "medium" | "hard";

type AttemptMeta = {
  learning?: {
    eligible?: boolean;
    skipReason?: string | null;
  };
  evidence?: LearnerAttemptEvidenceContract;
  evaluation?: {
    episodeId?: string | null;
    sequenceRole?: string | null;
    testsPrimary?: boolean;
    chatSecondary?: boolean;
  };
};

type AttemptRecord = {
  id: string;
  score: number;
  createdAt: Date;
  byTagJson: unknown;
  totalDurationMs: number | null;
  answerChangeCount: number | null;
  perQuestionFirstAnswerMsJson: unknown;
  test: {
    id: string;
    mode: string;
    topic: string;
    questionCount: number;
    sectionId: string | null;
    evaluationEpisodeId: string | null;
    validationMetaJson: unknown;
    subjectId: string;
    subject: {
      title: string;
      collectionId: string | null;
      collection: {
        id: string;
        name: string;
      } | null;
    };
  };
};

export type LearnerTruthAttempt = {
  id: string;
  score: number;
  createdAt: Date;
  topic: string;
  questionCount: number;
  sectionId: string | null;
  subjectId: string;
  subjectTitle: string;
  collectionId: string | null;
  collectionName: string | null;
  isDefaultCollection: boolean;
  byTagJson: unknown;
  totalDurationMs: number | null;
  answerChangeCount: number | null;
  perQuestionFirstAnswerMsJson: unknown;
  evidence: LearnerAttemptEvidenceContract;
  currentDifficultyTarget: DifficultyTarget | null;
};

export type LearnerTruthScopeSummary = {
  attemptsRecorded: number;
  attemptsLearningEligible: number;
  attemptsExcluded: number;
  recentAccuracy: {
    value: number | null;
    sampleSize: number;
  };
  recentEvidence: {
    windowSize: number;
    recorded: number;
    learningEligible: number;
    excluded: number;
  };
  lastRecordedAttemptAt: string | null;
  currentDifficultyTarget: DifficultyTarget | null;
  excludedReasonsTop: Array<{
    reason: LearningExclusionReasonCode | "UNKNOWN";
    count: number;
  }>;
};

export type LearnerTruthSubjectSummary = LearnerTruthScopeSummary & {
  subjectId: string;
  subjectTitle: string;
  collectionId: string | null;
  collectionName: string | null;
  isDefaultCollection: boolean;
};

export type LearnerTruthOverview = {
  attempts: LearnerTruthAttempt[];
  global: LearnerTruthScopeSummary;
  subjects: LearnerTruthSubjectSummary[];
  adaptiveState: {
    personalizationReady: boolean;
    learningUpdateCount: number;
    currentDifficultyTarget: DifficultyTarget | null;
    legacyTestsTaken: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeDifficulty(value: unknown): DifficultyTarget | null {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return null;
}

export function inferDifficultyFromByTag(byTagJson: unknown) {
  const root = asRecord(byTagJson);
  const difficulty = root.difficulty_target;
  if (!difficulty || typeof difficulty !== "object") {
    return null;
  }

  const buckets = Object.entries(difficulty as Record<string, unknown>)
    .map(([tagKey, value]) => {
      const payload = asRecord(value);
      const total = Number(payload.total ?? 0);
      return {
        tagKey,
        total: Number.isFinite(total) ? total : 0,
      };
    })
    .sort((left, right) => right.total - left.total);

  return normalizeDifficulty(buckets[0]?.tagKey ?? null);
}

function parseAttemptMeta(byTagJson: unknown): AttemptMeta | null {
  const root = asRecord(byTagJson);
  const meta = root._meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  return meta as AttemptMeta;
}

function resolveAttemptEvidence(record: AttemptRecord): LearnerAttemptEvidenceContract {
  const meta = parseAttemptMeta(record.byTagJson);
  if (meta?.evidence) {
    return meta.evidence;
  }

  const validationMeta = asRecord(record.test.validationMetaJson);
  const learningEligible =
    typeof meta?.learning?.eligible === "boolean"
      ? meta.learning.eligible
      : validationMeta.learningEligible === false
        ? false
        : true;
  const learningSkipReason =
    normalizeLearningExclusionReason(meta?.learning?.skipReason) ??
    normalizeLearningExclusionReason(validationMeta.learningExcludedReason);

  return buildLearnerAttemptEvidenceContract({
    testMode: record.test.mode,
    evaluationEpisodeId:
      meta?.evaluation?.episodeId ?? record.test.evaluationEpisodeId ?? null,
    sequenceRole: meta?.evaluation?.sequenceRole ?? null,
    learningEligible,
    learningSkipReason,
    testsPrimary: meta?.evaluation?.testsPrimary ?? true,
    chatSecondary:
      meta?.evaluation?.chatSecondary ?? record.test.evaluationEpisodeId != null,
  });
}

function mapAttemptRecord(record: AttemptRecord): LearnerTruthAttempt {
  return {
    id: record.id,
    score: record.score,
    createdAt: record.createdAt,
    topic: record.test.topic,
    questionCount: record.test.questionCount,
    sectionId: record.test.sectionId,
    subjectId: record.test.subjectId,
    subjectTitle: record.test.subject.title,
    collectionId: record.test.subject.collectionId,
    collectionName: record.test.subject.collection?.name ?? null,
    isDefaultCollection: record.test.subject.collection?.name
      ? isDefaultCollectionName(record.test.subject.collection.name)
      : false,
    byTagJson: record.byTagJson,
    totalDurationMs: record.totalDurationMs,
    answerChangeCount: record.answerChangeCount,
    perQuestionFirstAnswerMsJson: record.perQuestionFirstAnswerMsJson,
    evidence: resolveAttemptEvidence(record),
    currentDifficultyTarget: inferDifficultyFromByTag(record.byTagJson),
  };
}

export function buildLearnerTruthScopeSummary(params: {
  attempts: LearnerTruthAttempt[];
  difficultyFallback?: DifficultyTarget | null;
}): LearnerTruthScopeSummary {
  const attempts = params.attempts;
  const eligibleAttempts = attempts.filter((attempt) => attempt.evidence.learning.eligible);
  const excludedAttempts = attempts.filter((attempt) => !attempt.evidence.learning.eligible);
  const recentWindow = attempts.slice(0, RECENT_EVIDENCE_WINDOW);
  const recentEligible = eligibleAttempts.slice(0, RECENT_EVIDENCE_WINDOW);
  const recentAccuracyValue = average(recentEligible.map((attempt) => attempt.score));
  const currentDifficultyTarget =
    eligibleAttempts.find((attempt) => attempt.currentDifficultyTarget)?.currentDifficultyTarget ??
    attempts.find((attempt) => attempt.currentDifficultyTarget)?.currentDifficultyTarget ??
    params.difficultyFallback ??
    null;
  const reasonCounter = new Map<LearningExclusionReasonCode | "UNKNOWN", number>();

  for (const attempt of excludedAttempts) {
    const reason = attempt.evidence.learning.exclusionReasonCode ?? "UNKNOWN";
    reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1);
  }

  return {
    attemptsRecorded: attempts.length,
    attemptsLearningEligible: eligibleAttempts.length,
    attemptsExcluded: excludedAttempts.length,
    recentAccuracy: {
      value: recentEligible.length > 0 ? recentAccuracyValue : null,
      sampleSize: recentEligible.length,
    },
    recentEvidence: {
      windowSize: RECENT_EVIDENCE_WINDOW,
      recorded: recentWindow.length,
      learningEligible: recentWindow.filter((attempt) => attempt.evidence.learning.eligible)
        .length,
      excluded: recentWindow.filter((attempt) => !attempt.evidence.learning.eligible).length,
    },
    lastRecordedAttemptAt: attempts[0]?.createdAt.toISOString() ?? null,
    currentDifficultyTarget,
    excludedReasonsTop: [...reasonCounter.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}

export async function buildLearnerTruthOverview(
  prisma: PrismaClient,
  userId: string,
): Promise<LearnerTruthOverview> {
  const [user, attemptRecords] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        effectivePreferencesJson: true,
        personalizationReady: true,
        testsTaken: true,
      },
    }),
    prisma.testAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        score: true,
        createdAt: true,
        byTagJson: true,
        totalDurationMs: true,
        answerChangeCount: true,
        perQuestionFirstAnswerMsJson: true,
        test: {
          select: {
            id: true,
            mode: true,
            topic: true,
            questionCount: true,
            sectionId: true,
            evaluationEpisodeId: true,
            validationMetaJson: true,
            subjectId: true,
            subject: {
              select: {
                title: true,
                collectionId: true,
                collection: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const attempts = attemptRecords.map(mapAttemptRecord);
  const effectivePreferences = asRecord(user.effectivePreferencesJson);
  const globalDifficultyFallback = normalizeDifficulty(
    effectivePreferences.difficulty_target,
  );
  const global = buildLearnerTruthScopeSummary({
    attempts,
    difficultyFallback: globalDifficultyFallback,
  });

  const subjectBuckets = new Map<string, LearnerTruthAttempt[]>();
  for (const attempt of attempts) {
    const current = subjectBuckets.get(attempt.subjectId) ?? [];
    current.push(attempt);
    subjectBuckets.set(attempt.subjectId, current);
  }

  const subjects = [...subjectBuckets.entries()]
    .map(([subjectId, subjectAttempts]) => {
      const first = subjectAttempts[0];
      const summary = buildLearnerTruthScopeSummary({
        attempts: subjectAttempts,
      });
      return {
        subjectId,
        subjectTitle: first.subjectTitle,
        collectionId: first.collectionId,
        collectionName: first.collectionName,
        isDefaultCollection: first.isDefaultCollection,
        ...summary,
      } satisfies LearnerTruthSubjectSummary;
    })
    .sort((left, right) => right.attemptsRecorded - left.attemptsRecorded);

  return {
    attempts,
    global,
    subjects,
    adaptiveState: {
      personalizationReady: user.personalizationReady,
      learningUpdateCount: global.attemptsLearningEligible,
      currentDifficultyTarget: global.currentDifficultyTarget,
      legacyTestsTaken: user.testsTaken,
    },
  };
}
