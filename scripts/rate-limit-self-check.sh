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
  $(find src -name '*.ts' -print)

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/rate-limit.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { rateLimitOrThrow, RateLimitExceededError } = require(modulePath);

  (async () => {
    const key = `self-check:key:${Date.now()}`;
    await rateLimitOrThrow(key, 1, 60000, {
      routeClass: "self_check",
      bucketKind: "key",
    });

    let blocked = false;
    try {
      await rateLimitOrThrow(key, 1, 60000, {
        routeClass: "self_check",
        bucketKind: "key",
      });
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
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
'
