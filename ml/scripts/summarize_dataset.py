#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import load_jsonl_dataset, summarize_observations  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize EduAI training observation JSONL.")
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    records = load_jsonl_dataset(args.input)
    summary = summarize_observations(records)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
