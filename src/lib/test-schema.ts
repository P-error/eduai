import { z } from "zod";

export const QuestionSchema = z
  .object({
    prompt: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(2).max(6),
    answerIndex: z.number().int().nonnegative(),
    explanation: z.string().trim().min(1),
  })
  .strict();

export const TestSchema = z
  .object({
    title: z.string().trim().min(1),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict();

export type TestPayload = z.infer<typeof TestSchema>;

export type GeneratedTestValidationIssue = {
  code: string;
  path?: string;
  message: string;
};

export type GeneratedTestValidationResult = {
  valid: boolean;
  errors: GeneratedTestValidationIssue[];
  warnings: GeneratedTestValidationIssue[];
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function topicTokens(value: string) {
  return normalizeText(value)
    .split(/[^a-zа-яё0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function hasPlaceholderContent(question: TestPayload["questions"][number]) {
  const values = [
    question.prompt,
    question.explanation,
    ...question.options,
  ].map(normalizeText);
  return values.some((value) => {
    return (
      /^sample question\b/.test(value) ||
      /^option [a-f]$/.test(value) ||
      value === "generated fallback question"
    );
  });
}

export function validateGeneratedTestArtifact(params: {
  artifact: TestPayload;
  requestedQuestionCount: number;
  topic: string;
  subjectTitle?: string | null;
  source: "llm" | "llm_repaired" | "fallback";
}): GeneratedTestValidationResult {
  const errors: GeneratedTestValidationIssue[] = [];
  const warnings: GeneratedTestValidationIssue[] = [];

  if (params.artifact.questions.length !== params.requestedQuestionCount) {
    errors.push({
      code: "wrong_question_count",
      path: "questions",
      message: `Expected ${params.requestedQuestionCount} questions, got ${params.artifact.questions.length}.`,
    });
  }

  const promptSet = new Set<string>();
  const anchorTokens = [
    ...topicTokens(params.topic),
    ...topicTokens(params.subjectTitle ?? ""),
  ];

  params.artifact.questions.forEach((question, index) => {
    const questionPath = `questions.${index}`;
    if (question.answerIndex >= question.options.length) {
      errors.push({
        code: "answer_index_out_of_range",
        path: `${questionPath}.answerIndex`,
        message: `answerIndex ${question.answerIndex} is outside options length ${question.options.length}.`,
      });
    }

    const normalizedOptions = question.options.map(normalizeText);
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      errors.push({
        code: "duplicate_options",
        path: `${questionPath}.options`,
        message: "Options must be unique after trim/case normalization.",
      });
    }

    const normalizedPrompt = normalizeText(question.prompt);
    if (promptSet.has(normalizedPrompt)) {
      errors.push({
        code: "duplicate_prompt",
        path: `${questionPath}.prompt`,
        message: "Question prompt duplicates another prompt.",
      });
    }
    promptSet.add(normalizedPrompt);

    if (params.source !== "fallback" && hasPlaceholderContent(question)) {
      errors.push({
        code: "placeholder_content",
        path: questionPath,
        message: "LLM-generated tests must not contain placeholder fallback wording.",
      });
    }

    if (anchorTokens.length > 0) {
      const questionText = normalizeText(
        [question.prompt, question.explanation, ...question.options].join(" "),
      );
      const aligned = anchorTokens.some((token) => questionText.includes(token));
      if (!aligned) {
        warnings.push({
          code: "weak_topic_alignment",
          path: questionPath,
          message:
            "Question has no obvious lexical overlap with topic/subject; semantic judge may be needed.",
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
