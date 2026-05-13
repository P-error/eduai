import { PrismaClient, type Prisma } from "@prisma/client";
import {
  summarizeEvaluationEpisode,
  type EvaluationEpisodeSummary,
  type EvaluationSequenceRole,
} from "@/lib/evaluation";

export type OperatorEpisodeListEntry = {
  episodeId: string;
  status: string;
  arm: EvaluationEpisodeSummary["arm"];
  protocolKey: string;
  subject: {
    id: string | null;
    title: string | null;
  };
  section: {
    id: string | null;
    title: string | null;
  };
  topic: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  createdAtIso: string;
  lastOutcomeAtIso: string | null;
  counts: EvaluationEpisodeSummary["counts"];
  sequence: EvaluationEpisodeSummary["sequence"] & {
    nextExpectedRole: EvaluationSequenceRole | null;
  };
  selectedPedagogicalDecision: {
    difficulty: string | null;
    depth: string | null;
  };
  provenance: {
    assignmentSource: EvaluationEpisodeSummary["assignment"]["assignmentSource"];
    selectionMode: EvaluationEpisodeSummary["assignment"]["selectionMode"];
    personalizationMode: EvaluationEpisodeSummary["assignment"]["personalizationMode"];
    policyMode: EvaluationEpisodeSummary["assignment"]["policyMode"];
    policyId: EvaluationEpisodeSummary["assignment"]["policyId"];
    runtimePolicyId: EvaluationEpisodeSummary["assignment"]["runtimePolicyId"];
    backendKind: EvaluationEpisodeSummary["assignment"]["backendKind"];
    backendId: EvaluationEpisodeSummary["assignment"]["backendId"];
  };
  exportReadiness: {
    ready: boolean;
    code:
      | "ready"
      | "episode_active"
      | "sequence_incomplete"
      | "no_primary_outcomes";
  };
};

type OperatorEpisodeListOptions = {
  subjectId?: string | null;
  status?: "active" | "completed" | null;
  limit?: number | null;
};

function deriveSelectedPedagogicalDecision(summary: EvaluationEpisodeSummary) {
  const selected =
    summary.items.find((item) => item.pedagogicalDecision != null)
      ?.pedagogicalDecision ?? null;

  return {
    difficulty: selected?.difficulty ?? null,
    depth: selected?.depth ?? null,
  };
}

function deriveExportReadiness(summary: EvaluationEpisodeSummary) {
  if (summary.status !== "completed") {
    return {
      ready: false,
      code: "episode_active" as const,
    };
  }

  if (summary.sequence.missing.length > 0) {
    return {
      ready: false,
      code: "sequence_incomplete" as const,
    };
  }

  if (summary.primaryOutcomes.length === 0) {
    return {
      ready: false,
      code: "no_primary_outcomes" as const,
    };
  }

  return {
    ready: true,
    code: "ready" as const,
  };
}

export function buildOperatorEpisodeListEntry(params: {
  summary: EvaluationEpisodeSummary;
  subject: {
    id: string;
    title: string;
  } | null;
  section: {
    id: string;
    title: string;
  } | null;
}): OperatorEpisodeListEntry {
  const { summary } = params;

  return {
    episodeId: summary.episodeId,
    status: summary.status,
    arm: summary.arm,
    protocolKey: summary.protocolKey,
    subject: {
      id: params.subject?.id ?? summary.subjectId,
      title: params.subject?.title ?? null,
    },
    section: {
      id: params.section?.id ?? summary.sectionId,
      title: params.section?.title ?? null,
    },
    topic: summary.topic,
    conceptKey: summary.conceptKey,
    skillKey: summary.skillKey,
    createdAtIso: summary.timing.episodeCreatedAtIso,
    lastOutcomeAtIso: summary.timing.lastOutcomeAtIso,
    counts: summary.counts,
    sequence: {
      ...summary.sequence,
      nextExpectedRole: summary.sequence.missing[0] ?? null,
    },
    selectedPedagogicalDecision: deriveSelectedPedagogicalDecision(summary),
    provenance: {
      assignmentSource: summary.assignment.assignmentSource,
      selectionMode: summary.assignment.selectionMode,
      personalizationMode: summary.assignment.personalizationMode,
      policyMode: summary.assignment.policyMode,
      policyId: summary.assignment.policyId,
      runtimePolicyId: summary.assignment.runtimePolicyId,
      backendKind: summary.assignment.backendKind,
      backendId: summary.assignment.backendId,
    },
    exportReadiness: deriveExportReadiness(summary),
  };
}

export async function listOperatorEpisodes(
  prisma: PrismaClient,
  userId: string,
  options: OperatorEpisodeListOptions = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const episodes = await prisma.evaluationEpisode.findMany({
    where: {
      userId,
      ...(options.subjectId ? { subjectId: options.subjectId } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
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
      subject: {
        select: {
          id: true,
          title: true,
        },
      },
      section: {
        select: {
          id: true,
          title: true,
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

  return episodes.map((episode) => {
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

    return buildOperatorEpisodeListEntry({
      summary,
      subject: episode.subject,
      section: episode.section,
    });
  });
}
