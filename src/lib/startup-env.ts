import "server-only";
import { assertEnvInProduction, optionalEnv } from "@/lib/env";

function assertUrlIfPresent(name: string) {
  const value = optionalEnv(name);
  if (!value) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[ENV] Invalid URL in ${name}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`[ENV] Unsupported URL protocol in ${name}`);
  }
}

function assertSafeJwtSecretInProduction() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const value = optionalEnv("JWT_SECRET");
  if (value === "dev-secret") {
    throw new Error("[ENV] JWT_SECRET must not use the development fallback in production");
  }
}

assertEnvInProduction("DATABASE_URL");
assertEnvInProduction("JWT_SECRET");
assertEnvInProduction("OPENAI_API_KEY");
assertSafeJwtSecretInProduction();
assertUrlIfPresent("OPENAI_BASE_URL");

export {};
