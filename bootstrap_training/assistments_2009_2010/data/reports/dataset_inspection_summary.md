# Dataset Inspection Summary

| Field | Value |
| --- | --- |
| Generated At (UTC) | 2026-03-27T03:19:11.934111+00:00 |
| Raw Dataset | /home/perror/eduai/bootstrap_training/assistments_2009_2010/data/raw/skill_builder_data_corrected_collapsed.csv |
| Row Count | 346860 |
| Column Count (Cleaned) | 31 |
| Dropped Empty Columns | None |

## Focus Columns
- `user_id`: dtype=int64, non_null=346860, unique=4217
- `problem_id`: dtype=int64, non_null=346860, unique=26688
- `assistment_id`: dtype=int64, non_null=346860, unique=17725
- `skill_id`: dtype=str, non_null=283105, unique=149
- `skill_name`: dtype=str, non_null=274590, unique=101
- `correct`: dtype=int64, non_null=346860, unique=2
- `attempt_count`: dtype=int64, non_null=346860, unique=200
- `hint_count`: dtype=int64, non_null=346860, unique=9
- `ms_first_response`: dtype=int64, non_null=346860, unique=87721
- `overlap_time`: dtype=int64, non_null=346860, unique=101182
- `original`: dtype=int64, non_null=346860, unique=2
- `opportunity`: dtype=int64, non_null=346860, unique=1020
- `opportunity_original`: dtype=float64, non_null=275458, unique=915
- `first_action`: dtype=int64, non_null=346860, unique=3
- `order_id`: dtype=int64, non_null=346860, unique=346860

## Ordering Candidates
- `order_id` (numeric_sequence): usable_ratio=1.0

## Trainable Scope
- Direct supervised target available: `correct` can be used as a next-step correctness / success proxy.
- Sequential user- and skill-history features are feasible because learner IDs, skill IDs, and opportunity counts are present.

## Honest Limits
- No direct labels for `depth`, `tone`, `style`, `format`, or `optimal educational content` are present.
- No direct supervised label for `difficulty` is present; only indirect performance- and item-level signals are available.
- This dataset is suitable for a bootstrap correctness baseline, not as proof that EduAI-native optimal-content personalization is solved.

# Task Scope Validation

- Task framing is valid for an isolated bootstrap-training workspace.
- Direct supervised target available: `correct` can be used as a next-step correctness / success proxy.
- Sequential user- and skill-history features are feasible because learner IDs, skill IDs, and opportunity counts are present.
- No direct labels for `depth`, `tone`, `style`, `format`, or `optimal educational content` are present.
- No direct supervised label for `difficulty` is present; only indirect performance- and item-level signals are available.
- This dataset is suitable for a bootstrap correctness baseline, not as proof that EduAI-native optimal-content personalization is solved.
