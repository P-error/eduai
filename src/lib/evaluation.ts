import { Prisma, PrismaClient } from "@prisma/client";
import {
  buildDecisionProvenanceV1,
  buildDeliveredPedagogicalDecisionV1,
  buildLearnerStateSnapshotV1,
  normalizeToPedagogicalDecisionV1,
  type DeliveredPedagogicalDecisionV1,
} from "@/lib/pedagogical-decision-contract";
import {
  normalizeTrainingDatasetOrigin,
  normalizeTrainingDatasetPhase,
  type TrainingDatasetPhase,
} from "@/lib/training-dataset-contract";
import {
  readSixFactorDeliveredConfigMetadata,
} from "@/lib/ml-six-factor-decision-metadata";
import {
  buildSixFactorCompatibilityPedagogicalDecisionFromMetadata,
} from "@/lib/ml-six-factor-primary-decision";

export const EVALUATION_SCHEMA_VERSION =
  "evaluation_protocol_v1_2026_03" as const;
export const EVALUATION_EPISODE_SUMMARY_SCHEMA_VERSION =
  "evaluation_episode_summary_v1_2026_03" as const;
export const EVALUATION_OBJECTIVE_KEY = "learning_gain_support_v1" as const;
export const DEFAULT_EVALUATION_PROTOCOL_KEY =
  "runtime_observational_v1" as const;
export const STRUCTURED_EVALUATION_PROTOCOL_KEY =
  "learning_gain_episode_v1" as const;

const EVALUATION_CANONICAL_POLICY_ARMS = [
  "baseline",
  "self_report",
  "predicted",
  "heuristic_default",
  "manual_override",
  "observational",
] as const;
export const EVALUATION_POLICY_ARMS = [
  ...EVALUATION_CANONICAL_POLICY_ARMS,
  "baseline_heuristic",
  "self_report_driven",
  "predicted_personalized",
] as const;
export type EvaluationPolicyArmInput = (typeof EVALUATION_POLICY_ARMS)[number];
export type EvaluationPolicyArm =
  (typeof EVALUATION_CANONICAL_POLICY_ARMS)[number];

const EVALUATION_CANONICAL_TOUCHPOINT_TYPES = [
  "prior_signal",
  "pre_check",
  "content_delivery",
  "post_check",
  "holdout",
  "delayed_recheck",
] as const;
export const EVALUATION_TOUCHPOINT_TYPES =
  EVALUATION_CANONICAL_TOUCHPOINT_TYPES;
export type EvaluationTouchpointType =
  (typeof EVALUATION_CANONICAL_TOUCHPOINT_TYPES)[number];

const EVALUATION_CANONICAL_SEQUENCE_ROLES = [
  "prior_signal",
  "precheck",
  "learning_content",
  "postcheck",
  "holdout",
  "delayed_recheck",
] as const;
export const EVALUATION_SEQUENCE_ROLES =
  EVALUATION_CANONICAL_SEQUENCE_ROLES;
export type EvaluationSequenceRole =
  (typeof EVALUATION_CANONICAL_SEQUENCE_ROLES)[number];

const EVALUATION_CANONICAL_ITEM_ROLES = [
  "training",
  "evaluation",
  "supporting_signal",
] as const;
export const EVALUATION_ITEM_ROLES = [
  ...EVALUATION_CANONICAL_ITEM_ROLES,
  "assessment",
  "mixed",
] as const;
export type EvaluationItemRoleInput = (typeof EVALUATION_ITEM_ROLES)[number];
export type EvaluationItemRole =
  (typeof EVALUATION_CANONICAL_ITEM_ROLES)[number];

export const EVALUATION_ITEM_VARIANTS = [
  "unknown",
  "direct_repeat",
  "isomorphic_same_skill",
  "holdout_unseen",
  "delayed_holdout",
] as const;
export type EvaluationItemVariant = (typeof EVALUATION_ITEM_VARIANTS)[number];

export const EVALUATION_LINKAGE_KINDS = [
  "none",
  "direct_repeat_of",
  "isomorphic_family_of",
  "holdout_skill_check",
  "delayed_recheck_of",
] as const;
export type EvaluationLinkageKind = (typeof EVALUATION_LINKAGE_KINDS)[number];

export const EVALUATION_HOLDOUT_STRATEGIES = [
  "none",
  "isomorphic_same_skill",
  "holdout_unseen",
  "delayed_holdout",
] as const;
export type EvaluationHoldoutStrategy =
  (typeof EVALUATION_HOLDOUT_STRATEGIES)[number];

export const EVALUATION_ASSESSMENT_CHANNELS = [
  "none",
  "embedded_next_task_success_proxy",
  "holdout_test",
  "chat_support",
] as const;
export type EvaluationAssessmentChannel =
  (typeof EVALUATION_ASSESSMENT_CHANNELS)[number];

export const EVALUATION_SIGNAL_QUALITY = [
  "primary_test",
  "secondary_chat_support",
] as const;
export type EvaluationSignalQuality =
  (typeof EVALUATION_SIGNAL_QUALITY)[number];

export type EvaluationContentKind = "generated_test" | "chat_session";

export type EvaluationRequestInput = {
  episodeId?: string | null;
  clientKey?: string | null;
  protocolKey?: string | null;
  touchpointType?: EvaluationTouchpointType | null;
  sequenceRole?: EvaluationSequenceRole | null;
  itemRole?: EvaluationItemRoleInput | null;
  itemVariant?: EvaluationItemVariant | null;
  linkageKind?: EvaluationLinkageKind | null;
  linkedContentId?: string | null;
  assignmentArm?: EvaluationPolicyArmInput | null;
  conceptKey?: string | null;
  skillKey?: string | null;
  familyKey?: string | null;
  holdoutStrategy?: EvaluationHoldoutStrategy | null;
  delayedMinutes?: number | null;
  expectedTouchpoints?: EvaluationTouchpointType[] | null;
  expectedSequenceRoles?: EvaluationSequenceRole[] | null;
};

export type EvaluationPolicySelection = {
  arm: EvaluationPolicyArm;
  requestedArm: EvaluationPolicyArm | null;
  assignmentSource: "explicit_request" | "runtime_default";
  selectionMode:
    | "baseline_default"
    | "self_report_declared"
    | "predicted_runtime"
    | "heuristic_default"
    | "manual_override"
    | "observational_only";
  personalizationMode: "on" | "off" | null;
  policyMode: string | null;
  policyId: string | null;
};

export type EvaluationAssignmentMeta = {
  schemaVersion: typeof EVALUATION_SCHEMA_VERSION;
  arm: EvaluationPolicyArm;
  requestedArm: EvaluationPolicyArm | null;
  assignmentSource: "explicit_request" | "runtime_default";
  selectionMode: EvaluationPolicySelection["selectionMode"];
  personalizationMode: "on" | "off" | null;
  policyMode: string | null;
  policyId: string | null;
  runtimePolicyId: string | null;
  backendKind: string | null;
  backendId: string | null;
  assignedAtIso: string;
};

export type EvaluationEpisodeDesign = {
  schemaVersion: typeof EVALUATION_SCHEMA_VERSION;
  objectiveKey: typeof EVALUATION_OBJECTIVE_KEY;
  protocolKey: string;
  expectedTouchpoints: EvaluationTouchpointType[];
  expectedSequenceRoles: EvaluationSequenceRole[];
  supportedTouchpoints: EvaluationTouchpointType[];
  supportedSequenceRoles: EvaluationSequenceRole[];
  primarySignalKind: "tests_primary_learning_signal";
  secondarySignals: Array<"chat_support_only">;
  practiceEffectControl: {
    holdoutStrategy: EvaluationHoldoutStrategy;
    directRepeatSeparated: boolean;
    isomorphicFamilySupported: boolean;
    delayedRecheckSupported: boolean;
    trainingVsEvaluationSeparated: boolean;
  };
  linkageContract: {
    familyKeyRequiredForIsomorphic: boolean;
    linkedContentSupported: boolean;
    supportedLinkageKinds: EvaluationLinkageKind[];
  };
};

export type EvaluationItemMeta = {
  schemaVersion: typeof EVALUATION_SCHEMA_VERSION;
  episodeId: string;
  objectiveKey: typeof EVALUATION_OBJECTIVE_KEY;
  protocolKey: string;
  contentKind: EvaluationContentKind;
  signalQuality: EvaluationSignalQuality;
  touchpointType: EvaluationTouchpointType;
  sequenceRole: EvaluationSequenceRole;
  itemRole: EvaluationItemRole;
  itemVariant: EvaluationItemVariant;
  linkageKind: EvaluationLinkageKind;
  linkedContentId: string | null;
  assessmentChannel: EvaluationAssessmentChannel;
  policyArm: EvaluationPolicyArm;
  conceptKey: string | null;
  skillKey: string | null;
  familyKey: string | null;
  holdoutStrategy: EvaluationHoldoutStrategy;
  delayedMinutes: number | null;
  topic: string | null;
  subjectId: string | null;
  sectionId: string | null;
  pedagogicalDecision:
    | {
        difficulty: string;
        depth: string;
        [key: string]: unknown;
      }
    | null;
  decisionRuntime: {
    runtimePolicyId: string | null;
    backendKind: string | null;
    backendId: string | null;
    [key: string]: unknown;
  };
  assignment: EvaluationAssignmentMeta;
};

