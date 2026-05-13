#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/download.sh"
"$ROOT_DIR/scripts/inspect.sh"
"$ROOT_DIR/scripts/prepare.sh"
"$ROOT_DIR/scripts/train.sh"
"$ROOT_DIR/scripts/evaluate.sh"
