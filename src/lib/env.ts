function readEnv(name: string) {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function requireEnv(name: string) {
  const value = readEnv(name);
  if (value) return value;
  throw new Error(`[ENV] Missing required environment variable: ${name}`);
}

export function requireEnvWithDevFallback(name: string, fallback: string) {
  const value = readEnv(name);
  if (value) return value;
  if (isProduction()) {
    throw new Error(
      `[ENV] Missing required environment variable in production: ${name}`,
    );
  }
  return fallback;
}

export function assertEnvInProduction(name: string) {
  if (!isProduction()) return;
  if (readEnv(name)) return;
  throw new Error(`[ENV] Missing required environment variable in production: ${name}`);
}

export function optionalEnv(name: string) {
  return readEnv(name);
}
