#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-ml-six-factor-shadow-self-check"

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
  src/lib/ml-six-factor-policy-contract.ts \
  src/lib/ml-six-factor-feature-builder.ts \
  src/lib/ml-six-factor-fallback.ts \
  src/lib/ml-six-factor-artifact-loader.ts \
  src/lib/ml-six-factor-guardrails.ts \
  src/lib/ml-six-factor-candidate-generator.ts \
  src/lib/ml-six-factor-runtime-scorer.ts \
  src/lib/ml-six-factor-policy-adapter.ts \
  src/lib/ml-six-factor-render-mapping.ts \
  src/lib/ml-six-factor-shadow.ts \
  src/lib/ml-six-factor-apply.ts \
  src/lib/ml-six-factor-decision-metadata.ts \
  src/lib/ml-six-factor-outcome-linking.ts \
  src/lib/ml-six-factor-training-observation.ts \
  src/lib/ml-six-factor-real-user-export.ts \
  src/lib/ml-six-factor-shadow-self-check.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/ml-six-factor-shadow-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runMlSixFactorShadowSelfCheck } = require(modulePath);
  const result = runMlSixFactorShadowSelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("ml six-factor shadow self-check failed");
  }
  console.log(JSON.stringify(result));
'