export type EvaluationItemRecord = {
  id: string;
  episodeId: string;
  contentKind: EvaluationContentKind;
  contentId: string;
  sequenceIndex: number;
  sequenceRole: EvaluationSequenceRole;
  touchpointType: EvaluationTouchpointType;
  signalQuality: EvaluationSignalQuality;
  itemRole: EvaluationItemRole;
  itemVariant: EvaluationItemVariant;
  linkageKind: EvaluationLinkageKind;
  linkedContentId: string | null;
  familyKey: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  holdoutStrategy: EvaluationHoldoutStrategy;
  delayedMinutes: number | null;
  policyArm: EvaluationPolicyArm;
  subjectId: string | null;
  sectionId: string | null;
  topic: string | null;
  pedagogicalDecision:
    | {
        difficulty: string;
        depth: string;
      }
    | null;
  decisionRuntime: {
    runtimePolicyId: string | null;
    backendKind: string | null;
    backendId: string | null;
  };
  outcome: {
    attemptId: string | null;
    accuracy: number | null;
    questionCount: number | null;
    totalDurationMs: number | null;
    submittedAtIso: string | null;
    learningEligible: boolean | null;
    learningSkipReason?: string | null;
    adaptiveStateUpdated?: boolean | null;
  } | null;
  deliveredAtIso: string;
  outcomeRecordedAtIso: string | null;
  deliveredDecisionBoundary: DeliveredPedagogicalDecisionV1 | null;
};

export type EvaluationEpisodeSummary = {
  schemaVersion: typeof EVALUATION_EPISODE_SUMMARY_SCHEMA_VERSION;
  objectiveKey: typeof EVALUATION_OBJECTIVE_KEY;
  episodeId: string;
  protocolKey: string;
  status: string;
  arm: EvaluationPolicyArm;
  subjectId: string | null;
  sectionId: string | null;
  topic: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  assignment: EvaluationAssignmentMeta;
  design: EvaluationEpisodeDesign;
  counts: {
    totalItems: number;
    testItems: number;
    chatItems: number;
    trainingItems: number;
    evaluationItems: number;
    supportingItems: number;
    completedTestOutcomes: number;
  };
  sequence: {
    expected: EvaluationSequenceRole[];
    observed: EvaluationSequenceRole[];
    completed: EvaluationSequenceRole[];
    missing: EvaluationSequenceRole[];
  };
  timing: {
    episodeCreatedAtIso: string;
    firstDeliveredAtIso: string | null;
    lastDeliveredAtIso: string | null;
    lastOutcomeAtIso: string | null;
    maxDelayedMinutes: number | null;
  };
  practiceEffect: {
    directRepeatCount: number;
    isomorphicCount: number;
    holdoutCount: number;
    delayedCount: number;
    familyKeys: string[];
    linkedPairs: Array<{
      contentId: string;
      linkedContentId: string;
      linkageKind: EvaluationLinkageKind;
    }>;
  };
  primaryOutcomes: Array<{
    sequenceRole: EvaluationSequenceRole;
    contentId: string;
    contentKind: EvaluationContentKind;
    sequenceIndex: number;
    accuracy: number | null;
    questionCount: number | null;
    totalDurationMs: number | null;
    submittedAtIso: string | null;
    learningEligible: boolean | null;
    learningSkipReason?: string | null;
    adaptiveStateUpdated?: boolean | null;
  }>;
  items: EvaluationItemRecord[];
};

export type EvaluationEpisodeExportOptions = {
  timeRangeDays?: number;
  maxEpisodes?: number;
  format?: "jsonl" | "json";
};

export type EvaluationEpisodeExportResult = {
  schemaVersion: typeof EVALUATION_EPISODE_SUMMARY_SCHEMA_VERSION;
  generatedAtIso: string;
  format: "jsonl" | "json";
  counts: {
    exportedEpisodes: number;
  };
  filters: {
    timeRangeDays: number;
    maxEpisodes: number;
    format: "jsonl" | "json";
  };
  content: string;
};

type ResolveEpisodeResult = {
  episode: {
    id: string;
    clientKey?: string | null;
    protocolKey: string;
    policyArm: string;
    status: string;
    topic: string | null;
    conceptKey: string | null;
    skillKey: string | null;
    designJson: Prisma.JsonValue;
    assignmentJson: Prisma.JsonValue;
  };
  created: boolean;
};

type EpisodePrismaClient = PrismaClient | Prisma.TransactionClient;

const DEFAULT_STRUCTURED_SEQUENCE = [
  "precheck",
  "learning_content",
  "postcheck",
] as const satisfies readonly EvaluationSequenceRole[];
const DEFAULT_OBSERVATIONAL_SEQUENCE = [
  "learning_content",
] as const satisfies readonly EvaluationSequenceRole[];

const POLICY_ARM_ALIASES: Record<string, EvaluationPolicyArm> = {
  baseline: "baseline",
  baseline_heuristic: "baseline",
  self_report: "self_report",
  self_report_driven: "self_report",
  predicted: "predicted",
  predicted_personalized: "predicted",
  heuristic_default: "heuristic_default",
  manual_override: "manual_override",
  observational: "observational",
};

const TOUCHPOINT_TO_SEQUENCE_ROLE: Record<
  EvaluationTouchpointType,
  EvaluationSequenceRole
> = {
  prior_signal: "prior_signal",
  pre_check: "precheck",
  content_delivery: "learning_content",
  post_check: "postcheck",
  holdout: "holdout",
  delayed_recheck: "delayed_recheck",
};

const SEQUENCE_ROLE_TO_TOUCHPOINT: Record<
  EvaluationSequenceRole,
  EvaluationTouchpointType
> = {
  prior_signal: "prior_signal",
  precheck: "pre_check",
  learning_content: "content_delivery",
  postcheck: "post_check",
  holdout: "holdout",
  delayed_recheck: "delayed_recheck",
};

function asObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function clamp01(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function buildDeliveredDecisionBoundaryFromStoredItem(params: {
  episodeId: string;
  contentKind: string;
  contentId: string;
  sequenceRole: string;
  touchpointType: string;
  subjectId: string | null;
  sectionId: string | null;
  topic: string | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  } | null;
  decisionRuntime: {
    runtimePolicyId: string | null;
    backendKind: string | null;
    backendId: string | null;
  };
  deliveredAt: Date;
}): DeliveredPedagogicalDecisionV1 | null {
  if (!params.pedagogicalDecision) {
    return null;
  }

  const learnerStateSnapshot = buildLearnerStateSnapshotV1({
    recentPerformance: {
      recentAccuracy: null,
      totalQuestionsBefore: null,
      timeSinceLastAttemptSec: null,
    },
    topicContext: {
      subjectId: params.subjectId,
      sectionId: params.sectionId,
      topic: params.topic,
      taskType: params.contentKind === "chat_session" ? "chat" : "unknown",
    },
    notes:
      "Reconstructed from stored evaluation item metadata without a persisted learner snapshot.",
  });
  const provenance = buildDecisionProvenanceV1({
    backendKind: params.decisionRuntime.backendKind,
    policyName: params.decisionRuntime.runtimePolicyId,
    policyVersion: "unknown_version",
    sourceModule: "@/lib/evaluation.ts",
    fallbackUsed: false,
    artifactId: params.decisionRuntime.backendId,
    notes:
      "Partial provenance reconstructed from stored evaluation item runtime metadata.",
  });
  const pedagogicalDecision = normalizeToPedagogicalDecisionV1({
    difficulty: params.pedagogicalDecision.difficulty,
    depth: params.pedagogicalDecision.depth,
    instructionalMode: params.contentKind === "chat_session" ? "chat" : "unknown",
    hintPolicy: "unknown",
    decisionSource:
      params.decisionRuntime.runtimePolicyId != null
        ? "predicted_runtime_bridge"
        : "unknown",
    policyName: provenance.policy_name,
    policyVersion: provenance.policy_version,
    decisionConfidence: 0,
    materialization: {
      surface: params.contentKind === "chat_session" ? "chat" : "unknown",
    },
  });

  return buildDeliveredPedagogicalDecisionV1({
    learnerStateSnapshot,
    pedagogicalDecision,
    provenance,
    deliveredAt: params.deliveredAt,
    episodeId: params.episodeId,
    sequenceRole: params.sequenceRole,
    touchpointType: params.touchpointType,
    contentId: params.contentId,
  });
}

function uniqueOrdered<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function sameOrderedList(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function parsePositiveInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeClientKey(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, 120);
}

function normalizePolicyArm(
  value: unknown,
): EvaluationPolicyArm | null {
  if (typeof value !== "string") return null;
  return POLICY_ARM_ALIASES[value] ?? null;
}

function isTouchpointType(value: unknown): value is EvaluationTouchpointType {
  return EVALUATION_TOUCHPOINT_TYPES.some((item) => item === value);
}

function normalizeSequenceRole(
  value: unknown,
): EvaluationSequenceRole | null {
  if (typeof value !== "string") return null;
  return EVALUATION_SEQUENCE_ROLES.some((item) => item === value)
    ? (value as EvaluationSequenceRole)
    : null;
}

function normalizeItemRole(
  value: unknown,
): EvaluationItemRole | null {
  if (value === "assessment") return "evaluation";
  if (value === "mixed") return null;
  if (typeof value !== "string") return null;
  return EVALUATION_CANONICAL_ITEM_ROLES.some((item) => item === value)
    ? (value as EvaluationItemRole)
    : null;
}

