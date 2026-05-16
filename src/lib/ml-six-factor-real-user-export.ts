import { Prisma, PrismaClient } from "@prisma/client";
import {
  buildSixFactorDeliveredConfigMetadata,
  readSixFactorDeliveredConfigMetadata,
  type SixFactorDeliveredConfigMetadataV1,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  buildMissingSixFactorOutcome,
  buildSixFactorOutcome,
  buildSixFactorOutcomeLink,
  type SixFactorOutcomeLinkV1,
} from "@/lib/ml-six-factor-outcome-linking";
import {
  buildTrainingObservationV1FromAppRecord,
  isTrainingObservationV1Shape,
  type TrainingObservationV1,
} from "@/lib/ml-six-factor-training-observation";
import { type SixFactorDecisionMetadataV1 } from "@/lib/ml-six-factor-shadow";

export type RealUserTrainingObservationExportOptions = {
  limit?: number | null;
  since?: string | null;
  includeOutcomeMissing?: boolean;
  smokeOnly?: boolean;
  datasetOriginPrefix?: string | null;
  strictEpisodeOutcomeLinking?: boolean;
};

export type RealUserTrainingObservationExportSummary = {
  totalScanned: number;
  exportedObservations: number;
  withOutcome: number;
  withoutOutcome: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sourcePaths: string[];
  leakageViolationsCount: number;
  skippedAmbiguous: number;
  skippedMissingPrecheck: number;
  skippedMissingPostcheck: number;
};

export type RealUserTrainingObservationExportResult = {
  observations: TrainingObservationV1[];
  summary: RealUserTrainingObservationExportSummary;
};

type LoadedEpisodes = Awaited<ReturnType<typeof loadExportEpisodes>>;
type LoadedEpisode = LoadedEpisodes[number];
type LoadedItem = LoadedEpisode["items"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1000;
  return Math.max(1, Math.min(10_000, Math.floor(value)));
}

function normalizeDatasetOriginPrefix(
  options: RealUserTrainingObservationExportOptions,
) {
  const explicit = readString(options.datasetOriginPrefix);
  if (explicit) return explicit;
  return options.smokeOnly === true ? "ml_e2e_smoke_" : null;
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function hasSixFactorMarker(value: unknown) {
  if (!isRecord(value)) return false;
  return "sixFactorDeliveredConfig" in value || "sixFactorShadow" in value;
}

function sourcePathForItem(item: LoadedItem) {
  return item.contentKind === "generated_test"
    ? "GeneratedTest.validationMetaJson"
    : "ChatMessage.signalsJson";
}

async function loadExportEpisodes(
  prisma: PrismaClient,
  options: RealUserTrainingObservationExportOptions,
) {
  const since = readDate(options.since);
  const datasetOriginPrefix = normalizeDatasetOriginPrefix(options);

  return prisma.evaluationEpisode.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(datasetOriginPrefix
        ? { datasetOrigin: { startsWith: datasetOriginPrefix } }
        : {}),
      user: {
        trainingDataExclusionAt: null,
        researchConsentWithdrawnAt: null,
      },
    },
    orderBy: { createdAt: "asc" },
    take: normalizeLimit(options.limit),
    select: {
      id: true,
      userId: true,
      subjectId: true,
      topic: true,
      conceptKey: true,
      skillKey: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          researchConsentAt: true,
          researchConsentWithdrawnAt: true,
          trainingDataExclusionAt: true,
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
          subjectId: true,
          topic: true,
          conceptKey: true,
          skillKey: true,
          decisionRuntimeJson: true,
          outcomeJson: true,
          deliveredAt: true,
          outcomeRecordedAt: true,
        },
      },
    },
  });
}

