#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-ml/.venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

INPUT_DATASET="1805/ml_training_v10_results/exports/real_user_training_observations_v10.strict.jsonl"
OUT_DIR="ml/src/eduai_ml/training/THESIS_V2/artifacts/catboost_candidate_scorer_v1"

if [[ ! -f "$INPUT_DATASET" ]]; then
  echo "BLOCKED missing input dataset: $INPUT_DATASET" >&2
  exit 1
fi

if ! "$PYTHON_BIN" - <<'PY'
import catboost
print(f"catboost={catboost.__version__}")
PY
then
  echo 'BLOCKED missing catboost dependency. Install with: ml/.venv/bin/python -m pip install -e "ml[train]"' >&2
  exit 1
fi

"$PYTHON_BIN" ml/scripts/train_catboost_candidate_scorer.py \
  --input "$INPUT_DATASET" \
  --out-dir "$OUT_DIR" \
  --seed 42

for required_file in model.cbm artifact.json metrics.json feature_schema.json prediction_parity_sample.jsonl; do
  if [[ ! -s "$OUT_DIR/$required_file" ]]; then
    echo "BLOCKED missing generated artifact: $OUT_DIR/$required_file" >&2
    exit 1
  fi
done

"$PYTHON_BIN" - "$OUT_DIR" <<'PY'
import json
import sys
from pathlib import Path

out_dir = Path(sys.argv[1])
artifact = json.loads((out_dir / "artifact.json").read_text(encoding="utf-8"))
metrics = json.loads((out_dir / "metrics.json").read_text(encoding="utf-8"))
feature_schema = json.loads((out_dir / "feature_schema.json").read_text(encoding="utf-8"))
parity_rows = [line for line in (out_dir / "prediction_parity_sample.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]

checks = {
    "model_family": artifact.get("model_family") == "catboost_candidate_scorer_v1",
    "uses_only_pre_decision_data": artifact.get("leakage_guard", {}).get("uses_only_pre_decision_data") is True,
    "outcome_fields_in_features": artifact.get("leakage_guard", {}).get("outcome_fields_in_features") is False,
    "feature_schema_source_blocks": feature_schema.get("allowed_source_blocks") == ["pre_decision_features", "candidate_config"],
    "train_rows": isinstance(metrics.get("train_rows"), int) and metrics["train_rows"] > 0,
    "validation_rows": isinstance(metrics.get("validation_rows"), int) and metrics["validation_rows"] > 0,
    "test_rows": isinstance(metrics.get("test_rows"), int) and metrics["test_rows"] > 0,
    "parity_rows": 50 <= len(parity_rows) <= 200,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit(f"BLOCKED failed checks: {', '.join(failed)}")
print(json.dumps({
    "ok": True,
    "model_family": artifact["model_family"],
    "train_rows": metrics["train_rows"],
    "validation_rows": metrics["validation_rows"],
    "test_rows": metrics["test_rows"],
    "skipped_rows": metrics["skipped_rows"],
    "learning_gain_rmse": metrics["learning_gain_rmse"],
    "next_step_success_balanced_accuracy": metrics["next_step_success_balanced_accuracy"],
    "parity_rows": len(parity_rows),
}, sort_keys=True))
PY