function isItemVariant(value: unknown): value is EvaluationItemVariant {
  return EVALUATION_ITEM_VARIANTS.some((item) => item === value);
}

function isLinkageKind(value: unknown): value is EvaluationLinkageKind {
  return EVALUATION_LINKAGE_KINDS.some((item) => item === value);
}

function isHoldoutStrategy(value: unknown): value is EvaluationHoldoutStrategy {
  return EVALUATION_HOLDOUT_STRATEGIES.some((item) => item === value);
}

function normalizeExpectedTouchpoints(
  value: unknown,
): EvaluationTouchpointType[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.filter(isTouchpointType);
  return normalized.length > 0 ? uniqueOrdered(normalized) : null;
}

function normalizeExpectedSequenceRoles(
  value: unknown,
): EvaluationSequenceRole[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => normalizeSequenceRole(item))
    .filter((item): item is EvaluationSequenceRole => item != null);
  return normalized.length > 0 ? uniqueOrdered(normalized) : null;
}

function defaultExpectedSequenceRoles(protocolKey: string) {
  return protocolKey === STRUCTURED_EVALUATION_PROTOCOL_KEY
    ? [...DEFAULT_STRUCTURED_SEQUENCE]
    : [...DEFAULT_OBSERVATIONAL_SEQUENCE];
}

function deriveSequenceRoles(params: {
  protocolKey: string;
  expectedTouchpoints?: EvaluationTouchpointType[] | null;
  expectedSequenceRoles?: EvaluationSequenceRole[] | null;
}) {
  if (params.expectedSequenceRoles && params.expectedSequenceRoles.length > 0) {
    return params.expectedSequenceRoles;
  }

  if (params.expectedTouchpoints && params.expectedTouchpoints.length > 0) {
    return uniqueOrdered(
      params.expectedTouchpoints.map(
        (touchpoint) => TOUCHPOINT_TO_SEQUENCE_ROLE[touchpoint],
      ),
    );
  }

  return defaultExpectedSequenceRoles(params.protocolKey);
}

function deriveTouchpoints(sequenceRoles: EvaluationSequenceRole[]) {
  return uniqueOrdered(
    sequenceRoles.map((sequenceRole) => SEQUENCE_ROLE_TO_TOUCHPOINT[sequenceRole]),
  );
}

function defaultItemRole(params: {
  contentKind: EvaluationContentKind;
  sequenceRole: EvaluationSequenceRole;
}) {
  if (params.contentKind === "chat_session") {
    return "supporting_signal" satisfies EvaluationItemRole;
  }

  if (
    params.sequenceRole === "precheck" ||
    params.sequenceRole === "postcheck" ||
    params.sequenceRole === "holdout" ||
    params.sequenceRole === "delayed_recheck" ||
    params.sequenceRole === "prior_signal"
  ) {
    return "evaluation" satisfies EvaluationItemRole;
  }

  return "training" satisfies EvaluationItemRole;
}

function defaultAssessmentChannel(params: {
  contentKind: EvaluationContentKind;
  sequenceRole: EvaluationSequenceRole;
}) {
  if (params.contentKind === "chat_session") {
    return "chat_support" satisfies EvaluationAssessmentChannel;
  }

  if (params.sequenceRole === "learning_content") {
    return "embedded_next_task_success_proxy" satisfies EvaluationAssessmentChannel;
  }

  return "holdout_test" satisfies EvaluationAssessmentChannel;
}

function defaultItemVariant(params: {
  requested?: EvaluationItemVariant | null;
  sequenceRole: EvaluationSequenceRole;
  delayedMinutes: number | null;
}) {
  if (params.requested) return params.requested;
  if (params.sequenceRole === "holdout") {
    return "holdout_unseen" satisfies EvaluationItemVariant;
  }
  if (
    params.sequenceRole === "delayed_recheck" &&
    params.delayedMinutes != null
  ) {
    return "delayed_holdout" satisfies EvaluationItemVariant;
  }
  return "unknown" satisfies EvaluationItemVariant;
}

function defaultHoldoutStrategy(params: {
  requested?: EvaluationHoldoutStrategy | null;
  itemVariant: EvaluationItemVariant;
  sequenceRole: EvaluationSequenceRole;
}) {
  if (params.requested) return params.requested;
  if (params.itemVariant === "isomorphic_same_skill") {
    return "isomorphic_same_skill" satisfies EvaluationHoldoutStrategy;
  }
  if (
    params.itemVariant === "holdout_unseen" ||
    params.sequenceRole === "holdout"
  ) {
    return "holdout_unseen" satisfies EvaluationHoldoutStrategy;
  }
  if (
    params.itemVariant === "delayed_holdout" ||
    params.sequenceRole === "delayed_recheck"
  ) {
    return "delayed_holdout" satisfies EvaluationHoldoutStrategy;
  }
  return "none" satisfies EvaluationHoldoutStrategy;
}

function defaultLinkageKind(params: {
  requested?: EvaluationLinkageKind | null;
  sequenceRole: EvaluationSequenceRole;
  itemVariant: EvaluationItemVariant;
  linkedContentId: string | null;
}) {
  if (params.requested) return params.requested;
  if (params.itemVariant === "direct_repeat") {
    return "direct_repeat_of" satisfies EvaluationLinkageKind;
  }
  if (params.itemVariant === "isomorphic_same_skill") {
    return "isomorphic_family_of" satisfies EvaluationLinkageKind;
  }
  if (params.sequenceRole === "holdout") {
    return "holdout_skill_check" satisfies EvaluationLinkageKind;
  }
  if (params.sequenceRole === "delayed_recheck") {
    return "delayed_recheck_of" satisfies EvaluationLinkageKind;
  }
  return params.linkedContentId ? "direct_repeat_of" : "none";
}

function parseDelayedMinutes(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
    ? Math.floor(value)
    : null;
}

function buildStoredPedagogicalDecisionJson(params: {
  pedagogicalDecision: EvaluationItemMeta["pedagogicalDecision"];
  decisionRuntimeJson: Record<string, unknown> | null;
}) {
  if (params.pedagogicalDecision == null) return null;
  const sixFactorDeliveredConfig = readSixFactorDeliveredConfigMetadata(
    params.decisionRuntimeJson,
  );
  if (!sixFactorDeliveredConfig) return params.pedagogicalDecision;
  if (
    sixFactorDeliveredConfig.appliedAsPrimary !== true &&
    sixFactorDeliveredConfig.decisionSource !== "legacy_derived"
  ) {
    return params.pedagogicalDecision;
  }

  return buildSixFactorCompatibilityPedagogicalDecisionFromMetadata(
    sixFactorDeliveredConfig,
  );
}

function sequenceRoleSatisfied(
  sequenceRole: EvaluationSequenceRole,
  items: EvaluationItemRecord[],
) {
  const roleItems = items.filter((item) => item.sequenceRole === sequenceRole);
  if (roleItems.length === 0) return false;
  if (sequenceRole === "learning_content" || sequenceRole === "prior_signal") {
    return true;
  }
  return roleItems.some((item) => item.outcome != null);
}

function parseAssignmentMeta(value: unknown): EvaluationAssignmentMeta {
  const root = asObject(value);
  const arm = normalizePolicyArm(root?.arm) ?? "observational";
  const requestedArm = normalizePolicyArm(root?.requestedArm);
  const assignmentSource =
    root?.assignmentSource === "explicit_request"
      ? "explicit_request"
      : "runtime_default";
  const selectionMode =
    root?.selectionMode === "baseline_default" ||
    root?.selectionMode === "self_report_declared" ||
    root?.selectionMode === "predicted_runtime" ||
    root?.selectionMode === "heuristic_default" ||
    root?.selectionMode === "manual_override" ||
    root?.selectionMode === "observational_only"
      ? root.selectionMode
      : "observational_only";
  const personalizationMode =
    root?.personalizationMode === "on" || root?.personalizationMode === "off"
      ? root.personalizationMode
      : null;

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    arm,
    requestedArm,
    assignmentSource,
    selectionMode,
    personalizationMode,
    policyMode: typeof root?.policyMode === "string" ? root.policyMode : null,
    policyId: typeof root?.policyId === "string" ? root.policyId : null,
    runtimePolicyId:
      typeof root?.runtimePolicyId === "string" ? root.runtimePolicyId : null,
    backendKind:
      typeof root?.backendKind === "string" ? root.backendKind : null,
    backendId: typeof root?.backendId === "string" ? root.backendId : null,
    assignedAtIso:
      typeof root?.assignedAtIso === "string"
        ? root.assignedAtIso
        : new Date(0).toISOString(),
  };
}

