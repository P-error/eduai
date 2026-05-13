#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-ml-accuracy-train"

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

mkdir -p "$TMP_DIR/node_modules/@"
ln -sfn "$TMP_DIR/lib" "$TMP_DIR/node_modules/@/lib"

CHECK_MODULE="$TMP_DIR/lib/prediction-ml.js" node -e '
  const { PrismaClient } = require("@prisma/client");
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const {
    buildSyntheticAccuracyMlDatasetRecords,
    trainAccuracyMlArtifact,
  } = require(modulePath);

  function parseIntEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.floor(value) : undefined;
  }

  function parseFloatEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  function parseBoolEnv(name) {
    const raw = process.env[name];
    if (!raw) return undefined;
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return undefined;
  }

  async function main() {
    const sourceMode =
      process.env.EDUAI_ML_SOURCE === "synthetic"
        ? "synthetic"
        : undefined;
    const needsDb =
      !process.env.EDUAI_ML_DATASET_FILE && sourceMode !== "synthetic";
    const prisma = needsDb ? new PrismaClient() : null;

    try {
      const result = await trainAccuracyMlArtifact(prisma, {
        artifactPath: process.env.EDUAI_ML_ARTIFACT_PATH,
        datasetFilePath: process.env.EDUAI_ML_DATASET_FILE,
        timeRangeDays: parseIntEnv("EDUAI_ML_TIME_RANGE_DAYS"),
        maxAttempts: parseIntEnv("EDUAI_ML_MAX_ATTEMPTS"),
        eligibleOnly: parseBoolEnv("EDUAI_ML_ELIGIBLE_ONLY"),
        consentOnly: parseBoolEnv("EDUAI_ML_CONSENT_ONLY"),
        splitRatio: parseFloatEnv("EDUAI_ML_SPLIT_RATIO"),
        iterations: parseIntEnv("EDUAI_ML_ITERATIONS"),
        learningRate: parseFloatEnv("EDUAI_ML_LEARNING_RATE"),
        l2Lambda: parseFloatEnv("EDUAI_ML_L2_LAMBDA"),
        sourceMode,
        syntheticRecords:
          sourceMode === "synthetic"
            ? buildSyntheticAccuracyMlDatasetRecords()
            : undefined,
      });

      if (!result || result.status !== "ok") {
        console.error(JSON.stringify(result ?? { status: "unknown_error" }, null, 2));
        process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
    } finally {
      if (prisma) {
        await prisma.$disconnect();
      }
    }
  }

  main().catch(async (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
'
