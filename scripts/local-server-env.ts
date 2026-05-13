import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SERVER_LLM_ENV_KEYS = new Set([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
]);

function stripInlineComment(value: string) {
  let quote: "'" | '"' | "`" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === '"' || char === "`") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && quote == null && /\s/.test(value[index - 1] ?? " ")) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function unquoteEnvValue(value: string) {
  const trimmed = stripInlineComment(value);
  const quote = trimmed[0];
  if (
    (quote === "'" || quote === '"' || quote === "`") &&
    trimmed[trimmed.length - 1] === quote
  ) {
    const inner = trimmed.slice(1, -1);
    return quote === '"' ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r") : inner;
  }
  return trimmed;
}

function parseEnvFile(filePath: string) {
  const parsed: Record<string, string> = {};
  if (!existsSync(filePath)) return parsed;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!SERVER_LLM_ENV_KEYS.has(key)) continue;
    parsed[key] = unquoteEnvValue(value ?? "");
  }

  return parsed;
}

export function loadLocalServerLlmEnv(cwd = process.cwd()) {
  const merged: Record<string, string> = {};
  for (const fileName of [
    ".env",
    ".env.development",
    ".env.local",
    ".env.development.local",
  ]) {
    Object.assign(merged, parseEnvFile(join(cwd, fileName)));
  }

  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith("NEXT_PUBLIC_")) continue;
    if (value.trim().length === 0) continue;
    process.env[key] = value;
  }

  return {
    openAiApiKeyAvailable:
      typeof process.env.OPENAI_API_KEY === "string" &&
      process.env.OPENAI_API_KEY.trim().length > 0,
    openAiBaseUrlConfigured:
      typeof process.env.OPENAI_BASE_URL === "string" &&
      process.env.OPENAI_BASE_URL.trim().length > 0,
  };
}
