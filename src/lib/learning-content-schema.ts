import { z } from "zod";
import {
  LEARNING_CONTENT_CARD_SCHEMA_VERSION,
  type LearningContentCard,
} from "@/lib/episode-generation";

export const LearningContentCardSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(500),
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1).max(80),
            body: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    reflectionPrompt: z.string().trim().min(1).max(220),
  })
  .strict();

export type LearningContentCardPayload = z.infer<typeof LearningContentCardSchema>;

export type LearningContentValidationIssue = {
  code: string;
  path?: string;
  message: string;
};

export type LearningContentValidationResult = {
  valid: boolean;
  errors: LearningContentValidationIssue[];
  warnings: LearningContentValidationIssue[];
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function anchorTokens(value: string) {
  return normalizeText(value)
    .split(/[^a-zа-яё0-9]+/i)
    .filter((token) => token.length >= 4);
}

function hasGuidedSupportMarker(text: string) {
  return /\b(check|hint|mini[- ]?question|next step|try this)\s*[:：-]/i.test(text) ||
    /\b(проверь|подсказка|мини[- ]?вопрос|следующий шаг|попробуй)\s*[:：-]/i.test(
      text,
    );
}

function isExactSingleExampleHeading(value: string) {
  return value.trim() === "One example:";
}

function isOtherExampleHeading(value: string) {
  const heading = value.trim();
  if (isExactSingleExampleHeading(heading)) return false;
  return /\b(one example|worked example|example|for example|sample|пример|например)\b/i.test(
    heading,
  );
}

export function attachLearningContentSchemaVersion(
  payload: LearningContentCardPayload,
): LearningContentCard {
  return {
    schemaVersion: LEARNING_CONTENT_CARD_SCHEMA_VERSION,
    ...payload,
  };
}

export function validateLearningContentCard(params: {
  card: LearningContentCard;
  topic: string;
  subjectTitle?: string | null;
  sectionSnapshot?: string | null;
  sixFactorConfig?: {
    examples_level?: string | null;
    support_level?: string | null;
  } | null;
}): LearningContentValidationResult {
  const errors: LearningContentValidationIssue[] = [];
  const warnings: LearningContentValidationIssue[] = [];
  const text = normalizeText(
    [
      params.card.title,
      params.card.summary,
      params.card.reflectionPrompt,
      ...params.card.sections.flatMap((section) => [section.heading, section.body]),
    ].join(" "),
  );

  if (params.card.sections.length < 2 || params.card.sections.length > 4) {
    errors.push({
      code: "invalid_section_count",
      path: "sections",
      message: "learning_content_card must contain 2-4 sections.",
    });
  }

  params.card.sections.forEach((section, index) => {
    if (section.heading.trim().length === 0 || section.body.trim().length === 0) {
      errors.push({
        code: "empty_section",
        path: `sections.${index}`,
        message: "Section heading and body must be non-empty.",
      });
    }
  });

  const tokens = [
    ...anchorTokens(params.topic),
    ...anchorTokens(params.subjectTitle ?? ""),
    ...anchorTokens(params.sectionSnapshot ?? ""),
  ];
  if (tokens.length > 0 && !tokens.some((token) => text.includes(token))) {
    errors.push({
      code: "not_anchored_to_topic",
      message: "Learning content has no obvious lexical anchor to topic/package.",
    });
  } else if (tokens.length === 0) {
    warnings.push({
      code: "topic_anchor_uncheckable",
      message: "No topic/package tokens were available for anchoring validation.",
    });
  }

  if (params.sixFactorConfig?.examples_level === "single") {
    const exactExampleSections = params.card.sections.filter((section) =>
      isExactSingleExampleHeading(section.heading),
    );
    const otherExampleHeadings = params.card.sections.filter((section) =>
      isOtherExampleHeading(section.heading),
    );
    if (exactExampleSections.length === 0) {
      errors.push({
        code: "missing_single_example_section",
        message:
          "examples_level=single requires one section heading exactly \"One example:\".",
      });
    } else if (exactExampleSections.length > 1 || otherExampleHeadings.length > 0) {
      errors.push({
        code: "too_many_example_sections",
        message:
          "examples_level=single allows only one worked-example section heading.",
      });
    }
  }

  if (params.sixFactorConfig?.support_level === "guided" && !hasGuidedSupportMarker(text)) {
    errors.push({
      code: "missing_guided_support_marker",
      message:
        "support_level=guided requires a visible Check:, Hint:, Mini-question:, Next step:, or Try this: marker.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
