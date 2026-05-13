#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-learning-evidence-self-check"

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
CHECK_MODULE="$TMP_DIR/lib/learning-evidence-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runLearningEvidenceSelfCheck } = require(modulePath);

  Promise.resolve(runLearningEvidenceSelfCheck()).then((result) => {
    if (!result || result.ok !== true) {
      throw new Error("learning evidence self-check failed");
    }
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
'