function parseDesign(value: unknown): EvaluationEpisodeDesign {
  const root = asObject(value);
  const expectedTouchpoints =
    normalizeExpectedTouchpoints(root?.expectedTouchpoints) ??
    deriveTouchpoints(defaultExpectedSequenceRoles(DEFAULT_EVALUATION_PROTOCOL_KEY));
  const expectedSequenceRoles =
    normalizeExpectedSequenceRoles(root?.expectedSequenceRoles) ??
    deriveSequenceRoles({
      protocolKey:
        typeof root?.protocolKey === "string"
          ? root.protocolKey
          : DEFAULT_EVALUATION_PROTOCOL_KEY,
      expectedTouchpoints,
    });
  const practice = asObject(root?.practiceEffectControl);
  const linkage = asObject(root?.linkageContract);

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    objectiveKey: EVALUATION_OBJECTIVE_KEY,
    protocolKey:
      typeof root?.protocolKey === "string"
        ? root.protocolKey
        : DEFAULT_EVALUATION_PROTOCOL_KEY,
    expectedTouchpoints,
    expectedSequenceRoles,
    supportedTouchpoints: [...EVALUATION_TOUCHPOINT_TYPES],
    supportedSequenceRoles: [...EVALUATION_SEQUENCE_ROLES],
    primarySignalKind: "tests_primary_learning_signal",
    secondarySignals: ["chat_support_only"],
    practiceEffectControl: {
      holdoutStrategy: isHoldoutStrategy(practice?.holdoutStrategy)
        ? practice.holdoutStrategy
        : "none",
      directRepeatSeparated: practice?.directRepeatSeparated !== false,
      isomorphicFamilySupported: practice?.isomorphicFamilySupported !== false,
      delayedRecheckSupported: practice?.delayedRecheckSupported !== false,
      trainingVsEvaluationSeparated:
        practice?.trainingVsEvaluationSeparated !== false,
    },
    linkageContract: {
      familyKeyRequiredForIsomorphic:
        linkage?.familyKeyRequiredForIsomorphic !== false,
      linkedContentSupported: linkage?.linkedContentSupported !== false,
      supportedLinkageKinds: [...EVALUATION_LINKAGE_KINDS],
    },
  };
}

function parseItemRecord(item: {
  id: string;
  episodeId: string;
  contentKind: string;
  contentId: string;
  sequenceIndex: number;
  sequenceRole: string;
  touchpointType: string;
  signalQuality: string;
  itemRole: string;
  itemVariant: string;
  linkageKind: string;
  linkedContentId: string | null;
  familyKey: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  holdoutStrategy: string;
  delayedMinutes: number | null;
  policyArm: string;
  subjectId: string | null;
  sectionId: string | null;
  topic: string | null;
  pedagogicalDecisionJson: Prisma.JsonValue | null;
  decisionRuntimeJson: Prisma.JsonValue | null;
  outcomeJson: Prisma.JsonValue | null;
  deliveredAt: Date;
  outcomeRecordedAt: Date | null;
}): EvaluationItemRecord {
  const pedagogicalDecision = asObject(item.pedagogicalDecisionJson);
  const decisionRuntime = asObject(item.decisionRuntimeJson);
  const outcome = asObject(item.outcomeJson);
  const normalizedPedagogicalDecision =
    typeof pedagogicalDecision?.difficulty === "string" &&
    typeof pedagogicalDecision?.depth === "string"
      ? {
          ...pedagogicalDecision,
          difficulty: pedagogicalDecision.difficulty,
          depth: pedagogicalDecision.depth,
        }
      : null;
  const normalizedDecisionRuntime = {
    ...(decisionRuntime ?? {}),
    runtimePolicyId:
      typeof decisionRuntime?.runtimePolicyId === "string"
        ? decisionRuntime.runtimePolicyId
        : null,
    backendKind:
      typeof decisionRuntime?.backendKind === "string"
        ? decisionRuntime.backendKind
        : null,
    backendId:
      typeof decisionRuntime?.backendId === "string"
        ? decisionRuntime.backendId
        : null,
  };

  return {
    id: item.id,
    episodeId: item.episodeId,
    contentKind:
      item.contentKind === "chat_session" ? "chat_session" : "generated_test",
    contentId: item.contentId,
    sequenceIndex: item.sequenceIndex,
    sequenceRole: normalizeSequenceRole(item.sequenceRole) ?? "learning_content",
    touchpointType: isTouchpointType(item.touchpointType)
      ? item.touchpointType
      : "content_delivery",
    signalQuality:
      item.signalQuality === "secondary_chat_support"
        ? "secondary_chat_support"
        : "primary_test",
    itemRole: normalizeItemRole(item.itemRole) ?? "training",
    itemVariant: isItemVariant(item.itemVariant) ? item.itemVariant : "unknown",
    linkageKind: isLinkageKind(item.linkageKind) ? item.linkageKind : "none",
    linkedContentId: item.linkedContentId,
    familyKey: item.familyKey,
    conceptKey: item.conceptKey,
    skillKey: item.skillKey,
    holdoutStrategy: isHoldoutStrategy(item.holdoutStrategy)
      ? item.holdoutStrategy
      : "none",
    delayedMinutes: item.delayedMinutes,
    policyArm: normalizePolicyArm(item.policyArm) ?? "observational",
    subjectId: item.subjectId,
    sectionId: item.sectionId,
    topic: item.topic,
    pedagogicalDecision: normalizedPedagogicalDecision,
    decisionRuntime: normalizedDecisionRuntime,
    outcome:
      outcome == null
        ? null
        : {
            attemptId:
              typeof outcome.attemptId === "string" ? outcome.attemptId : null,
            accuracy:
              typeof outcome.accuracy === "number" &&
              Number.isFinite(outcome.accuracy)
                ? clamp01(outcome.accuracy)
                : null,
            questionCount:
              typeof outcome.questionCount === "number" &&
              Number.isFinite(outcome.questionCount)
                ? Math.max(0, Math.floor(outcome.questionCount))
                : null,
            totalDurationMs:
              typeof outcome.totalDurationMs === "number" &&
              Number.isFinite(outcome.totalDurationMs)
                ? Math.max(0, Math.floor(outcome.totalDurationMs))
                : null,
            submittedAtIso:
              typeof outcome.submittedAtIso === "string"
                ? outcome.submittedAtIso
                : null,
            learningEligible:
              typeof outcome.learningEligible === "boolean"
                ? outcome.learningEligible
                : null,
            learningSkipReason:
              typeof outcome.learningSkipReason === "string"
                ? outcome.learningSkipReason
                : null,
            adaptiveStateUpdated:
              typeof outcome.adaptiveStateUpdated === "boolean"
                ? outcome.adaptiveStateUpdated
                : null,
          },
    deliveredAtIso: item.deliveredAt.toISOString(),
    outcomeRecordedAtIso: item.outcomeRecordedAt?.toISOString() ?? null,
    deliveredDecisionBoundary: buildDeliveredDecisionBoundaryFromStoredItem({
      episodeId: item.episodeId,
      contentKind: item.contentKind,
      contentId: item.contentId,
      sequenceRole: item.sequenceRole,
      touchpointType: item.touchpointType,
      subjectId: item.subjectId,
      sectionId: item.sectionId,
      topic: item.topic,
      pedagogicalDecision: normalizedPedagogicalDecision,
      decisionRuntime: normalizedDecisionRuntime,
      deliveredAt: item.deliveredAt,
    }),
  };
}

export function resolveEvaluationPolicySelection(params: {
  surface: "test" | "chat";
  requestedArm?: EvaluationPolicyArmInput | null;
  personalizationMode?: "on" | "off" | null;
  manualOverrideActive?: boolean;
}): EvaluationPolicySelection {
  const requestedArm = normalizePolicyArm(params.requestedArm);
  const personalizationMode = params.personalizationMode ?? "on";
  const manualOverrideActive = params.manualOverrideActive === true;

  if (manualOverrideActive && requestedArm && requestedArm !== "manual_override") {
    throw new Error("EVALUATION_ASSIGNMENT_MANUAL_OVERRIDE_CONFLICT");
  }

  if (params.surface === "chat" && requestedArm === "manual_override") {
    throw new Error("EVALUATION_ASSIGNMENT_ARM_UNSUPPORTED");
  }

  const assignmentSource = requestedArm
    ? ("explicit_request" as const)
    : ("runtime_default" as const);
  const arm = requestedArm ?? (manualOverrideActive
    ? "manual_override"
    : personalizationMode === "off"
      ? "baseline"
      : "predicted");

  switch (arm) {
    case "baseline":
      return {
        arm,
        requestedArm,
        assignmentSource,
        selectionMode: "baseline_default",
        personalizationMode: "off",
        policyMode: "personalization_off",
        policyId: "v2_baseline",
      };
    case "self_report":
      return {
        arm,
        requestedArm,
        assignmentSource,
        selectionMode: "self_report_declared",
        personalizationMode: "on",
        policyMode: "self_report_preference",
        policyId: "v2_self_report",
      };
    case "predicted":
      return {
        arm,
        requestedArm,
        assignmentSource,
        selectionMode: "predicted_runtime",
        personalizationMode: "on",
        policyMode: "personalization_on",
        policyId: "v2_personalized",
      };
    case "heuristic_default":
      return {
        arm,
        requestedArm,
        assignmentSource,
        selectionMode: "heuristic_default",
        personalizationMode: "off",
        policyMode: "heuristic_default",
        policyId: "v2_heuristic_default",
      };
    case "manual_override":
      return {
        arm,
        requestedArm,
        assignmentSource,
        selectionMode: "manual_override",
        personalizationMode,
        policyMode: "manual_delivery_override",
        policyId: "v2_manual",
      };
    case "observational":
    default:
      return {
        arm: "observational",
        requestedArm,
        assignmentSource,
        selectionMode: "observational_only",
        personalizationMode,
        policyMode: "observational",
        policyId: "v2_observational",
      };
  }
}

