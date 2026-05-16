# THU Training Observation Diagnostics

- Input: `ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl`
- Rows: 1528
- Source kind distribution: `{"synthetic": 1528}`
- Users: 50
- Topics: 354
- Outcome available: 1528
- Supervised usable: 1528
- next_step_success balance: `{"negative": 256, "positive": 1272}`
- normalized_learning_gain min/avg/max: -1.0 / 0.11078128272251309 / 0.8866
- Gain sign counts: `{"eq_0": 103, "gt_0": 1004, "lt_0": 421}`
- Unique candidate_config: 97
- candidate_config == delivered_config: 1528
- Leakage violations: 0
- Schema validation status: `passed`

## Factor Distribution

```json
{
  "depth": {
    "brief": 423,
    "detailed": 370,
    "standard": 735
  },
  "difficulty": {
    "easy": 176,
    "hard": 670,
    "medium": 682
  },
  "examples_level": {
    "multiple": 222,
    "none": 328,
    "single": 978
  },
  "presentation_format": {
    "paragraph": 396,
    "qa": 344,
    "step_by_step": 280,
    "structured_list": 508
  },
  "support_level": {
    "guided": 917,
    "minimal": 433,
    "scaffolded": 178
  },
  "terminology_level": {
    "balanced": 701,
    "simple": 239,
    "technical": 588
  }
}
```
