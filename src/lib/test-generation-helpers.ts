import type { Prisma } from "@prisma/client";
import type {
  EvaluationAssignmentMeta,
  EvaluationItemMeta,
} from "@/lib/evaluation";
import type { TestGenerationPackage } from "@/lib/episode-generation";
import type { CoreDeliveryRequest } from "@/lib/learning-quality-gate";
import type { RenderingDecision } from "@/lib/personalization-runtime";
import type {
  GeneratedTestValidationResult,
  TestPayload,
} from "@/lib/test-schema";

type CoreDeliveryFieldSource =
  | {
      tone?: unknown;
      explanation_style?: unknown;
      response_format?: unknown;
      difficulty_target?: unknown;
      depth?: unknown;
    }
  | Record<string, unknown>
  | null
  | undefined;

export function resolveManualDeliveryOverride(params: {
  hasManualDeliveryOverride?: boolean | null;
  rawBody?: unknown;
}) {
  return (
    params.hasManualDeliveryOverride ??
    (Boolean(params.rawBody) &&
      typeof params.rawBody === "object" &&
      Object.prototype.hasOwnProperty.call(params.rawBody, "delivery"))
  );
}

export function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function fallbackTest(
  subject: string,
  topic: string,
  count: number,
) {
  return {
    title: `${subject}: diagnostic fallback for ${topic}`,
    questions: Array.from({ length: count }).map((_, index) => ({
      prompt: `Diagnostic fallback check ${index + 1}: which statement is most directly connected to ${topic}?`,
      options: [
        `A statement about ${topic}`,
        "A statement about an unrelated topic",
        "A statement with no assessable learning claim",
      ],
      answerIndex: 0,
      explanation:
        "Diagnostic fallback item generated because the external LLM path was unavailable or invalid; this item is excluded from learning updates.",
    })),
  } satisfies TestPayload;
}

export function pickCoreDeliveryFields(
  source: CoreDeliveryFieldSource,
): CoreDeliveryRequest {
  const root = source ?? {};
  return {
    tone: typeof root.tone === "string" ? root.tone : undefined,
    explanation_style:
      typeof root.explanation_style === "string"
        ? root.explanation_style
        : undefined,
    response_format:
      typeof root.response_format === "string"
        ? root.response_format
        : undefined,
    difficulty_target:
      typeof root.difficulty_target === "string"
        ? root.difficulty_target
        : undefined,
    depth: typeof root.depth === "string" ? root.depth : undefined,
  };
}

export function buildStrictDeliveryReinforcement(
  requestedUx: Record<string, string>,
): string {
  const requirements = Object.entries(requestedUx)
    .map(([axis, value]) => `${axis} MUST be ${value}`)
    .join("; ");

  return `STRICT DELIVERY REQUIREMENTS: For EVERY question ${requirements}. If you cannot comply, rewrite the question until it matches. Do not explain these requirements. Output JSON only.`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function testValidationMessages(result: GeneratedTestValidationResult) {
  return [...result.errors, ...result.warnings].map((issue) =>
    `${issue.path ? `${issue.path}:` : ""}${issue.code}: ${issue.message}`,
  );
}

export function buildEpisodeTestPackage(params: {
  episodeId: string;
  protocolKey: string;
  sequenceRole: EvaluationItemMeta["sequenceRole"];
  touchpointType: EvaluationItemMeta["touchpointType"];
  subject: {
    id: string;
    title: string;
  };
  sectionSnapshot: string | null;
  sectionId: string | null;
  topic: string;
  questionCount: number;
  mode: "quiz" | "exam" | "practice";
  familyKey: string;
  conceptKey: string | null;
  skillKey: string | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  };
  sixFactorPedagogicalProfile?: TestGenerationPackage["sixFactorPedagogicalProfile"];
  renderingDecision: {
    tone: string;
    explanation_style: string;
    response_format: "mcq";
  };
  renderingRules: {
    id: string;
    basis: string;
  };
  assignment: EvaluationAssignmentMeta;
  evaluation: EvaluationItemMeta;
}) {
  return {
    schemaVersion: "episode_generation_package_v1_2026_03",
    episodeId: params.episodeId,
    protocolKey: params.protocolKey,
    contentKind: "generated_test",
    sequenceRole: params.sequenceRole,
    touchpointType: params.touchpointType,
    questionCount: params.questionCount,
    mode: params.mode,
    sixFactorPedagogicalProfile: params.sixFactorPedagogicalProfile ?? null,
    pedagogicalDecision: params.pedagogicalDecision,
    rendering: {
      tone: params.renderingDecision.tone,
      explanationStyle: params.renderingDecision.explanation_style,
      responseFormat: params.renderingDecision.response_format,
      rulesLayer: params.renderingRules,
      renderingDecision: {
        tone: params.renderingDecision.tone,
        explanationStyle: params.renderingDecision.explanation_style,
        responseFormat: params.renderingDecision.response_format,
        presentationMode: "mcq_test",
        formattingHint:
          params.pedagogicalDecision.depth === "detailed"
            ? "scaffolded"
            : params.pedagogicalDecision.depth === "brief"
              ? "brief"
              : "balanced",
      } satisfies RenderingDecision,
    },
    policy: {
      arm: params.assignment.arm,
      policyMode: params.assignment.policyMode,
      policyId: params.assignment.policyId,
      assignmentSource: params.assignment.assignmentSource,
      personalizationMode: params.assignment.personalizationMode ?? "on",
    },
    scope: {
      subjectId: params.subject.id,
      subjectTitle: params.subject.title,
      sectionId: params.sectionId,
      sectionPath: params.sectionSnapshot,
      topic: params.topic,
      conceptKey: params.conceptKey,
      skillKey: params.skillKey,
      familyKey: params.familyKey,
    },
    linkage: {
      linkageKind: params.evaluation.linkageKind,
      linkedContentId: params.evaluation.linkedContentId,
      holdoutStrategy: params.evaluation.holdoutStrategy,
    },
    outputContract: {
      kind: "mcq_test",
      schema: "TestSchema",
    },
  } satisfies TestGenerationPackage;
}
