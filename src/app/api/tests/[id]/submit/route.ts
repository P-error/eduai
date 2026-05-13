import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  computeLayeredPreferences,
  computeUxReward,
  decideDifficultyTarget,
  isPersonalizationReady,
} from "@/lib/statistics";
import { isDefaultCollectionName } from "@/lib/collection-constants";
import { PED_AXES, TAGS_BY_AXIS, UX_AXES } from "@/lib/tags";
import { buildPredictionFeaturePayload } from "@/lib/prediction-feature-layer";
import { runPredictionRuntime } from "@/lib/prediction-runtime";
import {
  DURATION_HISTORY_WINDOW_ATTEMPTS,
} from "@/lib/prediction-duration";
import {
  getActivePredictionRuntimeConfig,
} from "@/lib/active-policy";
import { recordEvaluationTestOutcome } from "@/lib/evaluation";
import {
  buildRateLimitErrorResponse,
  rateLimitRouteOrThrow,
} from "@/lib/rate-limit";
import {
  buildLearnerAttemptEvidenceContract,
  normalizeLearningExclusionReason,
  type LearnerAttemptEvidenceContract,
  type LearningExclusionReasonCode,
} from "@/lib/learning-evidence-contract";

export const runtime = "nodejs";

// Submission policy:
// 1) only test owner can submit;
// 2) one submission per (userId, testId) is enforced by DB unique constraint;
// 3) duplicate submit returns the first persisted result (idempotent behavior).
const SubmitSchema = z.object({
  answers: z.array(z.unknown()),
  totalDurationMs: z.number().int().positive().optional().nullable(),
  perQuestionFirstAnswerMs: z.array(z.number().int().nonnegative()).optional(),
  answerChangeCount: z.number().int().nonnegative().optional(),
});

type AxisStats = {
  correct: number;
  total: number;
  accuracy: number;
};

type AttemptPolicyMeta = {
  evidence?: LearnerAttemptEvidenceContract;
  learning: {
    eligible: boolean;
    skipped: boolean;
    skipReason: string | null;
  };
  ux: {
    eligible: boolean;
    reward: number | null;
    expectedTimeMs: number | null;
    timeScore: number | null;
    changePenalty: number | null;
    skipReason: string | null;
  };
  pedagogy: {
    currentDifficulty: string;
    nextDifficulty: string;
    changed: boolean;
    reason: string;
    sampleSize: number;
    smoothedAccuracy: number | null;
    attemptsSinceLastDifficultyChange: number;
  };
  dataQuality: {
    invalidTagWarnings: boolean;
  };
  recommendation: {
    explorationUsed: boolean;
  };
  evaluation: {
    episodeId: string | null;
    protocolKey: string | null;
    signalQuality: string;
    touchpointType: string | null;
    sequenceRole: string | null;
    itemRole: string | null;
    itemVariant: string | null;
    linkageKind: string | null;
    linkedContentId: string | null;
    assessmentChannel: string | null;
    policyArm: string | null;
    assignmentSource: string | null;
    conceptKey: string | null;
    skillKey: string | null;
    familyKey: string | null;
    holdoutStrategy: string | null;
    delayedMinutes: number | null;
    contentKind: string;
    contentId: string;
    subjectId: string;
    sectionId: string | null;
    topic: string;
    pedagogicalDecision:
      | {
          difficulty: string;
          depth: string;
        }
      | null;
    testsPrimary: boolean;
    chatSecondary: boolean;
  };
  policy: {
    policyMode: string | null;
    policyId: string | null;
  };
  prediction: {
    expectedAccuracy: number | null;
    expectedTotalDurationMs: number | null;
    durationConfidence?: number | null;
    durationBasis?: string | null;
    durationComponents?: {
      baseline: number;
      telemetryAdjustment?: number;
    } | null;
    predictorVersion?: string | null;
    computedAtIso: string;
    policyMode: string | null;
    policyId: string | null;
    runtime?: {
      policyId: string;
      policyVersion: string;
      configVersion: string;
      selectionSource: string;
      selectionWarning: string | null;
      backendKind: string;
      backendId: string;
      backendStatus: string;
      featurePayloadVersion: string;
      accuracyFeatureSchemaVersion: string;
      artifact: {
        status: string;
        path: string | null;
        warning: string | null;
        modelVersion: string | null;
        artifactSchemaVersion: string | null;
      };
    } | null;
    targets?: {
      expectedAccuracy: {
        status: string;
        sourceType: string;
        producerId: string;
        artifactStatus: string;
      };
      expectedTotalDurationMs: {
        status: string;
        sourceType: string;
        producerId: string;
        artifactStatus: string;
      };
    } | null;
    actualAccuracy: number;
    actualTotalDurationMs: number | null;
  };
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: code, message, ...(details ? { details } : {}) },
    { status },
  );
}

