#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-catboost-policy-v2-learner-flow-smoke"

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
  src/lib/ml-six-factor-policy-contract.ts \
  src/lib/ml-six-factor-feature-builder.ts \
  src/lib/ml-six-factor-fallback.ts \
  src/lib/ml-six-factor-artifact-loader.ts \
  src/lib/ml-six-factor-guardrails.ts \
  src/lib/ml-six-factor-candidate-generator.ts \
  src/lib/ml-six-factor-catboost-python-scorer.ts \
  src/lib/ml-six-factor-runtime-scorer.ts \
  src/lib/ml-six-factor-policy-adapter.ts \
  src/lib/ml-six-factor-runtime-artifact-audit.ts \
  src/lib/catboost-policy-v2-learner-flow-smoke.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
EDUAI_SIX_FACTOR_ML_POLICY=1 \
EDUAI_SIX_FACTOR_ARTIFACT_PATH="artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json" \
CHECK_MODULE="$TMP_DIR/lib/catboost-policy-v2-learner-flow-smoke.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runCatBoostPolicyV2LearnerFlowSmoke } = require(modulePath);
  const result = runCatBoostPolicyV2LearnerFlowSmoke();
  if (!result || result.ok !== true) {
    throw new Error("catboost policy_v2 learner-flow smoke failed");
  }
  console.log(JSON.stringify(result, null, 2));
'
