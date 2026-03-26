import { z } from "zod";
import { optionalEnv, requireEnv } from "../env";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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

type LLMJsonPayload = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  response_format?: {
    type: "json_object";
  };
};

export async function llmChatJson<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const baseUrl = optionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const apiKey = requireEnv("OPENAI_API_KEY");

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

export async function llmChatJsonWithRaw<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; raw: string }> {
  const baseUrl = optionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const apiKey = requireEnv("OPENAI_API_KEY");

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
  return { data: schema.parse(parsed), raw: content };
}

export async function llmChatText(payload: LLMJsonPayload) {
  const baseUrl = optionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const apiKey = requireEnv("OPENAI_API_KEY");

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