async function maybeRateLimitSubmit(request: Request, userId: string) {
  try {
    await rateLimitRouteOrThrow({
      routeClass: "test_submit",
      request,
      userId,
    });
    return null;
  } catch (error) {
    return buildRateLimitErrorResponse(
      error,
      "Submit rate limit reached. Please try again later.",
    );
  }
}

function dominantTagForAxis(
  assignments: {
    axis: { key: string };
    tag: { key: string };
  }[],
  axisKey: string,
): string | null {
  const counters = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.axis.key !== axisKey) continue;
    counters.set(assignment.tag.key, (counters.get(assignment.tag.key) ?? 0) + 1);
  }
  if (counters.size === 0) return null;

  const sorted = [...counters.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0][0] ?? null;
}

function inferDifficultyFromByTag(byTag: unknown): string | null {
  if (!byTag || typeof byTag !== "object") return null;
  const meta = (byTag as Record<string, unknown>)._meta;
  if (meta && typeof meta === "object") {
    const evaluation = (meta as Record<string, unknown>).evaluation;
    if (evaluation && typeof evaluation === "object") {
      const pedagogicalDecision = (evaluation as Record<string, unknown>)
        .pedagogicalDecision;
      if (
        pedagogicalDecision &&
        typeof pedagogicalDecision === "object" &&
        typeof (pedagogicalDecision as Record<string, unknown>).difficulty ===
          "string"
      ) {
        return String(
          (pedagogicalDecision as Record<string, unknown>).difficulty,
        );
      }
    }
  }

  const difficulty = (byTag as Record<string, unknown>).difficulty_target;
  if (!difficulty || typeof difficulty !== "object") return null;

  const entries = Object.entries(difficulty as Record<string, unknown>)
    .map(([tagKey, value]) => {
      const total =
        value && typeof value === "object" && "total" in value
          ? Number((value as { total?: unknown }).total)
          : 0;
      return { tagKey, total: Number.isFinite(total) ? total : 0 };
    })
    .sort((a, b) => b.total - a.total);

  return entries[0]?.tagKey ?? null;
}

function isAxisKnown(axisKey: string) {
  return UX_AXES.includes(axisKey as (typeof UX_AXES)[number]) ||
    PED_AXES.includes(axisKey as (typeof PED_AXES)[number]);
}

function buildPublicByTag(byTag: Record<string, unknown>) {
  const publicByTag: Record<string, Record<string, AxisStats>> = {};
  for (const [axisKey, tags] of Object.entries(byTag)) {
    if (axisKey.startsWith("_")) continue;
    if (!isAxisKnown(axisKey)) continue;
    if (!tags || typeof tags !== "object") continue;

    const normalizedTags: Record<string, AxisStats> = {};
    for (const [tagKey, values] of Object.entries(tags as Record<string, unknown>)) {
      if (!values || typeof values !== "object") continue;
      const correct = Number((values as { correct?: unknown }).correct ?? 0);
      const total = Number((values as { total?: unknown }).total ?? 0);
      const accuracy = Number((values as { accuracy?: unknown }).accuracy ?? 0);
      normalizedTags[tagKey] = {
        correct: Number.isFinite(correct) ? correct : 0,
        total: Number.isFinite(total) ? total : 0,
        accuracy: Number.isFinite(accuracy) ? accuracy : 0,
      };
    }

    publicByTag[axisKey] = normalizedTags;
  }
  return publicByTag;
}

function friendlyLearningSkipReason(reason: string | null) {
  const normalized = normalizeLearningExclusionReason(reason);
  if (!normalized) return null;
  if (normalized === "LOW_UX_COMPLIANCE") {
    return "Excluded from learning due to low answer-style consistency.";
  }
  if (normalized === "INVALID_TAG_WARNINGS") {
    return "Excluded from learning due to low data quality in tagging.";
  }
  if (normalized === "FALLBACK_GENERATION") {
    return "Excluded from learning because the test was generated through the fallback path.";
  }
  if (normalized === "FALLBACK_TAGGING") {
    return "Excluded from learning because fallback tagging was used.";
  }
  if (normalized === "LEARNING_INELIGIBLE") {
    return "Excluded from learning due to generation quality safeguards.";
  }
  if (normalized === "DEFAULT_COLLECTION") {
    return "Excluded from learning because this is a baseline/default collection.";
  }
  return "Excluded from learning due to quality safeguards.";
}