export function buildEvaluationAssignment(params: {
  selection: EvaluationPolicySelection;
  runtimePolicyId?: string | null;
  backendKind?: string | null;
  backendId?: string | null;
  assignedAt?: Date;
}): EvaluationAssignmentMeta {
  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    arm: params.selection.arm,
    requestedArm: params.selection.requestedArm,
    assignmentSource: params.selection.assignmentSource,
    selectionMode: params.selection.selectionMode,
    personalizationMode: params.selection.personalizationMode,
    policyMode: params.selection.policyMode,
    policyId: params.selection.policyId,
    runtimePolicyId: params.runtimePolicyId ?? null,
    backendKind: params.backendKind ?? null,
    backendId: params.backendId ?? null,
    assignedAtIso: (params.assignedAt ?? new Date()).toISOString(),
  };
}

export function buildEvaluationEpisodeDesign(params: {
  protocolKey?: string | null;
  expectedTouchpoints?: EvaluationTouchpointType[] | null;
  expectedSequenceRoles?: EvaluationSequenceRole[] | null;
  holdoutStrategy?: EvaluationHoldoutStrategy | null;
  itemVariant?: EvaluationItemVariant | null;
}): EvaluationEpisodeDesign {
  const protocolKey = params.protocolKey ?? DEFAULT_EVALUATION_PROTOCOL_KEY;
  const expectedSequenceRoles = deriveSequenceRoles({
    protocolKey,
    expectedTouchpoints: params.expectedTouchpoints ?? null,
    expectedSequenceRoles: params.expectedSequenceRoles ?? null,
  });
  const expectedTouchpoints = deriveTouchpoints(expectedSequenceRoles);
  const itemVariant = params.itemVariant ?? "unknown";
  const holdoutStrategy = defaultHoldoutStrategy({
    requested: params.holdoutStrategy,
    itemVariant,
    sequenceRole: expectedSequenceRoles.includes("holdout")
      ? "holdout"
      : expectedSequenceRoles.includes("delayed_recheck")
        ? "delayed_recheck"
        : "learning_content",
  });

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    objectiveKey: EVALUATION_OBJECTIVE_KEY,
    protocolKey,
    expectedTouchpoints,
    expectedSequenceRoles,
    supportedTouchpoints: [...EVALUATION_TOUCHPOINT_TYPES],
    supportedSequenceRoles: [...EVALUATION_SEQUENCE_ROLES],
    primarySignalKind: "tests_primary_learning_signal",
    secondarySignals: ["chat_support_only"],
    practiceEffectControl: {
      holdoutStrategy,
      directRepeatSeparated: true,
      isomorphicFamilySupported: true,
      delayedRecheckSupported: true,
      trainingVsEvaluationSeparated: true,
    },
    linkageContract: {
      familyKeyRequiredForIsomorphic: true,
      linkedContentSupported: true,
      supportedLinkageKinds: [...EVALUATION_LINKAGE_KINDS],
    },
  };
}

export async function resolveOrCreateEvaluationEpisode(params: {
  prisma: EpisodePrismaClient;
  userId: string;
  subjectId?: string | null;
  sectionId?: string | null;
  topic?: string | null;
  conceptKey?: string | null;
  skillKey?: string | null;
  datasetPhase?: TrainingDatasetPhase | null;
  datasetOrigin?: string | null;
  requested: EvaluationRequestInput | null | undefined;
  assignment: EvaluationAssignmentMeta;
}): Promise<ResolveEpisodeResult> {
  const datasetPhase = normalizeTrainingDatasetPhase(params.datasetPhase);
  const datasetOrigin = normalizeTrainingDatasetOrigin(params.datasetOrigin);
  const requestedEpisodeId = params.requested?.episodeId ?? null;
  const requestedClientKey = normalizeClientKey(params.requested?.clientKey);
  const protocolKey =
    params.requested?.protocolKey ?? DEFAULT_EVALUATION_PROTOCOL_KEY;
  const requestedExpectedTouchpoints = normalizeExpectedTouchpoints(
    params.requested?.expectedTouchpoints,
  );
  const requestedExpectedSequenceRoles = normalizeExpectedSequenceRoles(
    params.requested?.expectedSequenceRoles,
  );
  const delayedMinutes = parseDelayedMinutes(params.requested?.delayedMinutes);
  const sequenceRole =
    normalizeSequenceRole(params.requested?.sequenceRole) ??
    (isTouchpointType(params.requested?.touchpointType)
      ? TOUCHPOINT_TO_SEQUENCE_ROLE[params.requested.touchpointType]
      : "learning_content");
  const itemVariant = defaultItemVariant({
    requested: isItemVariant(params.requested?.itemVariant)
      ? params.requested?.itemVariant
      : null,
    sequenceRole,
    delayedMinutes,
  });
  const design = buildEvaluationEpisodeDesign({
    protocolKey,
    expectedTouchpoints: requestedExpectedTouchpoints,
    expectedSequenceRoles: requestedExpectedSequenceRoles,
    holdoutStrategy: isHoldoutStrategy(params.requested?.holdoutStrategy)
      ? params.requested?.holdoutStrategy
      : null,
    itemVariant,
  });

  if (requestedEpisodeId) {
    const existing = await params.prisma.evaluationEpisode.findFirst({
      where: {
        id: requestedEpisodeId,
        userId: params.userId,
      },
      select: {
        id: true,
        clientKey: true,
        protocolKey: true,
        policyArm: true,
        status: true,
        assignmentJson: true,
        designJson: true,
        subjectId: true,
        sectionId: true,
        datasetPhase: true,
        datasetOrigin: true,
        topic: true,
        conceptKey: true,
        skillKey: true,
      },
    });

    if (!existing) {
      throw new Error("EVALUATION_EPISODE_NOT_FOUND");
    }

    if (
      params.subjectId &&
      existing.subjectId &&
      existing.subjectId !== params.subjectId
    ) {
      throw new Error("EVALUATION_EPISODE_SUBJECT_MISMATCH");
    }

    if (
      params.sectionId &&
      existing.sectionId &&
      existing.sectionId !== params.sectionId
    ) {
      throw new Error("EVALUATION_EPISODE_SECTION_MISMATCH");
    }

    if (existing.protocolKey !== design.protocolKey) {
      throw new Error("EVALUATION_EPISODE_PROTOCOL_MISMATCH");
    }

    if (existing.datasetPhase !== datasetPhase) {
      throw new Error("EVALUATION_EPISODE_DATASET_PHASE_MISMATCH");
    }

    if (existing.datasetOrigin !== datasetOrigin) {
      throw new Error("EVALUATION_EPISODE_DATASET_ORIGIN_MISMATCH");
    }

    if (normalizePolicyArm(existing.policyArm) !== params.assignment.arm) {
      throw new Error("EVALUATION_EPISODE_ASSIGNMENT_MISMATCH");
    }

    const existingDesign = parseDesign(existing.designJson);
    if (
      requestedExpectedSequenceRoles &&
      !sameOrderedList(
        existingDesign.expectedSequenceRoles,
        requestedExpectedSequenceRoles,
      )
    ) {
      throw new Error("EVALUATION_EPISODE_SEQUENCE_MISMATCH");
    }

    if (
      requestedExpectedTouchpoints &&
      !sameOrderedList(
        existingDesign.expectedTouchpoints,
        requestedExpectedTouchpoints,
      )
    ) {
      throw new Error("EVALUATION_EPISODE_TOUCHPOINT_MISMATCH");
    }

    if (
      requestedClientKey &&
      existing.clientKey &&
      existing.clientKey !== requestedClientKey
    ) {
      throw new Error("EVALUATION_EPISODE_CLIENT_KEY_MISMATCH");
    }

    if (
      params.conceptKey &&
      existing.conceptKey &&
      existing.conceptKey !== params.conceptKey
    ) {
      throw new Error("EVALUATION_EPISODE_CONCEPT_MISMATCH");
    }

    if (
      params.skillKey &&
      existing.skillKey &&
      existing.skillKey !== params.skillKey
    ) {
      throw new Error("EVALUATION_EPISODE_SKILL_MISMATCH");
    }

    return {
      episode: existing,
      created: false,
    };
  }

  if (requestedClientKey) {
    const existingByClientKey = await params.prisma.evaluationEpisode.findUnique({
      where: { clientKey: requestedClientKey },
      select: {
        id: true,
        userId: true,
        clientKey: true,
        protocolKey: true,
        policyArm: true,
        status: true,
        topic: true,
        conceptKey: true,
        skillKey: true,
        assignmentJson: true,
        designJson: true,
        subjectId: true,
        sectionId: true,
        datasetPhase: true,
        datasetOrigin: true,
      },
    });

    if (existingByClientKey) {
      if (existingByClientKey.userId !== params.userId) {
        throw new Error("EVALUATION_EPISODE_CLIENT_KEY_MISMATCH");
      }
      if ((existingByClientKey.topic ?? null) !== (params.topic ?? null)) {
        throw new Error("EVALUATION_EPISODE_TOPIC_MISMATCH");
      }
      if (existingByClientKey.subjectId !== (params.subjectId ?? null)) {
        throw new Error("EVALUATION_EPISODE_SUBJECT_MISMATCH");
      }
      if (existingByClientKey.sectionId !== (params.sectionId ?? null)) {
        throw new Error("EVALUATION_EPISODE_SECTION_MISMATCH");
      }
      if (existingByClientKey.protocolKey !== design.protocolKey) {
        throw new Error("EVALUATION_EPISODE_PROTOCOL_MISMATCH");
      }
      if (existingByClientKey.datasetPhase !== datasetPhase) {
        throw new Error("EVALUATION_EPISODE_DATASET_PHASE_MISMATCH");
      }
      if (existingByClientKey.datasetOrigin !== datasetOrigin) {
        throw new Error("EVALUATION_EPISODE_DATASET_ORIGIN_MISMATCH");
      }
      if (normalizePolicyArm(existingByClientKey.policyArm) !== params.assignment.arm) {
        throw new Error("EVALUATION_EPISODE_ASSIGNMENT_MISMATCH");
      }

      return {
        episode: existingByClientKey,
        created: false,
      };
    }
  }

  let created: ResolveEpisodeResult["episode"];
  try {
    created = await params.prisma.evaluationEpisode.create({
      data: {
        userId: params.userId,
        clientKey: requestedClientKey,
        subjectId: params.subjectId ?? null,
        sectionId: params.sectionId ?? null,
        datasetPhase,
        datasetOrigin,
        objectiveKey: EVALUATION_OBJECTIVE_KEY,
        protocolKey: design.protocolKey,
        policyArm: params.assignment.arm,
        primarySignalKind: "tests_primary_learning_signal",
        topic: params.topic ?? null,
        conceptKey: params.conceptKey ?? null,
        skillKey: params.skillKey ?? null,
        assignmentJson: params.assignment,
        designJson: design,
      },
      select: {
        id: true,
        clientKey: true,
        protocolKey: true,
        policyArm: true,
        status: true,
        topic: true,
        conceptKey: true,
        skillKey: true,
        assignmentJson: true,
        designJson: true,
      },
    });
  } catch (error) {
    if (
      requestedClientKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingByClientKey = await params.prisma.evaluationEpisode.findUnique({
        where: { clientKey: requestedClientKey },
        select: {
          id: true,
          userId: true,
          clientKey: true,
          protocolKey: true,
          policyArm: true,
          status: true,
          topic: true,
          conceptKey: true,
          skillKey: true,
          assignmentJson: true,
          designJson: true,
        },
      });

      if (existingByClientKey) {
        if (existingByClientKey.userId !== params.userId) {
          throw new Error("EVALUATION_EPISODE_CLIENT_KEY_MISMATCH");
        }
        if ((existingByClientKey.topic ?? null) !== (params.topic ?? null)) {
          throw new Error("EVALUATION_EPISODE_TOPIC_MISMATCH");
        }
        return {
          episode: existingByClientKey,
          created: false,
        };
      }
    }
    throw error;
  }

  return {
    episode: created,
    created: true,
  };
}

