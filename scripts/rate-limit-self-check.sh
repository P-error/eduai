#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-rate-limit-self-check"

rm -rf "$TMP_DIR"

npx tsc \
  --noCheck \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --rootDir src \
  --outDir "$TMP_DIR" \
  src/lib/rate-limit.ts

CHECK_MODULE="$TMP_DIR/lib/rate-limit.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { rateLimitOrThrow, RateLimitExceededError } = require(modulePath);

  const key = "self-check:key";
  rateLimitOrThrow(key, 1, 60000);

  let blocked = false;
  try {
    rateLimitOrThrow(key, 1, 60000);
  } catch (error) {
    if (error instanceof RateLimitExceededError && error.retryAfterSeconds >= 1) {
      blocked = true;
      console.log(JSON.stringify({ ok: true, retryAfterSeconds: error.retryAfterSeconds }));
    } else {
      throw error;
    }
  }

  if (!blocked) {
    throw new Error("rate limit self-check failed: second request was not blocked");
  }
'
