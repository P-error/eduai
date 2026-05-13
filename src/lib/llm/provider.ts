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

const DEFAULT_LLM_TIMEOUT_MS = 20_000;

function redactProviderErrorText(value: string) {
  return value.replace(/sk-[A-Za-z0-9_*.-]+/g, "[REDACTED_OPENAI_API_KEY]");
}

function buildAbortSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  return controller.signal;
}

async function requestLlm(payload: LLMJsonPayload) {
  const baseUrl = optionalEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const apiKey = requireEnv("OPENAI_API_KEY");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: buildAbortSignal(DEFAULT_LLM_TIMEOUT_MS),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${redactProviderErrorText(text)}`);
  }

  return LLMResponseSchema.parse(await response.json()).choices[0].message.content;
}

export async function llmChatJson<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const content = await requestLlm(payload);
  const parsed = JSON.parse(content);
  return schema.parse(parsed);
}

export async function llmChatJsonWithRaw<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; raw: string }> {
  const content = await requestLlm(payload);
  const parsed = JSON.parse(content);
  return { data: schema.parse(parsed), raw: content };
}

export async function llmChatText(payload: LLMJsonPayload) {
  return requestLlm(payload);
}