export function buildEvaluationItemMeta(params: {
  episodeId: string;
  assignment: EvaluationAssignmentMeta;
  requested: EvaluationRequestInput | null | undefined;
  contentKind: EvaluationContentKind;
  signalQuality: EvaluationSignalQuality;
  protocolKey: string;
  topic?: string | null;
  subjectId?: string | null;
  sectionId?: string | null;
  pedagogicalDecision?: { difficulty: string; depth: string } | null;
  runtimePolicyId?: string | null;
  backendKind?: string | null;
  backendId?: string | null;
}): EvaluationItemMeta {
  const delayedMinutes = parseDelayedMinutes(params.requested?.delayedMinutes);
  const requestedSequenceRole =
    normalizeSequenceRole(params.requested?.sequenceRole) ??
    (isTouchpointType(params.requested?.touchpointType)
      ? TOUCHPOINT_TO_SEQUENCE_ROLE[params.requested.touchpointType]
      : null);
  const sequenceRole = requestedSequenceRole ?? "learning_content";
  const requestedTouchpoint = isTouchpointType(params.requested?.touchpointType)
    ? params.requested?.touchpointType
    : null;
  const touchpointType =
    requestedTouchpoint ?? SEQUENCE_ROLE_TO_TOUCHPOINT[sequenceRole];
  const itemRole =
    normalizeItemRole(params.requested?.itemRole) ??
    defaultItemRole({
      contentKind: params.contentKind,
      sequenceRole,
    });
  const itemVariant = defaultItemVariant({
    requested: isItemVariant(params.requested?.itemVariant)
      ? params.requested?.itemVariant
      : null,
    sequenceRole,
    delayedMinutes,
  });
  const linkedContentId =
    typeof params.requested?.linkedContentId === "string" &&
    params.requested.linkedContentId.length > 0
      ? params.requested.linkedContentId
      : null;
  const linkageKind = defaultLinkageKind({
    requested: isLinkageKind(params.requested?.linkageKind)
      ? params.requested?.linkageKind
      : null,
    sequenceRole,
    itemVariant,
    linkedContentId,
  });
  const holdoutStrategy = defaultHoldoutStrategy({
    requested: isHoldoutStrategy(params.requested?.holdoutStrategy)
      ? params.requested?.holdoutStrategy
      : null,
    itemVariant,
    sequenceRole,
  });

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    episodeId: params.episodeId,
    objectiveKey: EVALUATION_OBJECTIVE_KEY,
    protocolKey: params.protocolKey,
    contentKind: params.contentKind,
    signalQuality: params.signalQuality,
    touchpointType,
    sequenceRole,
    itemRole,
    itemVariant,
    linkageKind,
    linkedContentId,
    assessmentChannel: defaultAssessmentChannel({
      contentKind: params.contentKind,
      sequenceRole,
    }),
    policyArm: params.assignment.arm,
    conceptKey: params.requested?.conceptKey ?? null,
    skillKey: params.requested?.skillKey ?? null,
    familyKey: params.requested?.familyKey ?? null,
    holdoutStrategy,
    delayedMinutes,
    topic: params.topic ?? null,
    subjectId: params.subjectId ?? null,
    sectionId: params.sectionId ?? null,
    pedagogicalDecision: params.pedagogicalDecision ?? null,
    decisionRuntime: {
      runtimePolicyId: params.runtimePolicyId ?? null,
      backendKind: params.backendKind ?? null,
      backendId: params.backendId ?? null,
    },
    assignment: params.assignment,
  };
}

