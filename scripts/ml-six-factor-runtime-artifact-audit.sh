#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-ml-six-factor-runtime-artifact-audit"

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
  src/lib/research-policy-registry.ts \
  src/lib/ml-six-factor-artifact-loader.ts \
  src/lib/ml-six-factor-runtime-artifact-audit.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/ml-six-factor-runtime-artifact-audit.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runMlSixFactorRuntimeArtifactAudit } = require(modulePath);
  const result = runMlSixFactorRuntimeArtifactAudit();
  if (!result || result.ok !== true) {
    throw new Error("ml six-factor runtime artifact audit failed");
  }
  console.log(JSON.stringify(result, null, 2));
'
