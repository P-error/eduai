#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-native-synthetic-generate"

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
CHECK_MODULE="$TMP_DIR/lib/eduai-native-synthetic.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runEduAiNativeSyntheticPipeline } = require(modulePath);

  function parseIntEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.floor(value) : undefined;
  }

  async function main() {
    const result = await runEduAiNativeSyntheticPipeline({
      learnerCount: parseIntEnv("EDUAI_SYNTHETIC_LEARNER_COUNT"),
      episodesPerLearner: parseIntEnv("EDUAI_SYNTHETIC_EPISODES_PER_LEARNER"),
      questionCount: parseIntEnv("EDUAI_SYNTHETIC_QUESTION_COUNT"),
      exportTimeRangeDays: parseIntEnv("EDUAI_SYNTHETIC_EXPORT_TIME_RANGE_DAYS"),
      runId: process.env.EDUAI_SYNTHETIC_RUN_ID,
    });

    console.log(JSON.stringify(result, null, 2));
  }

  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
'
