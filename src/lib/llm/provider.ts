import { z } from "zod";

const LLMMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;

const LLMResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

const LLMJsonSchema = z.object({
  model: z.string(),
  messages: z.array(LLMMessageSchema),
  temperature: z.number().optional(),
  response_format: z
    .object({
      type: z.literal("json_object"),
    })
    .optional(),
});

export async function llmChatJson<T>(
  payload: z.infer<typeof LLMJsonSchema>,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text}`);
  }

  const json = LLMResponseSchema.parse(await response.json());
  const content = json.choices[0].message.content;
  const parsed = JSON.parse(content);
  return schema.parse(parsed);
}

export async function llmChatText(payload: z.infer<typeof LLMJsonSchema>) {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text}`);
  }

  const json = LLMResponseSchema.parse(await response.json());
  return json.choices[0].message.content;
}
