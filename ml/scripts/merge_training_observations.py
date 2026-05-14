#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    summarize_observations,
    supervised_training_readiness,
    validate_observation_record,
    write_jsonl_dataset,
)
from eduai_ml.factor_space import FACTOR_NAMES  # noqa: E402

EXPECTED_SCHEMA_VERSION = "training_observation.v1"
VALID_SOURCE_KINDS = {"synthetic", "open_dataset", "real_user"}
INCLUDE_SINGLE_RE = re.compile(r"^synthetic_user_(\d{3})_.*_longitudinal_v1\.jsonl$")
INCLUDE_BATCH_RE = re.compile(r"^synthetic_users_(021_030|031_040|041_050)_.*_batch_v1\.jsonl$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge EduAI training_observation.v1 JSONL files.")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary-out", required=True)
    parser.add_argument("--expected-users", type=int, default=50)
    parser.add_argument("--expected-observations", type=int, default=1528)
    return parser.parse_args()


def include_reason(path: Path, input_dir: Path) -> tuple[bool, str]:
    if path.parent != input_dir:
        return False, "nested/generated artifact path is excluded"
    if path.suffix != ".jsonl":
        return False, "not a JSONL training file"
    single_match = INCLUDE_SINGLE_RE.match(path.name)
    if single_match:
        user_number = int(single_match.group(1))
        if 1 <= user_number <= 20:
            return True, "synthetic individual user 001-020"
        return False, "individual user outside 001-020 range"
    if INCLUDE_BATCH_RE.match(path.name):
        return True, "synthetic batch users 021-050"
    return False, "name does not match approved THU training observation patterns"


