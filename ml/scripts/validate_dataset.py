#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import validate_jsonl_dataset  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate EduAI training observation JSONL.")
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    try:
        result = validate_jsonl_dataset(args.input)
    except Exception as error:
        print(f"FAIL {args.input}: {error}")
        return 1

    print(
        f"OK {result['path']}: {result['observation_count']} observations; "
        f"supervised_usable={result['supervised_usable_count']}; "
        f"supervised_unusable={result['supervised_unusable_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
