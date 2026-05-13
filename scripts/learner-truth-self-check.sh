#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="${TMPDIR:-/tmp}/eduai-learner-truth-self-check"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

cd "$ROOT_DIR"

npx tsc \
  --noCheck \
  --rootDir src \
  --outDir "$TMP_DIR" \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  $(find src -name '*.ts' -print)

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/learner-truth-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runLearnerTruthSelfCheck } = require(modulePath);

  runLearnerTruthSelfCheck()
    .then((result) => {
      if (!result || result.ok !== true) {
        throw new Error("learner truth self-check failed");
      }
      console.log(JSON.stringify(result));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
'
