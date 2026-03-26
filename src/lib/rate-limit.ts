type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;
  readonly limit: number;
  readonly windowMs: number;

  constructor(params: { retryAfterSeconds: number; limit: number; windowMs: number }) {
    super("RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.limit = params.limit;
    this.windowMs = params.windowMs;
  }
}

const buckets = new Map<string, RateLimitBucket>();
const GC_INTERVAL = 5_000;
const MAX_BUCKETS_BEFORE_GC = 10_000;
let lastGcAtMs = 0;

function gcExpiredBuckets(nowMs: number) {
  if (buckets.size < MAX_BUCKETS_BEFORE_GC && nowMs - lastGcAtMs < GC_INTERVAL) {
    return;
  }
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      buckets.delete(key);
    }
  }
  lastGcAtMs = nowMs;
}

function normalizePositiveInt(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Math.floor(value);
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    const value = first?.trim();
    if (value) return value;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function rateLimitOrThrow(key: string, limit: number, windowMs: number) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("key must be non-empty");
  }

  const normalizedLimit = normalizePositiveInt(limit, "limit");
  const normalizedWindowMs = normalizePositiveInt(windowMs, "windowMs");
  const nowMs = Date.now();

  gcExpiredBuckets(nowMs);

  const existing = buckets.get(normalizedKey);
  const activeBucket =
    !existing || existing.resetAtMs <= nowMs
      ? {
          count: 0,
          resetAtMs: nowMs + normalizedWindowMs,
        }
      : existing;

  if (activeBucket.count >= normalizedLimit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((activeBucket.resetAtMs - nowMs) / 1000),
    );
    throw new RateLimitExceededError({
      retryAfterSeconds,
      limit: normalizedLimit,
      windowMs: normalizedWindowMs,
    });
  }

  activeBucket.count += 1;
  buckets.set(normalizedKey, activeBucket);

  return {
    remaining: Math.max(0, normalizedLimit - activeBucket.count),
    resetAtMs: activeBucket.resetAtMs,
  };
}
