#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from statistics import mean
from typing import Any, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    load_jsonl_dataset,
    supervised_training_readiness,
    validate_observation_record,
)
from eduai_ml.factor_space import FACTOR_NAMES  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Diagnose EduAI training observation JSONL dataset.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--out-md", default="")
    return parser.parse_args()


def _ids(record: Mapping[str, Any]) -> Mapping[str, Any]:
    ids = record.get("ids")
    return ids if isinstance(ids, Mapping) else {}


def _source(record: Mapping[str, Any]) -> Mapping[str, Any]:
    source = record.get("source")
    return source if isinstance(source, Mapping) else {}


def _outcome(record: Mapping[str, Any]) -> Mapping[str, Any]:
    outcome = record.get("outcome")
    return outcome if isinstance(outcome, Mapping) else {}


def _config_key(config: Any) -> str:
    return json.dumps(config if isinstance(config, Mapping) else {}, ensure_ascii=False, sort_keys=True)


def diagnose(records: list[dict[str, Any]], *, input_path: str) -> dict[str, Any]:
    source_kind_distribution: Counter[str] = Counter()
    users: set[str] = set()
    topics: set[str] = set()
    outcome_available_count = 0
    supervised_usable_count = 0
    success_balance: Counter[str] = Counter()
    gains: list[float] = []
    gain_sign_counts: Counter[str] = Counter()
    factor_distribution = {factor: Counter() for factor in FACTOR_NAMES}
    unique_candidate_configs: Counter[str] = Counter()
    candidate_equals_delivered_count = 0
    leakage_violations: list[dict[str, Any]] = []
    schema_errors: list[dict[str, Any]] = []
    missing_blocks: Counter[str] = Counter()
    missing_candidate_factors: Counter[str] = Counter()
    missing_outcome_targets: Counter[str] = Counter()

    required_blocks = (
        "schema_version",
        "ids",
        "source",
        "pre_decision_features",
        "candidate_config",
        "delivered_config",
        "outcome",
        "leakage_guard",
        "policy_context",
    )

    for line_number, record in enumerate(records, start=1):
        for block in required_blocks:
            if block not in record:
                missing_blocks[block] += 1

        try:
            validate_observation_record(record)
        except Exception as error:
            schema_errors.append({"line": line_number, "error": str(error)})

        ids = _ids(record)
        if ids.get("user_ref"):
            users.add(str(ids["user_ref"]))
        if ids.get("topic_ref"):
            topics.add(str(ids["topic_ref"]))

        source_kind_distribution[str(_source(record).get("source_kind", "unknown"))] += 1

        candidate_config = record.get("candidate_config")
        delivered_config = record.get("delivered_config")
        if isinstance(candidate_config, Mapping):
            unique_candidate_configs[_config_key(candidate_config)] += 1
            for factor in FACTOR_NAMES:
                if factor not in candidate_config:
                    missing_candidate_factors[factor] += 1
                else:
                    factor_distribution[factor][str(candidate_config[factor])] += 1
        else:
            for factor in FACTOR_NAMES:
                missing_candidate_factors[factor] += 1
        if candidate_config == delivered_config:
            candidate_equals_delivered_count += 1

        outcome = _outcome(record)
        if outcome.get("outcome_available") is True:
            outcome_available_count += 1
        readiness = supervised_training_readiness(record)
        if readiness.usable:
            supervised_usable_count += 1
        for target_name in ("normalized_learning_gain", "next_step_success", "outcome_available"):
            if outcome.get(target_name) is None:
                missing_outcome_targets[target_name] += 1
        if isinstance(outcome.get("next_step_success"), bool):
            success_balance["positive" if outcome["next_step_success"] else "negative"] += 1
        if isinstance(outcome.get("normalized_learning_gain"), (int, float)):
            gain = float(outcome["normalized_learning_gain"])
            gains.append(gain)
            if gain < 0:
                gain_sign_counts["lt_0"] += 1
            elif gain == 0:
                gain_sign_counts["eq_0"] += 1
            else:
                gain_sign_counts["gt_0"] += 1

        pre_decision_features = record.get("pre_decision_features")
        leaked_fields = (
            sorted(set(pre_decision_features.keys()) & OUTCOME_FIELD_NAMES)
            if isinstance(pre_decision_features, Mapping)
            else []
        )
        leakage_guard = record.get("leakage_guard")
        guard_bad = not isinstance(leakage_guard, Mapping) or leakage_guard.get("uses_only_pre_decision_data") is not True
        if leaked_fields or guard_bad:
            leakage_violations.append(
                {
                    "line": line_number,
                    "observation_id": ids.get("observation_id"),
                    "leaked_fields": leaked_fields,
                    "leakage_guard_bad": guard_bad,
                }
            )

    schema_validation_status = "passed"
    if schema_errors:
        if all('Missing dependency "jsonschema"' in item["error"] for item in schema_errors):
            schema_validation_status = "blocked_missing_jsonschema_dependency"
        else:
            schema_validation_status = "failed"

    return {
        "schema_version": "training_observation_diagnostics.v1",
        "input": input_path,
        "row_count": len(records),
        "source_kind_distribution": dict(sorted(source_kind_distribution.items())),
        "user_count": len(users),
        "topic_count": len(topics),
        "outcome_available_count": outcome_available_count,
        "supervised_usable_count": supervised_usable_count,
        "next_step_success_balance": dict(sorted(success_balance.items())),
        "normalized_learning_gain": {
            "min": min(gains) if gains else None,
            "avg": mean(gains) if gains else None,
            "max": max(gains) if gains else None,
            "sign_counts": dict(sorted(gain_sign_counts.items())),
        },
        "factor_distribution": {
            factor: dict(sorted(counter.items()))
            for factor, counter in factor_distribution.items()
        },
        "unique_candidate_config_count": len(unique_candidate_configs),
        "candidate_equals_delivered_count": candidate_equals_delivered_count,
        "leakage_violations_count": len(leakage_violations),
        "leakage_violations_sample": leakage_violations[:20],
        "schema_checks": {
            "status": schema_validation_status,
            "error_count": len(schema_errors),
            "error_sample": schema_errors[:10],
            "missing_required_blocks": dict(sorted(missing_blocks.items())),
            "missing_candidate_factors": dict(sorted(missing_candidate_factors.items())),
            "missing_outcome_targets": dict(sorted(missing_outcome_targets.items())),
        },
    }