def parse_iso_datetime(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def load_records(path: Path) -> tuple[list[dict[str, Any]], list[str], int, int]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    empty_lines = 0
    broken_json_lines = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            empty_lines += 1
            errors.append(f"{path.name}:{line_number}: empty line")
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            broken_json_lines += 1
            errors.append(f"{path.name}:{line_number}: broken JSON: {error}")
            continue
        if not isinstance(record, dict):
            errors.append(f"{path.name}:{line_number}: JSON line is not an object")
            continue
        if record.get("schema_version") != EXPECTED_SCHEMA_VERSION:
            errors.append(f"{path.name}:{line_number}: schema_version is not {EXPECTED_SCHEMA_VERSION}")
            continue
        try:
            validate_observation_record(record)
        except Exception as error:
            errors.append(f"{path.name}:{line_number}: {error}")
            continue
        records.append(record)
    return records, errors, empty_lines, broken_json_lines


def unique_config_key(record: Mapping[str, Any], block_name: str) -> str:
    config = record.get(block_name, {})
    if not isinstance(config, Mapping):
        return ""
    return "|".join(str(config.get(factor, "")) for factor in FACTOR_NAMES)


def file_entry(path: Path, records: list[Mapping[str, Any]], status: str) -> dict[str, Any]:
    users = {
        str(record.get("ids", {}).get("user_ref", ""))
        for record in records
        if isinstance(record.get("ids"), Mapping)
    }
    return {
        "file": path.name,
        "path": str(path),
        "rows": len(records),
        "users": len(users),
        "status": status,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    output_path = Path(args.output)
    summary_path = Path(args.summary_out)

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"FAIL input directory not found: {input_dir}")
        return 1

    included_files: list[dict[str, Any]] = []
    excluded_files: list[dict[str, str]] = []
    all_records: list[dict[str, Any]] = []
    validation_errors: list[str] = []
    duplicate_ids: list[str] = []
    observation_ids: set[str] = set()
    empty_lines_count = 0
    broken_json_count = 0
    timestamp_errors: list[str] = []
    source_kind_errors: list[str] = []
    leakage_errors: list[str] = []
    supervised_unusable: Counter[str] = Counter()

    for path in sorted(p for p in input_dir.rglob("*") if p.is_file()):
        include, reason = include_reason(path, input_dir)
        if not include:
            excluded_files.append({"file": path.name, "path": str(path), "reason": reason})
            continue

        records, errors, empty_lines, broken_json_lines = load_records(path)
        empty_lines_count += empty_lines
        broken_json_count += broken_json_lines
        validation_errors.extend(errors)
        included_files.append(file_entry(path, records, "included" if not errors else "included_with_errors"))

        for record in records:
            ids = record.get("ids", {})
            observation_id = str(ids.get("observation_id", "")) if isinstance(ids, Mapping) else ""
            if observation_id in observation_ids:
                duplicate_ids.append(observation_id)
            observation_ids.add(observation_id)

            timestamps = record.get("timestamps", {})
            if not isinstance(timestamps, Mapping):
                timestamp_errors.append(f"{observation_id}: timestamps block is invalid")
            else:
                for field_name in ("decision_created_at", "outcome_observed_at"):
                    value = timestamps.get(field_name)
                    if value is not None and not parse_iso_datetime(value):
                        timestamp_errors.append(f"{observation_id}: invalid {field_name}")

            source = record.get("source", {})
            source_kind = source.get("source_kind") if isinstance(source, Mapping) else None
            if source_kind not in VALID_SOURCE_KINDS:
                source_kind_errors.append(f"{observation_id}: invalid source_kind={source_kind!r}")

            features = record.get("pre_decision_features", {})
            if not isinstance(features, Mapping) or set(features.keys()) & OUTCOME_FIELD_NAMES:
                leakage_errors.append(f"{observation_id}: pre_decision_features contains outcome-side fields")
            if record.get("leakage_guard", {}).get("uses_only_pre_decision_data") is not True:
                leakage_errors.append(f"{observation_id}: leakage_guard is not true")

            readiness = supervised_training_readiness(record)
            if not readiness.usable:
                supervised_unusable[str(readiness.reason)] += 1

            all_records.append(record)

    if validation_errors or duplicate_ids or timestamp_errors or source_kind_errors or leakage_errors:
        for error in (validation_errors + duplicate_ids + timestamp_errors + source_kind_errors + leakage_errors)[:20]:
            print(f"FAIL {error}")
        if len(validation_errors) + len(duplicate_ids) + len(timestamp_errors) + len(source_kind_errors) + len(leakage_errors) > 20:
            print("FAIL additional validation errors omitted")
        return 1

    write_jsonl_dataset(output_path, all_records)
    users = {
        str(record.get("ids", {}).get("user_ref", ""))
        for record in all_records
        if isinstance(record.get("ids"), Mapping)
    }
    subjects = {
        str(record.get("ids", {}).get("subject_ref", ""))
        for record in all_records
        if isinstance(record.get("ids"), Mapping)
    }
    topics = {
        str(record.get("ids", {}).get("topic_ref", ""))
        for record in all_records
        if isinstance(record.get("ids"), Mapping)
    }
    candidate_configs = {unique_config_key(record, "candidate_config") for record in all_records}
    delivered_configs = {unique_config_key(record, "delivered_config") for record in all_records}
    success_count = sum(1 for record in all_records if record.get("outcome", {}).get("next_step_success") is True)
    failure_count = sum(1 for record in all_records if record.get("outcome", {}).get("next_step_success") is False)
    negative_gain_rows = sum(
        1
        for record in all_records
        if isinstance(record.get("outcome", {}).get("normalized_learning_gain"), (int, float))
        and record["outcome"]["normalized_learning_gain"] < 0
    )
    expected_users_match = len(users) == args.expected_users
    expected_rows_match = len(all_records) == args.expected_observations

    summary = {
        "schema_version": "training_merge_summary.v1",
        "input_dir": str(input_dir),
        "output_path": str(output_path),
        "output_sha256": sha256_file(output_path),
        "summary_path": str(summary_path),
        "expected": {
            "users": args.expected_users,
            "observations": args.expected_observations,
        },
        "rows": len(all_records),
        "users": len(users),
        "subjects": len(subjects),
        "topics": len(topics),
        "unique_candidate_configs": len(candidate_configs),
        "unique_delivered_configs": len(delivered_configs),
        "success_count": success_count,
        "failure_count": failure_count,
        "negative_gain_rows": negative_gain_rows,
        "included_files": included_files,
        "excluded_files": excluded_files,
        "validation": {
            "schema_version_ok": True,
            "empty_lines_count": empty_lines_count,
            "broken_json_count": broken_json_count,
            "duplicate_observation_ids_count": len(duplicate_ids),
            "candidate_config_present": True,
            "delivered_config_present": True,
            "supervised_unusable_count": sum(supervised_unusable.values()),
            "supervised_unusable_reasons": dict(sorted(supervised_unusable.items())),
            "leakage_guard_ok": not leakage_errors,
            "timestamp_validation": "ok" if not timestamp_errors else "fail",
            "source_kind_validation": "ok" if not source_kind_errors else "fail",
            "expected_users_match": expected_users_match,
            "expected_observations_match": expected_rows_match,
        },
        "dataset_summary": summarize_observations(all_records),
    }

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    status = "OK" if expected_users_match and expected_rows_match else "WARN"
    print(f"{status} merged rows={len(all_records)} users={len(users)} output={output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
