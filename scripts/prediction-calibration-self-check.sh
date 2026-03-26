#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-calibration-self-check"

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
  src/lib/tags.ts \
  src/lib/prediction-params.ts \
  src/lib/prediction-baselines.ts \
  src/lib/prediction-duration.ts \
  src/lib/prediction-backtest.ts \
  src/lib/prediction-calibration.ts

mkdir -p "$TMP_DIR/node_modules/@/lib"
cp "$TMP_DIR/lib/tags.js" "$TMP_DIR/node_modules/@/lib/tags.js"

CHECK_MODULE="$TMP_DIR/lib/prediction-calibration.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runPredictionCalibrationSyntheticSelfCheck } = require(modulePath);
  const result = runPredictionCalibrationSyntheticSelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("prediction calibration self-check failed");
  }
  console.log(JSON.stringify(result));
'
