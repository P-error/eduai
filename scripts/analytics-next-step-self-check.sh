#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-analytics-next-step-self-check"

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
  src/lib/analytics-next-step.ts \
  src/lib/analytics-next-step-self-check.ts \
  src/lib/learner-flow-contract.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/analytics-next-step-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runAnalyticsNextStepSelfCheck } = require(modulePath);
  const result = runAnalyticsNextStepSelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("analytics next-step self-check failed");
  }
  console.log(JSON.stringify(result));
'
