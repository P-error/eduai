import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RateLimitBucketKind = "ip" | "user" | "key";

type RateLimitRule = {
  bucketKind: Exclude<RateLimitBucketKind, "key">;
  limit: number;
  windowMs: number;
};

export const RATE_LIMIT_BACKEND = "database_postgres" as const;

export const ROUTE_RATE_LIMIT_POLICIES = {
  auth_login: [{ bucketKind: "ip", limit: 60, windowMs: 60 * 60 * 1000 }],
  auth_register: [{ bucketKind: "ip", limit: 20, windowMs: 60 * 60 * 1000 }],
  chat_turn: [
    { bucketKind: "ip", limit: 80, windowMs: 60 * 1000 },
    { bucketKind: "user", limit: 40, windowMs: 60 * 1000 },
  ],
  test_generate: [
    { bucketKind: "ip", limit: 80, windowMs: 60 * 1000 },
    { bucketKind: "user", limit: 20, windowMs: 60 * 1000 },
  ],
  test_submit: [
    { bucketKind: "ip", limit: 120, windowMs: 60 * 1000 },
    { bucketKind: "user", limit: 30, windowMs: 60 * 1000 },
  ],
  episode_start: [
    { bucketKind: "ip", limit: 60, windowMs: 60 * 1000 },
    { bucketKind: "user", limit: 20, windowMs: 60 * 1000 },
  ],
  episode_advance: [
    { bucketKind: "ip", limit: 120, windowMs: 60 * 1000 },
    { bucketKind: "user", limit: 60, windowMs: 60 * 1000 },
  ],
  admin_dataset_export: [
    { bucketKind: "ip", limit: 20, windowMs: 10 * 60 * 1000 },
    { bucketKind: "user", limit: 10, windowMs: 10 * 60 * 1000 },
  ],
  admin_evaluation_export: [
    { bucketKind: "ip", limit: 20, windowMs: 10 * 60 * 1000 },
    { bucketKind: "user", limit: 10, windowMs: 10 * 60 * 1000 },
  ],
  admin_prompt_template_mutation: [
    { bucketKind: "ip", limit: 30, windowMs: 10 * 60 * 1000 },
    { bucketKind: "user", limit: 15, windowMs: 10 * 60 * 1000 },
  ],
} as const satisfies Record<string, RateLimitRule[]>;

export type RouteRateLimitClass = keyof typeof ROUTE_RATE_LIMIT_POLICIES;

export type RateLimitConsumeResult = {
  remaining: number;
  resetAtMs: number;
  limit: number;
  windowMs: number;
  routeClass: string;
  bucketKind: RateLimitBucketKind;
};

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;
  readonly limit: number;
  readonly windowMs: number;
  readonly routeClass: string;
  readonly bucketKind: RateLimitBucketKind;

  constructor(params: {
    retryAfterSeconds: number;
    limit: number;
    windowMs: number;
    routeClass: string;
    bucketKind: RateLimitBucketKind;
  }) {
    super("RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.limit = params.limit;
    this.windowMs = params.windowMs;
    this.routeClass = params.routeClass;
    this.bucketKind = params.bucketKind;
  }
}

const GC_INTERVAL_MS = 5 * 60 * 1000;
let lastGcAtMs = 0;

function normalizePositiveInt(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Math.floor(value);
}

function normalizeKey(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("key must be non-empty");
  }
  return normalized;
}

function normalizeRouteClass(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "generic";
}

function stableKeyFragment(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 24);
}

