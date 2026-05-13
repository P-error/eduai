from __future__ import annotations

from typing import Any, Mapping


def class_balance_diagnostics(records: list[Mapping[str, Any]]) -> dict[str, Any]:
    positive_count = 0
    negative_count = 0
    unavailable_count = 0

    for record in records:
        outcome = record.get("outcome", {})
        if outcome.get("outcome_available") is not True or outcome.get("next_step_success") is None:
            unavailable_count += 1
            continue
        if bool(outcome["next_step_success"]):
            positive_count += 1
        else:
            negative_count += 1

    usable_count = positive_count + negative_count
    positive_rate = positive_count / usable_count if usable_count else None
    majority_class_accuracy = (
        max(positive_count, negative_count) / usable_count if usable_count else None
    )
    majority_class = None
    if usable_count:
        majority_class = "positive" if positive_count >= negative_count else "negative"

    warnings: list[str] = []
    if positive_rate is not None and (positive_rate < 0.1 or positive_rate > 0.9):
        warnings.append("strong_class_imbalance")

    return {
        "positive_count": positive_count,
        "negative_count": negative_count,
        "unavailable_count": unavailable_count,
        "positive_rate": round(positive_rate, 6) if positive_rate is not None else None,
        "majority_class": majority_class,
        "majority_class_accuracy": (
            round(majority_class_accuracy, 6) if majority_class_accuracy is not None else None
        ),
        "warnings": warnings,
    }


def metric_balance_warnings(
    *,
    accuracy: float | None,
    balanced_accuracy: float | None,
    positive_rate: float | None,
) -> list[str]:
    warnings: list[str] = []
    if positive_rate is not None and (positive_rate < 0.1 or positive_rate > 0.9):
        warnings.append("accuracy_may_be_misleading_due_to_class_imbalance")
    if accuracy is not None and balanced_accuracy is not None:
        if accuracy >= 0.85 and balanced_accuracy <= 0.55:
            warnings.append("high_accuracy_but_near_chance_balanced_accuracy")
    return warnings