function friendlyDifficultyReason(reason: string) {
  if (reason === "INCREASE") return "Recent accuracy is above the target band.";
  if (reason === "DECREASE") return "Recent accuracy is below the target band.";
  if (reason === "WITHIN_BAND") return "Recent accuracy is within the target band.";
  if (reason === "LOW_N") return "More attempts are needed before changing difficulty.";
  if (reason === "COOLDOWN") return "Difficulty cooldown is active.";
  return "Insufficient evidence for a difficulty change.";
}

function parseAttemptMeta(byTagJson: unknown): AttemptPolicyMeta | null {
  if (!byTagJson || typeof byTagJson !== "object") return null;
  const meta = (byTagJson as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== "object") return null;
  return meta as AttemptPolicyMeta;
}

function submitSuccessResponse(
  attempt: { score: number; byTagJson: unknown },
  test: {
    mode: string;
    evaluationEpisodeId: string | null;
    validationMetaJson: unknown;
  },
  alreadySubmitted: boolean,
) {
  const byTag =
    attempt.byTagJson && typeof attempt.byTagJson === "object"
      ? (attempt.byTagJson as Record<string, unknown>)
      : {};
  const meta = parseAttemptMeta(byTag);
  const validationMeta =
    test.validationMetaJson && typeof test.validationMetaJson === "object"
      ? (test.validationMetaJson as Record<string, unknown>)
      : {};
  const validationEvaluation =
    validationMeta.evaluation && typeof validationMeta.evaluation === "object"
      ? (validationMeta.evaluation as Record<string, unknown>)
      : null;
  const learningEligible =
    typeof meta?.learning.eligible === "boolean"
      ? meta.learning.eligible
      : validationMeta.learningEligible === false
        ? false
        : true;
  const learningSkipReason =
    normalizeLearningExclusionReason(meta?.learning.skipReason) ??
    normalizeLearningExclusionReason(validationMeta.learningExcludedReason);
  const evidence =
    meta?.evidence ??
    buildLearnerAttemptEvidenceContract({
      testMode: test.mode,
      evaluationEpisodeId:
        meta?.evaluation.episodeId ?? test.evaluationEpisodeId ?? null,
      sequenceRole: meta?.evaluation.sequenceRole ?? null,
      learningEligible,
      learningSkipReason,
      testsPrimary: meta?.evaluation.testsPrimary ?? true,
      chatSecondary:
        meta?.evaluation.chatSecondary ??
        (test.evaluationEpisodeId != null || validationEvaluation != null),
    });

  return NextResponse.json({
    score: attempt.score,
    byTag: buildPublicByTag(byTag),
    meta: meta
      ? {
          predictionVsActual: {
            expectedAccuracy: meta.prediction.expectedAccuracy,
            actualAccuracy: meta.prediction.actualAccuracy,
            expectedTotalDurationMs: meta.prediction.expectedTotalDurationMs,
            actualTotalDurationMs: meta.prediction.actualTotalDurationMs,
          },
          durationPrediction: {
            confidence: meta.prediction.durationConfidence ?? 0,
            basis: meta.prediction.durationBasis ?? "baseline_only",
            components: meta.prediction.durationComponents ?? null,
            predictorVersion: meta.prediction.predictorVersion ?? null,
          },
          predictionRuntime: meta.prediction.runtime ?? null,
          nextDifficultySuggestion: {
            value: meta.pedagogy.nextDifficulty,
            reason: friendlyDifficultyReason(meta.pedagogy.reason),
          },
          evidence,
          dataQuality: {
            excludedFromLearning: meta.learning.skipped,
            reasonCode: learningSkipReason,
            reasonLabel: friendlyLearningSkipReason(learningSkipReason),
          },
        }
      : {
          evidence,
          dataQuality: {
            excludedFromLearning: !learningEligible,
            reasonCode: learningSkipReason,
            reasonLabel: friendlyLearningSkipReason(learningSkipReason),
          },
        },
    alreadySubmitted,
  });
}

