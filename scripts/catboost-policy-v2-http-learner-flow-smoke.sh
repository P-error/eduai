#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${EDUAI_CATBOOST_SCORER_URL:-}" ]]; then
  echo "BLOCKED EDUAI_CATBOOST_SCORER_URL is required; use /api/catboost-score with a running local server or a deployment URL." >&2
  exit 1
fi

TMP_DIR="${TMPDIR:-/tmp}/eduai-catboost-policy-v2-http-learner-flow-smoke"

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
  src/lib/catboost-policy-v2-http-learner-flow-smoke.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
EDUAI_SIX_FACTOR_ML_POLICY=1 \
EDUAI_SIX_FACTOR_ARTIFACT_PATH="artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json" \
EDUAI_CATBOOST_SCORER_MODE=python_http \
CHECK_MODULE="$TMP_DIR/lib/catboost-policy-v2-http-learner-flow-smoke.js" node -e '
  (async () => {
    const modulePath = process.env.CHECK_MODULE;
    if (!modulePath) throw new Error("missing CHECK_MODULE");
    const { runCatBoostPolicyV2HttpLearnerFlowSmoke } = require(modulePath);
    const result = await runCatBoostPolicyV2HttpLearnerFlowSmoke();
    if (!result || result.ok !== true) {
      throw new Error("catboost policy_v2 HTTP learner-flow smoke failed");
    }
    console.log(JSON.stringify(result, null, 2));
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
'
