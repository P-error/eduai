#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PYTHON_BIN="${EDUAI_NATIVE_SYNTHETIC_PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$WORKSPACE_DIR/.venv/bin/python" ]]; then
    PYTHON_BIN="$WORKSPACE_DIR/.venv/bin/python"
  else
    PYTHON_BIN="python3"
  fi
fi

"$PYTHON_BIN" "$WORKSPACE_DIR/src/run_pipeline.py" "$@"
