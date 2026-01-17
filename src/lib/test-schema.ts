import { z } from "zod";

export const QuestionSchema = z.object({
  prompt: z.string(),
  options: z.array(z.string()).min(2),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string().optional(),
});

export const TestSchema = z.object({
  title: z.string(),
  questions: z.array(QuestionSchema).min(1),
});

export type TestPayload = z.infer<typeof TestSchema>;