function resolveLearningSkipReason(params: {
  isDefaultCollection: boolean;
  complianceFailed: boolean;
  explicitLearningEligible: unknown;
  learningEligible: boolean;
  hasInvalidTagWarnings: boolean;
  validationReason: unknown;
}) {
  if (params.isDefaultCollection) {
    return "DEFAULT_COLLECTION" satisfies LearningExclusionReasonCode;
  }
  if (params.complianceFailed) {
    return "LOW_UX_COMPLIANCE" satisfies LearningExclusionReasonCode;
  }
  if (params.hasInvalidTagWarnings) {
    return "INVALID_TAG_WARNINGS" satisfies LearningExclusionReasonCode;
  }

  const normalizedValidationReason = normalizeLearningExclusionReason(
    params.validationReason,
  );
  if (params.explicitLearningEligible === false && normalizedValidationReason) {
    return normalizedValidationReason;
  }
  if (!params.learningEligible) {
    return normalizedValidationReason ?? "LEARNING_INELIGIBLE";
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return errorResponse(400, "INVALID_INPUT", "Missing test id.");
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return errorResponse(
      401,
      "AUTH_REQUIRED",
      "Missing or invalid token.",
    );
  }

  const rateLimited = await maybeRateLimitSubmit(request, user.id);
  if (rateLimited) {
    return rateLimited;
  }

  let payload: z.infer<typeof SubmitSchema>;
  try {
    payload = SubmitSchema.parse(await request.json());
  } catch {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "Invalid submit payload.",
    );
  }

  const test = await prisma.generatedTest.findUnique({
    where: { id },
    include: {
      subject: { include: { collection: true } },
      tagAssignments: {
        include: {
          axis: true,
          tag: true,
        },
      },
    },
  });

  if (!test) {
    return errorResponse(404, "TEST_NOT_FOUND", "Test not found.");
  }

  if (!test.userId || test.userId !== user.id) {
    return errorResponse(
      403,
      "FORBIDDEN_TEST_OWNERSHIP",
      "You are not allowed to submit this test.",
    );
  }

  const existingAttempt = await prisma.testAttempt.findFirst({
    where: { testId: test.id, userId: user.id },
    select: {
      score: true,
      byTagJson: true,
    },
  });
  if (existingAttempt) {
    return submitSuccessResponse(existingAttempt, test, true);
  }

  const questionsRaw = test.questionsJson;
  if (!Array.isArray(questionsRaw)) {
    return errorResponse(
      500,
      "TEST_DATA_CORRUPT",
      "Stored test data is malformed (questions).",
    );
  }

  const questionSpecs: { optionsCount: number; correctIndex: number }[] = [];
  for (let i = 0; i < questionsRaw.length; i += 1) {
    const question = questionsRaw[i];
    if (!question || typeof question !== "object") {
      return errorResponse(
        500,
        "TEST_DATA_CORRUPT",
        "Stored test data is malformed (question object).",
      );
    }

    const options = (question as { options?: unknown }).options;
    const answerIndex = (question as { answerIndex?: unknown }).answerIndex;
    const answerIndexNumber = Number(answerIndex);
    if (!Array.isArray(options) || options.length === 0) {
      return errorResponse(
        500,
        "TEST_DATA_CORRUPT",
        "Stored test data is malformed (question options).",
      );
    }
    if (
      !Number.isInteger(answerIndexNumber) ||
      answerIndexNumber < 0 ||
      answerIndexNumber >= options.length
    ) {
      return errorResponse(
        500,
        "TEST_DATA_CORRUPT",
        "Stored test data is malformed (correct answer index).",
      );
    }

    questionSpecs.push({
      optionsCount: options.length,
      correctIndex: answerIndexNumber,
    });
  }

  const questionCount = questionSpecs.length;
  if (payload.answers.length !== questionCount) {
    return errorResponse(
      400,
      "INVALID_ANSWERS_LENGTH",
      `Answers length must be ${questionCount}.`,
      {
        index: Math.min(payload.answers.length, questionCount),
      },
    );
  }

  const answerMap: number[] = [];
  for (let i = 0; i < payload.answers.length; i += 1) {
    const value = payload.answers[i];
    if (!Number.isInteger(value)) {
      return errorResponse(
        400,
        "INVALID_ANSWER_TYPE",
        "Answer must be an integer.",
        { index: i },
      );
    }
    const answer = Number(value);
    if (answer < 0 || answer >= questionSpecs[i].optionsCount) {
      return errorResponse(
        400,
        "INVALID_ANSWER_RANGE",
        "Answer index is out of allowed range.",
        { index: i },
      );
    }
    answerMap.push(answer);
  }

  const correctness = questionSpecs.map(
    (question, index) => answerMap[index] === question.correctIndex,
  );

  const byTag: Record<string, Record<string, AxisStats>> = {};
  for (const assignment of test.tagAssignments) {
    const axisKey = assignment.axis.key;
    const tagKey = assignment.tag.key;
    if (!isAxisKnown(axisKey)) continue;
    if (!byTag[axisKey]) byTag[axisKey] = {};
    if (!byTag[axisKey][tagKey]) {
      byTag[axisKey][tagKey] = { correct: 0, total: 0, accuracy: 0 };
    }

    const isCorrect = correctness[assignment.questionIndex] ?? false;
    byTag[axisKey][tagKey].total += 1;
    if (isCorrect) byTag[axisKey][tagKey].correct += 1;
  }

  for (const axisKey of Object.keys(byTag)) {
    for (const tagKey of Object.keys(byTag[axisKey])) {
      const entry = byTag[axisKey][tagKey];
      entry.accuracy = entry.total > 0 ? entry.correct / entry.total : 0;
    }
  }

  const score =
    correctness.length > 0
      ? correctness.filter(Boolean).length / correctness.length
      : 0;

  const isDefaultCollection = test.subject.collection
    ? isDefaultCollectionName(test.subject.collection.name)
    : false;

  const answerChangeCount = payload.answerChangeCount ?? 0;
  const totalDurationMs = payload.totalDurationMs ?? null;
  if (
    payload.perQuestionFirstAnswerMs &&
    payload.perQuestionFirstAnswerMs.length !== questionCount
  ) {
    return errorResponse(
      400,
      "INVALID_TELEMETRY_LENGTH",
      "Telemetry perQuestionFirstAnswerMs length must match question count.",
    );
  }
  const perQuestionFirstAnswerMsJson = Array.isArray(payload.perQuestionFirstAnswerMs)
    ? payload.perQuestionFirstAnswerMs
    : null;

  const testDifficultyTag = dominantTagForAxis(
    test.tagAssignments,
    "difficulty_target",
  );
  const testResponseFormatTag = dominantTagForAxis(
    test.tagAssignments,
    "response_format",
  );

  const uxReward = computeUxReward({
    totalDurationMs,
    answerChangeCount,
    questionCount,
    difficultyTarget: testDifficultyTag,
    responseFormat: testResponseFormatTag,
  });

  const validationMeta =
    test.validationMetaJson && typeof test.validationMetaJson === "object"
      ? (test.validationMetaJson as Record<string, unknown>)
      : {};
  const generationFallback =
    validationMeta.fallback === true ||
    validationMeta.generationSource === "fallback";
  const taggingFallback =
    validationMeta.taggingFallback === true ||
    validationMeta.taggingSource === "mixed" ||
    validationMeta.taggingSource === "rule_fallback" ||
    validationMeta.taggingSource === "fallback";
  const taggingWarnings = Array.isArray(validationMeta.taggingWarnings)
    ? (validationMeta.taggingWarnings as unknown[])
    : [];
  const hasInvalidTagWarnings = taggingWarnings.some(
    (warning) => typeof warning === "string" && warning.includes(":invalid_"),
  );
  const complianceFailed =
    validationMeta.deliveryComplianceFailed === true ||
    validationMeta.learningExcludedReason === "LOW_UX_COMPLIANCE";
  const explicitLearningEligible = validationMeta.learningEligible;
  const learningEligible =
    explicitLearningEligible === false
      ? false
      : !generationFallback && !taggingFallback;
  const learningSkipReason = resolveLearningSkipReason({
    isDefaultCollection,
    complianceFailed,
    explicitLearningEligible,
    learningEligible,
    hasInvalidTagWarnings,
    validationReason: validationMeta.learningExcludedReason,
  });
  const shouldSkipLearning = learningSkipReason !== null;
  const isEpisodeAttempt = Boolean(test.evaluationEpisodeId);

  const recommendationSnapshot =
    test.recommendationSnapshot && typeof test.recommendationSnapshot === "object"
      ? (test.recommendationSnapshot as Record<string, unknown>)
      : null;
  const recommendationMeta =
    recommendationSnapshot &&
    recommendationSnapshot.preset &&
    typeof recommendationSnapshot.preset === "object" &&
    (recommendationSnapshot.preset as Record<string, unknown>).meta &&
    typeof (recommendationSnapshot.preset as Record<string, unknown>).meta ===
      "object"
      ? ((recommendationSnapshot.preset as Record<string, unknown>)
          .meta as Record<string, unknown>)
      : null;
  const explorationUsed = recommendationMeta?.exploration === true;
  const validationEvaluation =
    validationMeta.evaluation && typeof validationMeta.evaluation === "object"
      ? (validationMeta.evaluation as Record<string, unknown>)
      : null;
  const evaluationPedagogicalDecision =
    validationEvaluation?.pedagogicalDecision &&
    typeof validationEvaluation.pedagogicalDecision === "object"
      ? (validationEvaluation.pedagogicalDecision as Record<string, unknown>)
      : null;

  const byTagWithMeta: Record<string, unknown> = { ...byTag };
  const activePredictionRuntime = await getActivePredictionRuntimeConfig();

  try {
    await prisma.$transaction(async (tx) => {
      const historicalAttempts = await tx.testAttempt.findMany({
        where: { userId: user.id },
        select: {
          score: true,
          byTagJson: true,
          createdAt: true,
          test: {
            select: {
              subjectId: true,
              questionCount: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      const durationHistoricalAttempts = await tx.testAttempt.findMany({
        where: {
          userId: user.id,
          perQuestionFirstAnswerMsJson: { not: Prisma.DbNull },
        },
        select: {
          createdAt: true,
          perQuestionFirstAnswerMsJson: true,
        },
        orderBy: { createdAt: "desc" },
        take: DURATION_HISTORY_WINDOW_ATTEMPTS,
      });
      const subjectHistoricalAttempts = historicalAttempts.filter(
        (attempt) => attempt.test.subjectId === test.subjectId,
      );

      const currentDifficulty =
        ((user.effectivePreferencesJson as Record<string, string> | null)
          ?.difficulty_target as string | undefined) ??
        TAGS_BY_AXIS.difficulty_target[1].key;

      const scoresForCurrentDifficulty = subjectHistoricalAttempts
        .filter((attempt) => inferDifficultyFromByTag(attempt.byTagJson) === currentDifficulty)
        .map((attempt) => attempt.score);

      if (testDifficultyTag === currentDifficulty) {
        scoresForCurrentDifficulty.push(score);
      }

      const difficultyTimeline = subjectHistoricalAttempts
        .map((attempt) => inferDifficultyFromByTag(attempt.byTagJson))
        .filter((value): value is string => Boolean(value));
      if (testDifficultyTag) {
        difficultyTimeline.push(testDifficultyTag);
      }

      let attemptsSinceLastDifficultyChange = difficultyTimeline.length;
      for (let i = difficultyTimeline.length - 1; i > 0; i -= 1) {
        if (difficultyTimeline[i] !== difficultyTimeline[i - 1]) {
          attemptsSinceLastDifficultyChange = difficultyTimeline.length - i;
          break;
        }
      }

      const difficultyDecision = decideDifficultyTarget({
        currentDifficulty,
        scoresForCurrentDifficulty,
        attemptsSinceLastDifficultyChange,
      });

      const predictionRuntime = runPredictionRuntime({
        snapshot: activePredictionRuntime,
        featurePayload: buildPredictionFeaturePayload({
          historyAttempts: historicalAttempts,
          durationAttempts: durationHistoricalAttempts,
          subjectId: test.subjectId,
          difficultyTarget: testDifficultyTag,
          responseFormat: testResponseFormatTag,
          questionCount: test.questionCount,
          currentAt: new Date(),
        }),
      });
      const expectedAccuracyCell = predictionRuntime.predicted.expectedAccuracy;
      const durationPrediction = predictionRuntime.predicted.expectedTotalDurationMs;
      const predictionComputedAtIso = new Date().toISOString();

      const policyMeta: AttemptPolicyMeta = {
        learning: {
          eligible: !shouldSkipLearning,
          skipped: shouldSkipLearning,
          skipReason: learningSkipReason,
        },
        evidence: buildLearnerAttemptEvidenceContract({
          testMode: test.mode,
          evaluationEpisodeId: test.evaluationEpisodeId,
          sequenceRole:
            typeof validationEvaluation?.sequenceRole === "string"
              ? validationEvaluation.sequenceRole
              : null,
          learningEligible: !shouldSkipLearning,
          learningSkipReason,
          testsPrimary: true,
          chatSecondary: isEpisodeAttempt,
        }),
        ux: {
          eligible: uxReward.eligible,
          reward: uxReward.reward,
          expectedTimeMs: uxReward.expectedTimeMs,
          timeScore: uxReward.timeScore,
          changePenalty: uxReward.changePenalty,
          skipReason: uxReward.eligible ? null : uxReward.reason,
        },
        pedagogy: {
          currentDifficulty,
          nextDifficulty: difficultyDecision.difficulty,
          changed: difficultyDecision.changed,
          reason: difficultyDecision.reason,
          sampleSize: difficultyDecision.sampleSize,
          smoothedAccuracy: difficultyDecision.smoothedAccuracy,
          attemptsSinceLastDifficultyChange,
        },
        dataQuality: {
          invalidTagWarnings: hasInvalidTagWarnings,
        },
        recommendation: {
          explorationUsed,
        },
        evaluation: {
          episodeId: test.evaluationEpisodeId ?? null,
          protocolKey:
            typeof validationEvaluation?.protocolKey === "string"
              ? validationEvaluation.protocolKey
              : null,
          signalQuality:
            typeof validationEvaluation?.signalQuality === "string"
              ? validationEvaluation.signalQuality
              : "primary_test",
          touchpointType:
            typeof validationEvaluation?.touchpointType === "string"
              ? validationEvaluation.touchpointType
              : null,
          sequenceRole:
            typeof validationEvaluation?.sequenceRole === "string"
              ? validationEvaluation.sequenceRole
              : null,
          itemRole:
            typeof validationEvaluation?.itemRole === "string"
              ? validationEvaluation.itemRole
              : null,
          itemVariant:
            typeof validationEvaluation?.itemVariant === "string"
              ? validationEvaluation.itemVariant
              : null,
          linkageKind:
            typeof validationEvaluation?.linkageKind === "string"
              ? validationEvaluation.linkageKind
              : null,
          linkedContentId:
            typeof validationEvaluation?.linkedContentId === "string"
              ? validationEvaluation.linkedContentId
              : null,
          assessmentChannel:
            typeof validationEvaluation?.assessmentChannel === "string"
              ? validationEvaluation.assessmentChannel
              : null,
          policyArm:
            typeof validationEvaluation?.policyArm === "string"
              ? validationEvaluation.policyArm
              : null,
          assignmentSource:
            validationEvaluation?.assignment &&
            typeof validationEvaluation.assignment === "object" &&
            typeof (validationEvaluation.assignment as Record<string, unknown>)
              .assignmentSource === "string"
              ? String(
                  (validationEvaluation.assignment as Record<string, unknown>)
                    .assignmentSource,
                )
              : null,
          conceptKey:
            typeof validationEvaluation?.conceptKey === "string"
              ? validationEvaluation.conceptKey
              : null,
          skillKey:
            typeof validationEvaluation?.skillKey === "string"
              ? validationEvaluation.skillKey
              : null,
          familyKey:
            typeof validationEvaluation?.familyKey === "string"
              ? validationEvaluation.familyKey
              : null,
          holdoutStrategy:
            typeof validationEvaluation?.holdoutStrategy === "string"
              ? validationEvaluation.holdoutStrategy
              : null,
          delayedMinutes:
            typeof validationEvaluation?.delayedMinutes === "number" &&
            Number.isFinite(validationEvaluation.delayedMinutes)
              ? validationEvaluation.delayedMinutes
              : null,
          contentKind:
            typeof validationEvaluation?.contentKind === "string"
              ? validationEvaluation.contentKind
              : "generated_test",
          contentId: test.id,
          subjectId: test.subjectId,
          sectionId: test.sectionId,
          topic: test.topic,
          pedagogicalDecision:
            typeof evaluationPedagogicalDecision?.difficulty === "string" &&
            typeof evaluationPedagogicalDecision?.depth === "string"
              ? {
                  difficulty: evaluationPedagogicalDecision.difficulty,
                  depth: evaluationPedagogicalDecision.depth,
                }
              : null,
          testsPrimary: true,
          chatSecondary: isEpisodeAttempt,
        },
        policy: {
          policyMode:
            typeof validationMeta.policyMode === "string"
              ? validationMeta.policyMode
              : null,
          policyId:
            typeof validationMeta.policyId === "string"
              ? validationMeta.policyId
              : null,
        },
        prediction: {
          expectedAccuracy: expectedAccuracyCell.value,
          expectedTotalDurationMs: durationPrediction.value,
          durationConfidence: durationPrediction.confidence,
          durationBasis: durationPrediction.basis,
          durationComponents: durationPrediction.components ?? null,
          predictorVersion: durationPrediction.metadata.producerId,
          computedAtIso: predictionComputedAtIso,
          policyMode:
            typeof validationMeta.policyMode === "string"
              ? validationMeta.policyMode
              : null,
          policyId: predictionRuntime.runtime.policyId,
          runtime: predictionRuntime.runtime,
          targets: {
            expectedAccuracy: {
              status: expectedAccuracyCell.status,
              sourceType: expectedAccuracyCell.metadata.sourceType,
              producerId: expectedAccuracyCell.metadata.producerId,
              artifactStatus: expectedAccuracyCell.metadata.artifact.status,
            },
            expectedTotalDurationMs: {
              status: durationPrediction.status,
              sourceType: durationPrediction.metadata.sourceType,
              producerId: durationPrediction.metadata.producerId,
              artifactStatus: durationPrediction.metadata.artifact.status,
            },
          },
          actualAccuracy: score,
          actualTotalDurationMs: totalDurationMs,
        },
      };

      byTagWithMeta._meta = policyMeta;

      const createdAttempt = await tx.testAttempt.create({
        data: {
          testId: test.id,
          userId: user.id,
          answersJson: answerMap,
          score,
          byTagJson: byTagWithMeta as Prisma.InputJsonValue,
          totalDurationMs,
          perQuestionFirstAnswerMsJson:
            perQuestionFirstAnswerMsJson ?? Prisma.DbNull,
          answerChangeCount,
        },
      });

      await recordEvaluationTestOutcome({
        prisma: tx,
        testId: test.id,
        attemptId: createdAttempt.id,
        accuracy: score,
        questionCount: test.questionCount,
        totalDurationMs,
        learningEligible: !shouldSkipLearning,
        learningSkipReason,
        submittedAt: createdAttempt.createdAt,
      });

      if (shouldSkipLearning) {
        return;
      }

      const statUpdates = test.tagAssignments
        .filter((assignment) => isAxisKnown(assignment.axis.key))
        .flatMap((assignment) => {
          const isCorrect = correctness[assignment.questionIndex] ?? false;
          const axisKey = assignment.axis.key;
          const axisIsUx = UX_AXES.includes(axisKey as (typeof UX_AXES)[number]);
          const axisIsPed = PED_AXES.includes(axisKey as (typeof PED_AXES)[number]);

          // Missing telemetry must not update UX preference evidence.
          if (axisIsUx && !uxReward.eligible) {
            return [];
          }

          const correctIncrement = axisIsUx
            ? (uxReward.reward ?? 0)
            : axisIsPed && isCorrect
              ? 1
              : 0;

          return [
            tx.userTagStat.upsert({
              where: {
                userId_axisId_tagId: {
                  userId: user.id,
                  axisId: assignment.axisId,
                  tagId: assignment.tagId,
                },
              },
              update: {
                totalCount: { increment: 1 },
                correctCount: { increment: correctIncrement },
              },
              create: {
                userId: user.id,
                axisId: assignment.axisId,
                tagId: assignment.tagId,
                totalCount: 1,
                correctCount: correctIncrement,
              },
            }),
          ];
        });

      await Promise.all(statUpdates);

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { testsTaken: { increment: 1 } },
      });

      const stats = await tx.userTagStat.findMany({
        where: { userId: user.id },
        include: { axis: true, tag: true },
      });

      const currentEffective =
        (updatedUser.effectivePreferencesJson as Record<string, string> | null) ??
        {};
      const { effective, axesReady } = computeLayeredPreferences(
        stats.map((stat) => ({
          axisKey: stat.axis.key,
          tagKey: stat.tag.key,
          correctCount: stat.correctCount,
          totalCount: stat.totalCount,
        })),
        currentEffective,
        score,
      );

      effective.difficulty_target = difficultyDecision.difficulty;

      await tx.user.update({
        where: { id: user.id },
        data: {
          effectivePreferencesJson: effective,
          personalizationReady: isPersonalizationReady(
            axesReady,
            updatedUser.testsTaken,
          ),
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const attemptAfterConflict = await prisma.testAttempt.findFirst({
        where: { testId: test.id, userId: user.id },
        select: {
          score: true,
          byTagJson: true,
        },
      });
      if (attemptAfterConflict) {
        return submitSuccessResponse(attemptAfterConflict, test, true);
      }
      return errorResponse(
        409,
        "ALREADY_SUBMITTED",
        "Submission already exists for this user and test.",
      );
    }
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Unable to persist submission.",
    );
  }

  return submitSuccessResponse({ score, byTagJson: byTagWithMeta }, test, false);
}