def build_markdown(report: Mapping[str, Any]) -> str:
    gain = report["normalized_learning_gain"]
    success = report["next_step_success_balance"]
    return "\n".join(
        [
            "# THU Training Observation Diagnostics",
            "",
            f"- Input: `{report['input']}`",
            f"- Rows: {report['row_count']}",
            f"- Source kind distribution: `{json.dumps(report['source_kind_distribution'], ensure_ascii=False, sort_keys=True)}`",
            f"- Users: {report['user_count']}",
            f"- Topics: {report['topic_count']}",
            f"- Outcome available: {report['outcome_available_count']}",
            f"- Supervised usable: {report['supervised_usable_count']}",
            f"- next_step_success balance: `{json.dumps(success, ensure_ascii=False, sort_keys=True)}`",
            f"- normalized_learning_gain min/avg/max: {gain['min']} / {gain['avg']} / {gain['max']}",
            f"- Gain sign counts: `{json.dumps(gain['sign_counts'], ensure_ascii=False, sort_keys=True)}`",
            f"- Unique candidate_config: {report['unique_candidate_config_count']}",
            f"- candidate_config == delivered_config: {report['candidate_equals_delivered_count']}",
            f"- Leakage violations: {report['leakage_violations_count']}",
            f"- Schema validation status: `{report['schema_checks']['status']}`",
            "",
            "## Factor Distribution",
            "",
            "```json",
            json.dumps(report["factor_distribution"], ensure_ascii=False, indent=2, sort_keys=True),
            "```",
            "",
        ]
    )


def main() -> int:
    args = parse_args()
    records = load_jsonl_dataset(args.input)
    report = diagnose(records, input_path=args.input)

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.out_md:
        out_md = Path(args.out_md)
        out_md.parent.mkdir(parents=True, exist_ok=True)
        out_md.write_text(build_markdown(report), encoding="utf-8")

    print(
        "OK "
        + json.dumps(
            {
                "rows": report["row_count"],
                "supervised_usable": report["supervised_usable_count"],
                "leakage_violations": report["leakage_violations_count"],
                "schema_status": report["schema_checks"]["status"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
