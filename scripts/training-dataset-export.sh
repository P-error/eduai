#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-training-dataset-export"

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
  src/lib/*.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/training-dataset.js" node -e '
  const { PrismaClient } = require("@prisma/client");
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { exportTrainingDatasetSnapshot } = require(modulePath);

  function parseIntEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.floor(value) : undefined;
  }

  function parseBoolEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return undefined;
  }

  async function main() {
    const prisma = new PrismaClient();
    try {
      const result = await exportTrainingDatasetSnapshot(prisma, {
        phase: process.env.EDUAI_TRAINING_DATASET_PHASE,
        timeRangeDays: parseIntEnv("EDUAI_TRAINING_DATASET_TIME_RANGE_DAYS"),
        maxEpisodes: parseIntEnv("EDUAI_TRAINING_DATASET_MAX_EPISODES"),
        completedOnly: parseBoolEnv("EDUAI_TRAINING_DATASET_COMPLETED_ONLY"),
        consentOnly: parseBoolEnv("EDUAI_TRAINING_DATASET_CONSENT_ONLY"),
        outputRoot: process.env.EDUAI_TRAINING_DATASET_OUTPUT_ROOT,
      });

      console.log(JSON.stringify({
        snapshotId: result.snapshotId,
        snapshotDir: result.snapshotDir,
        phaseRoot: result.phaseRoot,
        exportedEpisodes: result.snapshot.counts.exportedEpisodes,
        exportedRows: result.snapshot.counts.exportedRows,
      }, null, 2));
    } finally {
      await prisma.$disconnect();
    }
  }

  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
'