export async function registerEvaluationEpisodeItem(params: {
  prisma: EpisodePrismaClient;
  item: EvaluationItemMeta;
  contentId: string;
  deliveredAt?: Date;
  decisionRuntimeSupplement?: Record<string, unknown> | null;
}) {
  const existingByRole = await params.prisma.evaluationEpisodeItem.findUnique({
    where: {
      episodeId_sequenceRole: {
        episodeId: params.item.episodeId,
        sequenceRole: params.item.sequenceRole,
      },
    },
    select: {
      id: true,
      episodeId: true,
      contentId: true,
      sequenceIndex: true,
    },
  });

  if (existingByRole) {
    if (existingByRole.contentId !== params.contentId) {
      throw new Error("EVALUATION_EPISODE_SEQUENCE_ROLE_CONFLICT");
    }
    return {
      id: existingByRole.id,
      episodeId: existingByRole.episodeId,
      sequenceIndex: existingByRole.sequenceIndex,
    };
  }

  const existing = await params.prisma.evaluationEpisodeItem.findUnique({
    where: {
      contentKind_contentId: {
        contentKind: params.item.contentKind,
        contentId: params.contentId,
      },
    },
    select: {
      id: true,
      episodeId: true,
      sequenceIndex: true,
    },
  });

  if (existing) {
    if (existing.episodeId !== params.item.episodeId) {
      throw new Error("EVALUATION_EPISODE_ITEM_CONFLICT");
    }
    return existing;
  }

  if (params.item.linkedContentId) {
    const linked = await params.prisma.evaluationEpisodeItem.findFirst({
      where: {
        episodeId: params.item.episodeId,
        contentId: params.item.linkedContentId,
      },
      select: { id: true },
    });
    if (!linked) {
      throw new Error("EVALUATION_EPISODE_LINKED_ITEM_MISMATCH");
    }
  }

  if (
    params.item.linkageKind === "isomorphic_family_of" &&
    !params.item.familyKey
  ) {
    throw new Error("EVALUATION_EPISODE_FAMILY_KEY_REQUIRED");
  }

  const sequenceIndex =
    (await params.prisma.evaluationEpisodeItem.count({
      where: { episodeId: params.item.episodeId },
    })) + 1;

  const decisionRuntimeJson =
    params.decisionRuntimeSupplement == null
      ? params.item.decisionRuntime
      : {
          ...(params.item.decisionRuntime ?? {}),
          ...params.decisionRuntimeSupplement,
        };
  const storedPedagogicalDecisionJson = buildStoredPedagogicalDecisionJson({
    pedagogicalDecision: params.item.pedagogicalDecision,
    decisionRuntimeJson,
  });

  let created: {
    id: string;
    episodeId: string;
    sequenceIndex: number;
  };
  try {
    created = await params.prisma.evaluationEpisodeItem.create({
      data: {
        episodeId: params.item.episodeId,
        contentKind: params.item.contentKind,
        contentId: params.contentId,
        sequenceIndex,
        sequenceRole: params.item.sequenceRole,
        touchpointType: params.item.touchpointType,
        signalQuality: params.item.signalQuality,
        itemRole: params.item.itemRole,
        itemVariant: params.item.itemVariant,
        linkageKind: params.item.linkageKind,
        linkedContentId: params.item.linkedContentId,
        familyKey: params.item.familyKey,
        conceptKey: params.item.conceptKey,
        skillKey: params.item.skillKey,
        holdoutStrategy: params.item.holdoutStrategy,
        delayedMinutes: params.item.delayedMinutes,
        policyArm: params.item.policyArm,
        subjectId: params.item.subjectId,
        sectionId: params.item.sectionId,
        topic: params.item.topic,
        pedagogicalDecisionJson:
          storedPedagogicalDecisionJson == null
            ? Prisma.JsonNull
            : (storedPedagogicalDecisionJson as Prisma.InputJsonValue),
        decisionRuntimeJson:
          decisionRuntimeJson == null
            ? Prisma.JsonNull
            : (decisionRuntimeJson as Prisma.InputJsonValue),
        deliveredAt: params.deliveredAt ?? new Date(),
      },
      select: {
        id: true,
        episodeId: true,
        sequenceIndex: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await params.prisma.evaluationEpisodeItem.findUnique({
        where: {
          episodeId_sequenceRole: {
            episodeId: params.item.episodeId,
            sequenceRole: params.item.sequenceRole,
          },
        },
        select: {
          id: true,
          episodeId: true,
          contentId: true,
          sequenceIndex: true,
        },
      });

      if (concurrent && concurrent.contentId === params.contentId) {
        return {
          id: concurrent.id,
          episodeId: concurrent.episodeId,
          sequenceIndex: concurrent.sequenceIndex,
        };
      }
    }
    throw error;
  }

  await syncEvaluationEpisodeProtocolState(params.prisma, params.item.episodeId);

  return created;
}

export async function recordEvaluationTestOutcome(params: {
  prisma: EpisodePrismaClient;
  testId: string;
  attemptId: string;
  accuracy: number;
  questionCount: number;
  totalDurationMs: number | null;
  learningEligible: boolean;
  learningSkipReason?: string | null;
  submittedAt?: Date;
}) {
  const item = await params.prisma.evaluationEpisodeItem.findUnique({
    where: {
      contentKind_contentId: {
        contentKind: "generated_test",
        contentId: params.testId,
      },
    },
    select: {
      id: true,
      episodeId: true,
    },
  });

  if (!item) {
    return;
  }

  await params.prisma.evaluationEpisodeItem.update({
    where: { id: item.id },
    data: {
      outcomeJson: {
        attemptId: params.attemptId,
        accuracy: clamp01(params.accuracy),
        questionCount: Math.max(0, Math.floor(params.questionCount)),
        totalDurationMs:
          params.totalDurationMs != null &&
          Number.isFinite(params.totalDurationMs) &&
          params.totalDurationMs >= 0
            ? Math.floor(params.totalDurationMs)
            : null,
        submittedAtIso: (params.submittedAt ?? new Date()).toISOString(),
        learningEligible: params.learningEligible,
        learningSkipReason: params.learningSkipReason ?? null,
        adaptiveStateUpdated: params.learningEligible,
      },
      outcomeRecordedAt: params.submittedAt ?? new Date(),
    },
  });

  await syncEvaluationEpisodeProtocolState(params.prisma, item.episodeId);
}

export async function syncEvaluationEpisodeProtocolState(
  prisma: EpisodePrismaClient,
  episodeId: string,
) {
  const episode = await prisma.evaluationEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      status: true,
      designJson: true,
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

  if (!episode) return null;

  const design = parseDesign(episode.designJson);
  const items = episode.items.map(parseItemRecord);
  const completed = design.expectedSequenceRoles.filter((sequenceRole) =>
    sequenceRoleSatisfied(sequenceRole, items),
  );
  const nextStatus =
    design.expectedSequenceRoles.length > 0 &&
    completed.length === design.expectedSequenceRoles.length
      ? "completed"
      : "active";

  if (episode.status !== nextStatus) {
    await prisma.evaluationEpisode.update({
      where: { id: episodeId },
      data: { status: nextStatus },
    });
  }

  return nextStatus;
}

export function summarizeEvaluationEpisode(params: {
  episode: {
    id: string;
    objectiveKey: string;
    protocolKey: string;
    status: string;
    policyArm: string;
    subjectId: string | null;
    sectionId: string | null;
    topic: string | null;
    conceptKey: string | null;
    skillKey: string | null;
    assignmentJson: Prisma.JsonValue;
    designJson: Prisma.JsonValue;
    createdAt: Date;
  };
  items: Array<{
    id: string;
    episodeId: string;
    contentKind: string;
    contentId: string;
    sequenceIndex: number;
    sequenceRole: string;
    touchpointType: string;
    signalQuality: string;
    itemRole: string;
    itemVariant: string;
    linkageKind: string;
    linkedContentId: string | null;
    familyKey: string | null;
    conceptKey: string | null;
    skillKey: string | null;
    holdoutStrategy: string;
    delayedMinutes: number | null;
    policyArm: string;
    subjectId: string | null;
    sectionId: string | null;
    topic: string | null;
    pedagogicalDecisionJson: Prisma.JsonValue | null;
    decisionRuntimeJson: Prisma.JsonValue | null;
    outcomeJson: Prisma.JsonValue | null;
    deliveredAt: Date;
    outcomeRecordedAt: Date | null;
  }>;
}): EvaluationEpisodeSummary {
  const assignment = parseAssignmentMeta(params.episode.assignmentJson);
  const design = parseDesign(params.episode.designJson);
  const items = params.items.map(parseItemRecord);
  const observed = uniqueOrdered(items.map((item) => item.sequenceRole));
  const completed = uniqueOrdered(
    design.expectedSequenceRoles.filter((sequenceRole) =>
      sequenceRoleSatisfied(sequenceRole, items),
    ),
  );
  const missing = design.expectedSequenceRoles.filter(
    (sequenceRole) => !completed.includes(sequenceRole),
  );
  const deliveredTimes = items.map((item) => item.deliveredAtIso);
  const outcomeTimes = items
    .map((item) => item.outcomeRecordedAtIso)
    .filter((value): value is string => value != null);
  const familyKeys = uniqueOrdered(
    items
      .map((item) => item.familyKey)
      .filter((value): value is string => Boolean(value)),
  );
  const linkedPairs = items
    .filter((item) => item.linkedContentId != null)
    .map((item) => ({
      contentId: item.contentId,
      linkedContentId: item.linkedContentId as string,
      linkageKind: item.linkageKind,
    }));
  const primaryOutcomes = items
    .filter(
      (item) =>
        item.contentKind === "generated_test" &&
        item.itemRole === "evaluation" &&
        item.outcome != null,
    )
    .map((item) => ({
      sequenceRole: item.sequenceRole,
      contentId: item.contentId,
      contentKind: item.contentKind,
      sequenceIndex: item.sequenceIndex,
      accuracy: item.outcome?.accuracy ?? null,
      questionCount: item.outcome?.questionCount ?? null,
      totalDurationMs: item.outcome?.totalDurationMs ?? null,
      submittedAtIso: item.outcome?.submittedAtIso ?? null,
      learningEligible: item.outcome?.learningEligible ?? null,
      learningSkipReason:
        typeof item.outcome?.learningSkipReason === "string"
          ? item.outcome.learningSkipReason
          : null,
      adaptiveStateUpdated:
        typeof item.outcome?.adaptiveStateUpdated === "boolean"
          ? item.outcome.adaptiveStateUpdated
          : null,
    }));

  return {
    schemaVersion: EVALUATION_EPISODE_SUMMARY_SCHEMA_VERSION,
    objectiveKey: EVALUATION_OBJECTIVE_KEY,
    episodeId: params.episode.id,
    protocolKey: params.episode.protocolKey,
    status: params.episode.status,
    arm: normalizePolicyArm(params.episode.policyArm) ?? assignment.arm,
    subjectId: params.episode.subjectId,
    sectionId: params.episode.sectionId,
    topic: params.episode.topic,
    conceptKey: params.episode.conceptKey,
    skillKey: params.episode.skillKey,
    assignment,
    design,
    counts: {
      totalItems: items.length,
      testItems: items.filter((item) => item.contentKind === "generated_test")
        .length,
      chatItems: items.filter((item) => item.contentKind === "chat_session")
        .length,
      trainingItems: items.filter((item) => item.itemRole === "training").length,
      evaluationItems: items.filter((item) => item.itemRole === "evaluation")
        .length,
      supportingItems: items.filter(
        (item) => item.itemRole === "supporting_signal",
      ).length,
      completedTestOutcomes: items.filter(
        (item) =>
          item.contentKind === "generated_test" && item.outcomeRecordedAtIso != null,
      ).length,
    },
    sequence: {
      expected: design.expectedSequenceRoles,
      observed,
      completed,
      missing,
    },
    timing: {
      episodeCreatedAtIso: params.episode.createdAt.toISOString(),
      firstDeliveredAtIso: deliveredTimes[0] ?? null,
      lastDeliveredAtIso:
        deliveredTimes.length > 0 ? deliveredTimes[deliveredTimes.length - 1] : null,
      lastOutcomeAtIso:
        outcomeTimes.length > 0 ? outcomeTimes[outcomeTimes.length - 1] : null,
      maxDelayedMinutes:
        items.length > 0
          ? items.reduce<number | null>((current, item) => {
              if (item.delayedMinutes == null) return current;
              return current == null
                ? item.delayedMinutes
                : Math.max(current, item.delayedMinutes);
            }, null)
          : null,
    },
    practiceEffect: {
      directRepeatCount: items.filter((item) => item.itemVariant === "direct_repeat")
        .length,
      isomorphicCount: items.filter(
        (item) => item.itemVariant === "isomorphic_same_skill",
      ).length,
      holdoutCount: items.filter((item) => item.sequenceRole === "holdout").length,
      delayedCount: items.filter(
        (item) => item.sequenceRole === "delayed_recheck",
      ).length,
      familyKeys,
      linkedPairs,
    },
    primaryOutcomes,
    items,
  };
}

export async function buildEvaluationEpisodeSummary(
  prisma: EpisodePrismaClient,
  episodeId: string,
) {
  const episode = await prisma.evaluationEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      objectiveKey: true,
      protocolKey: true,
      status: true,
      policyArm: true,
      subjectId: true,
      sectionId: true,
      topic: true,
      conceptKey: true,
      skillKey: true,
      assignmentJson: true,
      designJson: true,
      createdAt: true,
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

  if (!episode) {
    return null;
  }

  return summarizeEvaluationEpisode({
    episode,
    items: episode.items,
  });
}

export async function getEvaluationEpisodeExport(
  prisma: PrismaClient,
  options: EvaluationEpisodeExportOptions = {},
): Promise<EvaluationEpisodeExportResult> {
  const filters = {
    timeRangeDays: parsePositiveInt(options.timeRangeDays, 30, 1, 365),
    maxEpisodes: parsePositiveInt(options.maxEpisodes, 500, 1, 5000),
    format: options.format === "json" ? "json" : "jsonl",
  } as const;
  const since = new Date(
    Date.now() - filters.timeRangeDays * 24 * 60 * 60 * 1000,
  );
  const episodes = await prisma.evaluationEpisode.findMany({
    where: {
      createdAt: {
        gte: since,
      },
    },
    orderBy: { createdAt: "asc" },
    take: filters.maxEpisodes,
    select: {
      id: true,
      objectiveKey: true,
      protocolKey: true,
      status: true,
      policyArm: true,
      subjectId: true,
      sectionId: true,
      topic: true,
      conceptKey: true,
      skillKey: true,
      assignmentJson: true,
      designJson: true,
      createdAt: true,
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

  const summaries = episodes.map((episode) =>
    summarizeEvaluationEpisode({
      episode,
      items: episode.items,
    }),
  );

  return {
    schemaVersion: EVALUATION_EPISODE_SUMMARY_SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    format: filters.format,
    counts: {
      exportedEpisodes: summaries.length,
    },
    filters,
    content:
      filters.format === "json"
        ? `${JSON.stringify(summaries, null, 2)}\n`
        : summaries.length > 0
          ? `${summaries.map((summary) => JSON.stringify(summary)).join("\n")}\n`
          : "",
  };
}

export function runEvaluationProtocolSyntheticSelfCheck() {
  const predictedSelection = resolveEvaluationPolicySelection({
    surface: "test",
    personalizationMode: "on",
  });
  const selfReportSelection = resolveEvaluationPolicySelection({
    surface: "chat",
    requestedArm: "self_report",
  });
  const design = buildEvaluationEpisodeDesign({
    protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
    expectedSequenceRoles: [
      "precheck",
      "learning_content",
      "postcheck",
      "holdout",
      "delayed_recheck",
    ],
    holdoutStrategy: "isomorphic_same_skill",
    itemVariant: "isomorphic_same_skill",
  });
  const item = buildEvaluationItemMeta({
    episodeId: "ep1",
    assignment: buildEvaluationAssignment({
      selection: selfReportSelection,
    }),
    requested: {
      sequenceRole: "holdout",
      familyKey: "family-1",
      itemVariant: "isomorphic_same_skill",
      linkedContentId: "test-1",
    },
    contentKind: "generated_test",
    signalQuality: "primary_test",
    protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
    topic: "Derivatives",
    subjectId: "subject-1",
    sectionId: "section-1",
    pedagogicalDecision: {
      difficulty: "medium",
      depth: "standard",
    },
  });
  const summary = summarizeEvaluationEpisode({
    episode: {
      id: "ep1",
      objectiveKey: EVALUATION_OBJECTIVE_KEY,
      protocolKey: STRUCTURED_EVALUATION_PROTOCOL_KEY,
      status: "completed",
      policyArm: "self_report",
      subjectId: "subject-1",
      sectionId: "section-1",
      topic: "Derivatives",
      conceptKey: "limits",
      skillKey: "differentiate_polynomial",
      assignmentJson: buildEvaluationAssignment({
        selection: selfReportSelection,
      }),
      designJson: design,
      createdAt: new Date("2026-03-27T10:00:00.000Z"),
    },
    items: [
      {
        id: "item-1",
        episodeId: "ep1",
        contentKind: "generated_test",
        contentId: "test-1",
        sequenceIndex: 1,
        sequenceRole: "precheck",
        touchpointType: "pre_check",
        signalQuality: "primary_test",
        itemRole: "evaluation",
        itemVariant: "unknown",
        linkageKind: "none",
        linkedContentId: null,
        familyKey: null,
        conceptKey: "limits",
        skillKey: "differentiate_polynomial",
        holdoutStrategy: "none",
        delayedMinutes: null,
        policyArm: "self_report",
        subjectId: "subject-1",
        sectionId: "section-1",
        topic: "Derivatives",
        pedagogicalDecisionJson: {
          difficulty: "medium",
          depth: "standard",
        },
        decisionRuntimeJson: null,
        outcomeJson: {
          attemptId: "attempt-1",
          accuracy: 0.4,
          questionCount: 5,
          totalDurationMs: 100000,
          submittedAtIso: "2026-03-27T10:10:00.000Z",
          learningEligible: true,
        },
        deliveredAt: new Date("2026-03-27T10:05:00.000Z"),
        outcomeRecordedAt: new Date("2026-03-27T10:10:00.000Z"),
      },
      {
        id: "item-2",
        episodeId: "ep1",
        contentKind: "generated_test",
        contentId: "test-2",
        sequenceIndex: 2,
        sequenceRole: item.sequenceRole,
        touchpointType: item.touchpointType,
        signalQuality: item.signalQuality,
        itemRole: item.itemRole,
        itemVariant: item.itemVariant,
        linkageKind: item.linkageKind,
        linkedContentId: item.linkedContentId,
        familyKey: item.familyKey,
        conceptKey: item.conceptKey,
        skillKey: item.skillKey,
        holdoutStrategy: item.holdoutStrategy,
        delayedMinutes: item.delayedMinutes,
        policyArm: item.policyArm,
        subjectId: item.subjectId,
        sectionId: item.sectionId,
        topic: item.topic,
        pedagogicalDecisionJson: item.pedagogicalDecision as Prisma.JsonValue,
        decisionRuntimeJson: item.decisionRuntime as Prisma.JsonValue,
        outcomeJson: {
          attemptId: "attempt-2",
          accuracy: 0.8,
          questionCount: 5,
          totalDurationMs: 90000,
          submittedAtIso: "2026-03-27T10:20:00.000Z",
          learningEligible: true,
        },
        deliveredAt: new Date("2026-03-27T10:15:00.000Z"),
        outcomeRecordedAt: new Date("2026-03-27T10:20:00.000Z"),
      },
      {
        id: "item-3",
        episodeId: "ep1",
        contentKind: "generated_test",
        contentId: "test-3",
        sequenceIndex: 3,
        sequenceRole: "delayed_recheck",
        touchpointType: "delayed_recheck",
        signalQuality: "primary_test",
        itemRole: "evaluation",
        itemVariant: "delayed_holdout",
        linkageKind: "delayed_recheck_of",
        linkedContentId: "test-2",
        familyKey: "family-1",
        conceptKey: "limits",
        skillKey: "differentiate_polynomial",
        holdoutStrategy: "delayed_holdout",
        delayedMinutes: 1440,
        policyArm: "self_report",
        subjectId: "subject-1",
        sectionId: "section-1",
        topic: "Derivatives",
        pedagogicalDecisionJson: {
          difficulty: "medium",
          depth: "standard",
        },
        decisionRuntimeJson: null,
        outcomeJson: {
          attemptId: "attempt-3",
          accuracy: 0.7,
          questionCount: 5,
          totalDurationMs: 95000,
          submittedAtIso: "2026-03-28T10:20:00.000Z",
          learningEligible: true,
        },
        deliveredAt: new Date("2026-03-28T10:15:00.000Z"),
        outcomeRecordedAt: new Date("2026-03-28T10:20:00.000Z"),
      },
    ],
  });

  const ok =
    predictedSelection.arm === "predicted" &&
    selfReportSelection.arm === "self_report" &&
    design.expectedSequenceRoles.includes("holdout") &&
    item.sequenceRole === "holdout" &&
    item.itemRole === "evaluation" &&
    item.linkageKind === "isomorphic_family_of" &&
    summary.primaryOutcomes.length === 3 &&
    summary.practiceEffect.familyKeys.includes("family-1") &&
    summary.sequence.completed.includes("holdout");

  return {
    ok,
    predictedSelection,
    selfReportSelection,
    design,
    item,
    summaryCounts: summary.counts,
  };
}
