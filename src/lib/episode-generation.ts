import {
  type EvaluationHoldoutStrategy,
  type EvaluationLinkageKind,
  type EvaluationPolicyArm,
  type EvaluationSequenceRole,
  type EvaluationTouchpointType,
} from "@/lib/evaluation";
import { type RenderingDecision } from "@/lib/personalization-runtime";
import {
  buildExternalLearningContentTaskPackage,
  buildExternalTestGenerationTaskPackage,
} from "@/lib/prompt-materialization";
import type {
  SixFactorPedagogicalPromptProfileV1,
} from "@/lib/ml-six-factor-render-mapping";

export const EPISODE_GENERATION_PACKAGE_SCHEMA_VERSION =
  "episode_generation_package_v1_2026_03" as const;
export const LEARNING_CONTENT_CARD_SCHEMA_VERSION =
  "learning_content_card_v1_2026_03" as const;

type EpisodeScope = {
  subjectId: string;
  subjectTitle: string;
  sectionId: string | null;
  sectionPath: string | null;
  topic: string;
  conceptKey: string | null;
  skillKey: string | null;
  familyKey: string;
};

type EpisodePolicySnapshot = {
  arm: EvaluationPolicyArm;
  policyMode: string | null;
  policyId: string | null;
  assignmentSource: string | null;
  personalizationMode: "on" | "off";
};

type EpisodeLinkageSnapshot = {
  linkageKind: EvaluationLinkageKind;
  linkedContentId: string | null;
  holdoutStrategy: EvaluationHoldoutStrategy;
};

type EpisodeRenderingSnapshot = {
  tone: string;
  explanationStyle: string;
  responseFormat: string;
  rulesLayer: {
    id: string;
    basis: string;
  };
  renderingDecision: RenderingDecision;
};

type BaseEpisodeGenerationPackage = {
  schemaVersion: typeof EPISODE_GENERATION_PACKAGE_SCHEMA_VERSION;
  episodeId: string | null;
  protocolKey: string | null;
  sequenceRole: EvaluationSequenceRole;
  touchpointType: EvaluationTouchpointType;
  sixFactorPedagogicalProfile?: SixFactorPedagogicalPromptProfileV1 | null;
  pedagogicalDecision: {
    difficulty: string;
    depth: string;
  };
  rendering: EpisodeRenderingSnapshot;
  policy: EpisodePolicySnapshot;
  scope: EpisodeScope;
  linkage: EpisodeLinkageSnapshot;
};

export type TestGenerationPackage = BaseEpisodeGenerationPackage & {
  contentKind: "generated_test";
  mode: "quiz" | "exam" | "practice";
  questionCount: number;
  outputContract: {
    kind: "mcq_test";
    schema: "TestSchema";
  };
};

export type LearningContentGenerationPackage = BaseEpisodeGenerationPackage & {
  contentKind: "chat_session";
  contentFormat: "structured_explanation_card";
  priorTestOutcome: {
    contentId: string;
    accuracy: number | null;
    questionCount: number | null;
    totalDurationMs: number | null;
    submittedAtIso: string | null;
  } | null;
  outputContract: {
    kind: "learning_content_card";
    schemaVersion: typeof LEARNING_CONTENT_CARD_SCHEMA_VERSION;
  };
};

export type LearningContentCard = {
  schemaVersion: typeof LEARNING_CONTENT_CARD_SCHEMA_VERSION;
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    body: string;
  }>;
  reflectionPrompt: string;
};

export function buildTestGenerationPrompt(
  packageInput: TestGenerationPackage,
  sixFactorProfile?: SixFactorPedagogicalPromptProfileV1 | null,
) {
  const externalPackage = buildExternalTestGenerationTaskPackage(
    packageInput,
    sixFactorProfile ?? packageInput.sixFactorPedagogicalProfile ?? null,
  );

  return [
    "Generate a test strictly from this external task package.",
    "Strict output format: return only JSON matching TestSchema: {\"title\": string, \"questions\": [{\"prompt\": string, \"options\": string[], \"answerIndex\": number, \"explanation\": string}]}",
    "Technical response_format=mcq is mandatory. presentation_format may affect wording inside prompt/explanation only; it must not change JSON keys, MCQ option structure, option count, answerIndex, or validation format.",
    "Use the requested question count from outputContract.questionCount exactly.",
    "Safety/schema constraints override personalization style and six-factor presentation instructions.",
    JSON.stringify(externalPackage, null, 2),
  ].join("\n\n");
}

export function buildLearningContentPrompt(
  packageInput: LearningContentGenerationPackage,
  sixFactorProfile?: SixFactorPedagogicalPromptProfileV1 | null,
) {
  const externalPackage = buildExternalLearningContentTaskPackage(
    packageInput,
    sixFactorProfile ?? packageInput.sixFactorPedagogicalProfile ?? null,
  );

  return [
    "Generate learning content strictly from this external task package.",
    "This step is the instructional core of the episode and must prepare the learner for later test-based evaluation.",
    "Do not mention hidden policies, internal metadata, or package fields.",
    "Strict output format: return only JSON matching learning_content_card: {\"title\": string, \"summary\": string, \"sections\": [{\"heading\": string, \"body\": string}], \"reflectionPrompt\": string}. The sections array must contain 2-4 items.",
    "Safety/schema constraints override personalization style and six-factor presentation instructions.",
    JSON.stringify(externalPackage, null, 2),
  ].join("\n\n");
}

export function renderLearningContentCard(card: LearningContentCard) {
  const sections = card.sections.map((section) =>
    `${section.heading}\n${section.body}`,
  );

  return [card.title, card.summary, ...sections, `Check yourself: ${card.reflectionPrompt}`]
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}
