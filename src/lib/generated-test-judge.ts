import { z } from "zod";
import {
  llmChatJsonWithRepair,
  type LlmJsonCallDiagnostics,
} from "@/lib/llm/provider";
import { type TestPayload } from "@/lib/test-schema";

export const LLM_TEST_JUDGE_ENV = "EDUAI_LLM_TEST_JUDGE" as const;

export const GeneratedTestJudgeQuestionSchema = z
  .object({
    index: z.number().int().nonnegative(),
    valid: z.boolean(),
    issues: z.array(z.string().trim().min(1)),
    topicAligned: z.boolean(),
    singleCorrectAnswer: z.boolean(),
    answerIndexMatchesExplanation: z.boolean(),
    explanationQuality: z.enum(["good", "acceptable", "weak", "invalid"]),
  })
  .strict();

export const GeneratedTestJudgeSchema = z
  .object({
    valid: z.boolean(),
    overallIssues: z.array(z.string().trim().min(1)),
    questions: z.array(GeneratedTestJudgeQuestionSchema).min(1),
  })
  .strict();

export type GeneratedTestJudgeResult = z.infer<typeof GeneratedTestJudgeSchema>;

export type GeneratedTestJudgeStatus =
  | "disabled"
  | "unavailable"
  | "passed"
  | "failed"
  | "error";

export type GeneratedTestJudgeRun = {
  status: GeneratedTestJudgeStatus;
  result: GeneratedTestJudgeResult | null;
  issues: string[];
  diagnostics: LlmJsonCallDiagnostics | null;
};

function enabledValue(value: unknown) {
  return (
    typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}

export function isGeneratedTestJudgeEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return enabledValue(env[LLM_TEST_JUDGE_ENV]);
}

export async function judgeGeneratedTestArtifact(params: {
  subjectTitle: string;
  topic: string;
  sectionSnapshot: string | null;
  artifact: TestPayload;
  env?: Record<string, string | undefined>;
}): Promise<GeneratedTestJudgeRun> {
  const env = params.env ?? process.env;
  if (!isGeneratedTestJudgeEnabled(env)) {
    return {
      status: "disabled",
      result: null,
      issues: [],
      diagnostics: null,
    };
  }

  if (typeof env.OPENAI_API_KEY !== "string" || env.OPENAI_API_KEY.trim().length === 0) {
    return {
      status: "unavailable",
      result: null,
      issues: ["OPENAI_API_KEY is unavailable; semantic judge skipped."],
      diagnostics: null,
    };
  }

  const prompt = [
    "Validate this generated MCQ test. Do not rewrite it.",
    "Return strict JSON only with this contract:",
    '{"valid": boolean, "overallIssues": string[], "questions": [{"index": number, "valid": boolean, "issues": string[], "topicAligned": boolean, "singleCorrectAnswer": boolean, "answerIndexMatchesExplanation": boolean, "explanationQuality": "good"|"acceptable"|"weak"|"invalid"}]}',
    "Check whether each answerIndex really points to the single correct option and matches the explanation.",
    JSON.stringify(
      {
        subject: params.subjectTitle,
        topic: params.topic,
        sectionContext: params.sectionSnapshot,
        generatedTest: params.artifact,
      },
      null,
      2,
    ),
  ].join("\n\n");

  const response = await llmChatJsonWithRepair(
    {
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict educational assessment validator. You only judge correctness and schema-semantic quality; you never change answers silently.",
        },
        { role: "user", content: prompt },
      ],
    },
    GeneratedTestJudgeSchema,
    {
      contractName: "GeneratedTestJudgeSchema",
      repairAttempts: 1,
    },
  );

  if (response.data == null) {
    return {
      status: "error",
      result: null,
      issues: [
        response.diagnostics.providerError ??
          response.diagnostics.schemaError ??
          response.diagnostics.parseError ??
          "Generated test judge returned invalid JSON.",
      ],
      diagnostics: response.diagnostics,
    };
  }

  const countMatches = response.data.questions.length === params.artifact.questions.length;
  const valid = response.data.valid && countMatches;
  const issues = [
    ...response.data.overallIssues,
    ...(countMatches
      ? []
      : [
          `Judge question count mismatch: expected ${params.artifact.questions.length}, got ${response.data.questions.length}.`,
        ]),
    ...response.data.questions.flatMap((question) =>
      question.valid ? [] : question.issues.map((issue) => `q${question.index}: ${issue}`),
    ),
  ];

  return {
    status: valid ? "passed" : "failed",
    result: response.data,
    issues,
    diagnostics: response.diagnostics,
  };
}