async function gcExpiredBuckets(nowMs: number) {
  if (nowMs - lastGcAtMs < GC_INTERVAL_MS) {
    return;
  }
  await prisma.rateLimitBucket.deleteMany({
    where: {
      resetAt: {
        lt: new Date(nowMs),
      },
    },
  });
  lastGcAtMs = nowMs;
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

async function consumeBucket(params: {
  key: string;
  routeClass: string;
  bucketKind: RateLimitBucketKind;
  limit: number;
  windowMs: number;
}) {
  const key = normalizeKey(params.key);
  const routeClass = normalizeRouteClass(params.routeClass);
  const limit = normalizePositiveInt(params.limit, "limit");
  const windowMs = normalizePositiveInt(params.windowMs, "windowMs");
  const now = new Date();
  const nowMs = now.getTime();
  const resetAt = new Date(nowMs + windowMs);

  await gcExpiredBuckets(nowMs);

  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" (
      "key",
      "routeClass",
      "bucketKind",
      "limit",
      "windowMs",
      "count",
      "resetAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${key},
      ${routeClass},
      ${params.bucketKind},
      ${limit},
      ${windowMs},
      1,
      ${resetAt},
      ${now},
      ${now}
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
        WHEN "RateLimitBucket"."count" < EXCLUDED."limit" THEN "RateLimitBucket"."count" + 1
        ELSE EXCLUDED."limit" + 1
      END,
      "routeClass" = EXCLUDED."routeClass",
      "bucketKind" = EXCLUDED."bucketKind",
      "limit" = EXCLUDED."limit",
      "windowMs" = EXCLUDED."windowMs",
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("RATE_LIMIT_BACKEND_EMPTY_RESPONSE");
  }

  const resetAtMs = new Date(row.resetAt).getTime();
  if (row.count > limit + 1) {
    throw new Error("RATE_LIMIT_BACKEND_OVERFLOW");
  }

  if (row.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAtMs - nowMs) / 1000),
    );
    throw new RateLimitExceededError({
      retryAfterSeconds,
      limit,
      windowMs,
      routeClass,
      bucketKind: params.bucketKind,
    });
  }

  return {
    remaining: Math.max(0, limit - Math.min(row.count, limit)),
    resetAtMs,
    limit,
    windowMs,
    routeClass,
    bucketKind: params.bucketKind,
  } satisfies RateLimitConsumeResult;
}

export async function rateLimitOrThrow(
  key: string,
  limit: number,
  windowMs: number,
  options?: {
    routeClass?: string;
    bucketKind?: RateLimitBucketKind;
  },
) {
  return consumeBucket({
    key,
    routeClass: options?.routeClass ?? "generic",
    bucketKind: options?.bucketKind ?? "key",
    limit,
    windowMs,
  });
}

export async function rateLimitRouteOrThrow(params: {
  routeClass: RouteRateLimitClass;
  request: Request;
  userId?: string | null;
}) {
  const rules = ROUTE_RATE_LIMIT_POLICIES[params.routeClass];
  const results: RateLimitConsumeResult[] = [];

  for (const rule of rules) {
    const subject =
      rule.bucketKind === "ip"
        ? getRequestIp(params.request)
        : params.userId?.trim() ?? "";
    if (!subject) {
      continue;
    }

    const result = await consumeBucket({
      key: `${params.routeClass}:${rule.bucketKind}:${stableKeyFragment(`${rule.bucketKind}:${subject}`)}`,
      routeClass: params.routeClass,
      bucketKind: rule.bucketKind,
      limit: rule.limit,
      windowMs: rule.windowMs,
    });
    results.push(result);
  }

  return results;
}

export async function getRateLimitBackendHealth() {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    return {
      ok: rows[0]?.ok === 1,
      backend: RATE_LIMIT_BACKEND,
      warning: null as string | null,
    };
  } catch (error) {
    return {
      ok: false,
      backend: RATE_LIMIT_BACKEND,
      warning:
        error instanceof Error
          ? `rate_limit_backend_unreachable:${error.message}`
          : "rate_limit_backend_unreachable",
    };
  }
}

export function buildRateLimitErrorResponse(
  error: unknown,
  message: string,
) {
  if (!(error instanceof RateLimitExceededError)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "RATE_LIMITED",
      message,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(error.retryAfterSeconds),
      },
    },
  );
}