async function loadContentMetadataMaps(
  prisma: PrismaClient,
  items: LoadedItem[],
) {
  const generatedTestIds = [
    ...new Set(
      items
        .filter((item) => item.contentKind === "generated_test")
        .map((item) => item.contentId),
    ),
  ];
  const chatSessionIds = [
    ...new Set(
      items
        .filter((item) => item.contentKind === "chat_session")
        .map((item) => item.contentId),
    ),
  ];

  const [tests, messages] = await Promise.all([
    generatedTestIds.length > 0
      ? prisma.generatedTest.findMany({
          where: { id: { in: generatedTestIds } },
          select: { id: true, validationMetaJson: true },
        })
      : Promise.resolve([]),
    chatSessionIds.length > 0
      ? prisma.chatMessage.findMany({
          where: {
            sessionId: { in: chatSessionIds },
            role: "assistant",
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sessionId: true,
            signalsJson: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const testMetadata = new Map(
    tests.map((test) => [test.id, test.validationMetaJson] as const),
  );
  const chatMetadata = new Map<string, Prisma.JsonValue | null>();
  for (const message of messages) {
    if (readSixFactorDeliveredConfigMetadata(message.signalsJson)) {
      chatMetadata.set(message.sessionId, message.signalsJson);
    }
  }

  return { testMetadata, chatMetadata };
}

function readMetadataForItem(params: {
  item: LoadedItem;
  contentMetadata: Prisma.JsonValue | null | undefined;
}) {
  const sources = [params.item.decisionRuntimeJson, params.contentMetadata];

  for (const source of sources) {
    const metadata = readSixFactorDeliveredConfigMetadata(source);
    if (metadata) return metadata;
  }

  return null;
}

function readOutcomeFromItem(item: LoadedItem) {
  if (!isRecord(item.outcomeJson)) return null;
  const accuracy =
    typeof item.outcomeJson.accuracy === "number" &&
    Number.isFinite(item.outcomeJson.accuracy)
      ? Math.max(0, Math.min(1, item.outcomeJson.accuracy))
      : null;

  return {
    testEventRef: item.contentId,
    accuracy,
    questionCount:
      typeof item.outcomeJson.questionCount === "number" &&
      Number.isFinite(item.outcomeJson.questionCount)
        ? Math.max(0, Math.floor(item.outcomeJson.questionCount))
        : null,
    submittedAtIso:
      typeof item.outcomeJson.submittedAtIso === "string"
        ? item.outcomeJson.submittedAtIso
        : item.outcomeRecordedAt?.toISOString() ?? null,
  };
}

function isStrictLearningContentItem(item: LoadedItem) {
  return item.sequenceRole === "learning_content";
}

function strictOutcomeSkipReason(params: {
  items: LoadedItem[];
  item: LoadedItem;
  previousOutcome: LoadedItem | undefined;
  targetOutcome: LoadedItem | undefined;
}) {
  if (!isStrictLearningContentItem(params.item)) return "strict_non_learning_content";
  if (params.previousOutcome?.sequenceRole !== "precheck") {
    return "strict_missing_precheck";
  }
  if (params.targetOutcome?.sequenceRole !== "postcheck") {
    return "strict_missing_postcheck";
  }

  const unrelatedGeneratedTestsBetween = params.items.filter(
    (candidate) =>
      candidate.sequenceIndex > params.previousOutcome!.sequenceIndex &&
      candidate.sequenceIndex < params.targetOutcome!.sequenceIndex &&
      candidate.contentKind === "generated_test" &&
      candidate.id !== params.previousOutcome!.id &&
      candidate.id !== params.targetOutcome!.id,
  );
  if (unrelatedGeneratedTestsBetween.length > 0) {
    return "strict_ambiguous_episode";
  }

  return null;
}

function findPreviousOutcome(items: LoadedItem[], item: LoadedItem) {
  return [...items]
    .reverse()
    .find(
      (candidate) =>
        candidate.sequenceIndex < item.sequenceIndex &&
        candidate.contentKind === "generated_test" &&
        readOutcomeFromItem(candidate) != null,
    );
}

function findTargetOutcome(items: LoadedItem[], item: LoadedItem) {
  if (item.contentKind === "generated_test" && readOutcomeFromItem(item)) {
    return item;
  }

  return items.find(
    (candidate) =>
      candidate.sequenceIndex > item.sequenceIndex &&
      candidate.contentKind === "generated_test" &&
      readOutcomeFromItem(candidate) != null,
  );
}

function buildOutcomeLinkForItem(params: {
  episode: LoadedEpisode;
  item: LoadedItem;
  metadata: SixFactorDeliveredConfigMetadataV1;
  strictEpisodeOutcomeLinking?: boolean;
}) {
  const previousOutcome = findPreviousOutcome(params.episode.items, params.item);
  const targetOutcome = findTargetOutcome(params.episode.items, params.item);
  const strictSkipReason =
    params.strictEpisodeOutcomeLinking === true
      ? strictOutcomeSkipReason({
          items: params.episode.items,
          item: params.item,
          previousOutcome,
          targetOutcome,
        })
      : null;
  const previous = previousOutcome ? readOutcomeFromItem(previousOutcome) : null;
  const target = targetOutcome ? readOutcomeFromItem(targetOutcome) : null;

  if (strictSkipReason) {
    return { outcomeLink: null, skipReason: strictSkipReason } as const;
  }

  if (!target || target.accuracy == null) {
    return {
      outcomeLink: buildSixFactorOutcomeLink({
        contentEventRef: params.item.contentId,
        testEventRef: targetOutcome?.contentId ?? null,
        userRef: params.episode.userId,
        subjectRef: params.item.subjectId ?? params.episode.subjectId,
        topicRef:
          params.item.conceptKey ??
          params.episode.conceptKey ??
          params.item.skillKey ??
          params.episode.skillKey ??
          params.item.topic ??
          params.episode.topic,
        sessionRef: params.episode.id,
        decisionCreatedAt: params.metadata.decisionCreatedAt,
        outcomeObservedAt: null,
        outcome: buildMissingSixFactorOutcome(),
      }),
      skipReason: null,
    } as const;
  }

  return {
    outcomeLink: buildSixFactorOutcomeLink({
      contentEventRef: params.item.contentId,
      testEventRef: target.testEventRef,
      userRef: params.episode.userId,
      subjectRef: params.item.subjectId ?? params.episode.subjectId,
      topicRef:
        params.item.conceptKey ??
        params.episode.conceptKey ??
        params.item.skillKey ??
        params.episode.skillKey ??
        params.item.topic ??
        params.episode.topic,
      sessionRef: params.episode.id,
      decisionCreatedAt: params.metadata.decisionCreatedAt,
      outcomeObservedAt: target.submittedAtIso,
      outcome: buildSixFactorOutcome({
        preScore: previous?.accuracy ?? null,
        postScore: target.accuracy,
        maxScore: 1,
        nextStepSuccess: target.accuracy >= 0.7,
        outcomeAvailable: true,
      }),
    }),
    skipReason: null,
  } as const;
}

function buildObservationFromItem(params: {
  episode: LoadedEpisode;
  item: LoadedItem;
  metadata: SixFactorDeliveredConfigMetadataV1;
  outcomeLink: SixFactorOutcomeLinkV1;
}) {
  return buildTrainingObservationV1FromAppRecord({
    deliveredMetadata: params.metadata,
    outcomeLink: params.outcomeLink,
    userRef: params.episode.userId,
    subjectRef: params.item.subjectId ?? params.episode.subjectId,
    topicRef:
      params.item.conceptKey ??
      params.episode.conceptKey ??
      params.item.skillKey ??
      params.episode.skillKey ??
      params.item.topic ??
      params.episode.topic,
    sessionRef: params.episode.id,
    contentEventRef: params.item.contentId,
    testEventRef: params.outcomeLink.testEventRef,
  });
}

export function summarizeRealUserTrainingObservations(
  observations: TrainingObservationV1[],
  params: {
    totalScanned: number;
    skipped: number;
    skipReasons: Record<string, number>;
    sourcePaths: string[];
  },
): RealUserTrainingObservationExportSummary {
  return {
    totalScanned: params.totalScanned,
    exportedObservations: observations.length,
    withOutcome: observations.filter((row) => row.outcome.outcome_available)
      .length,
    withoutOutcome: observations.filter((row) => !row.outcome.outcome_available)
      .length,
    skipped: params.skipped,
    skipReasons: params.skipReasons,
    sourcePaths: [...new Set(params.sourcePaths)].sort(),
    leakageViolationsCount: observations.filter(
      (row) => row.leakage_guard.uses_only_pre_decision_data !== true,
    ).length,
    skippedAmbiguous: params.skipReasons.strict_ambiguous_episode ?? 0,
    skippedMissingPrecheck: params.skipReasons.strict_missing_precheck ?? 0,
    skippedMissingPostcheck: params.skipReasons.strict_missing_postcheck ?? 0,
  };
}

export async function exportRealUserTrainingObservations(
  prisma: PrismaClient,
  options: RealUserTrainingObservationExportOptions = {},
): Promise<RealUserTrainingObservationExportResult> {
  const limit = normalizeLimit(options.limit);
  const includeOutcomeMissing = options.includeOutcomeMissing === true;
  const episodes = await loadExportEpisodes(prisma, {
    ...options,
    limit,
  });
  const items = episodes.flatMap((episode) => episode.items);
  const metadataMaps = await loadContentMetadataMaps(prisma, items);
  const observations: TrainingObservationV1[] = [];
  const skipReasons: Record<string, number> = {};
  const sourcePaths: string[] = [];
  let totalScanned = 0;

  for (const episode of episodes) {
    for (const item of episode.items) {
      if (observations.length >= limit) break;
      totalScanned += 1;

      const contentMetadata =
        item.contentKind === "generated_test"
          ? metadataMaps.testMetadata.get(item.contentId)
          : metadataMaps.chatMetadata.get(item.contentId);
      const metadata = readMetadataForItem({ item, contentMetadata });

      if (!metadata) {
        const hasMarker =
          hasSixFactorMarker(item.decisionRuntimeJson) ||
          hasSixFactorMarker(contentMetadata);
        increment(
          skipReasons,
          hasMarker
            ? "malformed_six_factor_metadata"
            : "missing_six_factor_metadata",
        );
        continue;
      }

      const outcomeLinkResult = buildOutcomeLinkForItem({
        episode,
        item,
        metadata,
        strictEpisodeOutcomeLinking: options.strictEpisodeOutcomeLinking,
      });
      if (!outcomeLinkResult.outcomeLink) {
        increment(skipReasons, outcomeLinkResult.skipReason);
        continue;
      }
      const outcomeLink = outcomeLinkResult.outcomeLink;
      if (!outcomeLink.outcome.outcome_available && !includeOutcomeMissing) {
        increment(skipReasons, "missing_outcome");
        continue;
      }

      const observation = buildObservationFromItem({
        episode,
        item,
        metadata,
        outcomeLink,
      });
      if (!isTrainingObservationV1Shape(observation)) {
        increment(skipReasons, "invalid_training_observation_shape");
        continue;
      }

      observations.push(observation);
      sourcePaths.push(sourcePathForItem(item));
    }
  }

  const skipped = Object.values(skipReasons).reduce((sum, count) => sum + count, 0);

  return {
    observations,
    summary: summarizeRealUserTrainingObservations(observations, {
      totalScanned,
      skipped,
      skipReasons,
      sourcePaths,
    }),
  };
}

export function buildMockRealUserTrainingObservationExport(): RealUserTrainingObservationExportResult {
  const decisionCreatedAt = "2026-05-08T10:00:00.000Z";
  const sixFactorShadow = {
    sixFactorDecisionVersion: "eduai_app_six_factor_decision_v1_2026_05",
    featuresVersion: "eduai_app_policy_features_v1_2026_05",
    candidateConfig: {
      difficulty: "medium",
      depth: "standard",
      support_level: "guided",
      presentation_format: "step_by_step",
      examples_level: "single",
      terminology_level: "balanced",
    },
    deliveredConfig: {
      difficulty: "medium",
      depth: "standard",
      support_level: "guided",
      presentation_format: "step_by_step",
      examples_level: "single",
      terminology_level: "balanced",
    },
    decisionSource: "heuristic_baseline",
    policyId: "v2_personalized",
    modelVersion: null,
    backendKind: "heuristic_baseline",
    artifactPath: null,
    fallbackUsed: true,
    candidateCount: 8,
    confidence: null,
    warnings: ["dry_run_mock_record"],
    featuresSnapshot: {
      userRef: "mock_user",
      subjectRef: "mock_subject",
      topicRef: "mock_concept",
      sessionRef: "mock_episode",
      contentEventRef: "mock_learning_content_session",
      priorAttemptsCount: 3,
      priorCorrectRate: 0.4,
      recentCorrectRate: 0.5,
      recentAttemptsCount: 2,
      topicSeenCount: 1,
      minutesSinceLastActivity: 12,
      sessionPosition: 2,
      declaredPreferenceDifficulty: "medium",
      declaredPreferenceDepth: "standard",
      declaredPreferenceFormat: null,
      previousDifficulty: "medium",
      previousDepth: "standard",
      policyId: "v2_personalized",
      backendKind: "heuristic_baseline",
      modelVersion: null,
    },
    featureRefs: {
      userRef: "mock_user",
      subjectRef: "mock_subject",
      topicRef: "mock_concept",
      sessionRef: "mock_episode",
      contentEventRef: "mock_learning_content_session",
    },
    leakageGuard: {
      usesOnlyPreDecisionData: true,
      outcomeFieldsIncluded: false,
    },
    appliedToLearnerFacingOutput: true,
    appliedPromptInstructionCount: 6,
    appliedPath: "learning_content",
  } satisfies SixFactorDecisionMetadataV1;
  const deliveredMetadata = buildSixFactorDeliveredConfigMetadata({
    sixFactorShadow,
    decisionCreatedAt,
    featuresCutoffAt: decisionCreatedAt,
  });
  const outcomeLink = buildSixFactorOutcomeLink({
    contentEventRef: "mock_learning_content_session",
    testEventRef: "mock_postcheck_test",
    userRef: "mock_user",
    subjectRef: "mock_subject",
    topicRef: "mock_concept",
    sessionRef: "mock_episode",
    decisionCreatedAt,
    outcomeObservedAt: "2026-05-08T10:08:00.000Z",
    outcome: buildSixFactorOutcome({
      preScore: 0.4,
      postScore: 0.8,
      maxScore: 1,
      nextStepSuccess: true,
      outcomeAvailable: true,
    }),
  });
  const observations = [
    buildTrainingObservationV1FromAppRecord({
      deliveredMetadata,
      outcomeLink,
      userRef: "mock_user",
      subjectRef: "mock_subject",
      topicRef: "mock_concept",
      sessionRef: "mock_episode",
      contentEventRef: "mock_learning_content_session",
      testEventRef: "mock_postcheck_test",
    }),
  ];

  return {
    observations,
    summary: summarizeRealUserTrainingObservations(observations, {
      totalScanned: 1,
      skipped: 0,
      skipReasons: {},
      sourcePaths: ["dry_run_mock"],
    }),
  };
}
