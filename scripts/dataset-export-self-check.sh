#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-dataset-export-self-check"

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
  src/lib/dataset-export.ts

mkdir -p "$TMP_DIR/node_modules/@/lib"
cp "$TMP_DIR/lib/tags.js" "$TMP_DIR/node_modules/@/lib/tags.js"
cat > "$TMP_DIR/node_modules/@/lib/prediction-backtest.js" <<'JS'
module.exports = require("../../../lib/prediction-backtest.js");
JS
cat > "$TMP_DIR/node_modules/@/lib/prediction-params.js" <<'JS'
module.exports = require("../../../lib/prediction-params.js");
JS

CHECK_MODULE="$TMP_DIR/lib/dataset-export.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runDatasetExportSyntheticSelfCheck } = require(modulePath);
  const result = runDatasetExportSyntheticSelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("dataset export self-check failed");
  }
  console.log(JSON.stringify(result));
'
