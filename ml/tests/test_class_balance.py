from __future__ import annotations

from copy import deepcopy

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.class_balance import class_balance_diagnostics, metric_balance_warnings


def test_class_balance_counts_positive_rate_and_majority_accuracy() -> None:
    records = generate_synthetic_observations(8, 4, 6, seed=61)
    diagnostics = class_balance_diagnostics(records)
    assert diagnostics["positive_count"] + diagnostics["negative_count"] == len(records)
    assert diagnostics["positive_rate"] is not None
    assert diagnostics["majority_class_accuracy"] is not None


def test_class_balance_warns_on_strong_imbalance() -> None:
    records = generate_synthetic_observations(4, 2, 4, seed=62)
    imbalanced = deepcopy(records)
    for record in imbalanced:
        record["outcome"]["next_step_success"] = True
    diagnostics = class_balance_diagnostics(imbalanced)
    assert "strong_class_imbalance" in diagnostics["warnings"]
    warnings = metric_balance_warnings(accuracy=0.99, balanced_accuracy=0.5, positive_rate=0.99)
    assert "high_accuracy_but_near_chance_balanced_accuracy" in warnings


def test_synthetic_dataset_has_non_trivial_next_step_success_distribution() -> None:
    records = generate_synthetic_observations(50, 10, 12, seed=42)
    diagnostics = class_balance_diagnostics(records)
    assert 0.1 < diagnostics["positive_rate"] < 0.9
