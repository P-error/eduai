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

export type LLMJsonPayload = {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  response_format?: {
    type: "json_object";
  };
};

const DEFAULT_LLM_TIMEOUT_MS = 20_000;

export type LlmJsonFinalSource = "llm" | "llm_repaired" | "fallback";

export type LlmJsonAttemptDiagnostics = {
  phase: "initial" | "repair";
  rawOutput: string | null;
  parseError: string | null;
  schemaError: string | null;
  providerError: string | null;
};

export type LlmJsonCallDiagnostics = {
  rawOutput: string | null;
  parseError: string | null;
  schemaError: string | null;
  providerError: string | null;
  retryCount: number;
  finalSource: LlmJsonFinalSource;
  attempts: LlmJsonAttemptDiagnostics[];
};

export type LlmJsonRequester = (payload: LLMJsonPayload) => Promise<string>;

export type LlmJsonRepairOptions = {
  contractName?: string;
  repairAttempts?: number;
  requester?: LlmJsonRequester;
};

export function redactProviderErrorText(value: string) {
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

function safeErrorMessage(error: unknown) {
  return redactProviderErrorText(
    error instanceof Error ? error.message : String(error),
  );
}

function schemaErrorMessage(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseAndValidateJson<T>(content: string, schema: z.ZodSchema<T>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      ok: false as const,
      data: null,
      parseError: safeErrorMessage(error),
      schemaError: null,
    };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false as const,
      data: null,
      parseError: null,
      schemaError: schemaErrorMessage(validated.error),
    };
  }

  return {
    ok: true as const,
    data: validated.data,
    parseError: null,
    schemaError: null,
  };
}

function buildRepairPayload(params: {
  payload: LLMJsonPayload;
  rawOutput: string | null;
  parseError: string | null;
  schemaError: string | null;
  contractName: string;
}) {
  const repairPrompt = [
    "Repair the previous assistant response so it is valid JSON only.",
    `Contract: ${params.contractName}.`,
    "Keep the original educational intent and requested count. Do not add extra keys. Do not use markdown fences.",
    "Validation errors:",
    params.parseError ? `parse_error: ${params.parseError}` : null,
    params.schemaError ? `schema_error: ${params.schemaError}` : null,
    "Previous raw output:",
    params.rawOutput ?? "",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");

  return {
    ...params.payload,
    temperature: 0,
    response_format: { type: "json_object" as const },
    messages: [
      ...params.payload.messages,
      ...(params.rawOutput
        ? [{ role: "assistant" as const, content: params.rawOutput }]
        : []),
      { role: "user" as const, content: repairPrompt },
    ],
  } satisfies LLMJsonPayload;
}

export async function llmChatJsonWithRepair<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
  options: LlmJsonRepairOptions = {},
): Promise<{ data: T | null; raw: string | null; diagnostics: LlmJsonCallDiagnostics }> {
  const requester = options.requester ?? requestLlm;
  const contractName = options.contractName ?? "strict JSON schema";
  const repairAttempts = Math.max(0, Math.min(options.repairAttempts ?? 1, 2));
  const attempts: LlmJsonAttemptDiagnostics[] = [];
  let lastRaw: string | null = null;
  let lastParseError: string | null = null;
  let lastSchemaError: string | null = null;
  let lastProviderError: string | null = null;

  try {
    lastRaw = await requester(payload);
  } catch (error) {
    lastProviderError = safeErrorMessage(error);
    attempts.push({
      phase: "initial",
      rawOutput: null,
      parseError: null,
      schemaError: null,
      providerError: lastProviderError,
    });
    return {
      data: null,
      raw: null,
      diagnostics: {
        rawOutput: null,
        parseError: null,
        schemaError: null,
        providerError: lastProviderError,
        retryCount: 0,
        finalSource: "fallback",
        attempts,
      },
    };
  }

  const initialValidation = parseAndValidateJson(lastRaw, schema);
  attempts.push({
    phase: "initial",
    rawOutput: lastRaw,
    parseError: initialValidation.parseError,
    schemaError: initialValidation.schemaError,
    providerError: null,
  });
  if (initialValidation.ok) {
    return {
      data: initialValidation.data,
      raw: lastRaw,
      diagnostics: {
        rawOutput: lastRaw,
        parseError: null,
        schemaError: null,
        providerError: null,
        retryCount: 0,
        finalSource: "llm",
        attempts,
      },
    };
  }
  lastParseError = initialValidation.parseError;
  lastSchemaError = initialValidation.schemaError;

  for (let retry = 1; retry <= repairAttempts; retry += 1) {
    const repairPayload = buildRepairPayload({
      payload,
      rawOutput: lastRaw,
      parseError: lastParseError,
      schemaError: lastSchemaError,
      contractName,
    });

    try {
      lastRaw = await requester(repairPayload);
      lastProviderError = null;
    } catch (error) {
      lastProviderError = safeErrorMessage(error);
      attempts.push({
        phase: "repair",
        rawOutput: null,
        parseError: null,
        schemaError: null,
        providerError: lastProviderError,
      });
      continue;
    }

    const repairedValidation = parseAndValidateJson(lastRaw, schema);
    attempts.push({
      phase: "repair",
      rawOutput: lastRaw,
      parseError: repairedValidation.parseError,
      schemaError: repairedValidation.schemaError,
      providerError: null,
    });
    if (repairedValidation.ok) {
      return {
        data: repairedValidation.data,
        raw: lastRaw,
        diagnostics: {
          rawOutput: lastRaw,
          parseError: repairedValidation.parseError,
          schemaError: repairedValidation.schemaError,
          providerError: null,
          retryCount: retry,
          finalSource: "llm_repaired",
          attempts,
        },
      };
    }

    lastParseError = repairedValidation.parseError;
    lastSchemaError = repairedValidation.schemaError;
  }

  return {
    data: null,
    raw: lastRaw,
    diagnostics: {
      rawOutput: lastRaw,
      parseError: lastParseError,
      schemaError: lastSchemaError,
      providerError: lastProviderError,
      retryCount: repairAttempts,
      finalSource: "fallback",
      attempts,
    },
  };
}

export async function llmChatJson<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const result = await llmChatJsonWithRepair(payload, schema);
  if (result.data == null) {
    throw new Error(
      `LLM_JSON_INVALID: ${
        result.diagnostics.providerError ??
        result.diagnostics.schemaError ??
        result.diagnostics.parseError ??
        "unknown JSON validation failure"
      }`,
    );
  }
  return result.data;
}

export async function llmChatJsonWithRaw<T>(
  payload: LLMJsonPayload,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; raw: string }> {
  const result = await llmChatJsonWithRepair(payload, schema);
  if (result.data == null || result.raw == null) {
    throw new Error(
      `LLM_JSON_INVALID: ${
        result.diagnostics.providerError ??
        result.diagnostics.schemaError ??
        result.diagnostics.parseError ??
        "unknown JSON validation failure"
      }`,
    );
  }
  return { data: result.data, raw: result.raw };
}

export async function llmChatText(payload: LLMJsonPayload) {
  return requestLlm(payload);
}
