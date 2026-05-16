# THU Candidate Scorer Model Comparison

- Dataset: `ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl`
- Seed: 42
- Target schema: `outcome_targets.v2_signed_gain`
- sklearn: `available`
- Best tree model: `random_forest` on `user_id_hash`

| model | split | signed RMSE | clamped RMSE | combined RMSE | success acc | balanced acc | log loss | majority acc |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tree_candidate_scorer_v1:random_forest | user_id_hash | 0.171498 | 0.138699 | 0.092325 | 0.952153 | 0.873106 | 0.163839 | 0.842105 |
| tree_candidate_scorer_v1:gradient_boosting | user_id_hash | 0.21729 | 0.168456 | 0.107454 | 0.952153 | 0.897727 | 0.161938 | 0.842105 |
| tree_candidate_scorer_v1:extra_trees | user_id_hash | 0.204187 | 0.132738 | 0.115904 | 0.956938 | 0.888258 | 0.179146 | 0.842105 |
| linear_candidate_scorer_v1 | user_id_hash | 0.322237 | 0.196761 | 0.136901 | 0.880383 | 0.670455 | 0.247556 | 0.842105 |
| dummy_candidate_scorer_v1:mean | user_id_hash | 0.485518 | 0.260246 | 0.212465 | 0.842105 | 0.5 | 0.436189 | 0.842105 |
| dummy_candidate_scorer_v1:majority | user_id_hash | 0.485518 | 0.260246 | 0.212465 | 0.842105 | 0.5 | 4.362796 | 0.842105 |
| tree_candidate_scorer_v1:random_forest | observation_id_hash | 0.194095 | 0.138249 | 0.105781 | 0.887324 | 0.746015 | 0.222055 | 0.821596 |
| tree_candidate_scorer_v1:gradient_boosting | observation_id_hash | 0.234107 | 0.156131 | 0.116233 | 0.887324 | 0.746015 | 0.23785 | 0.821596 |
| tree_candidate_scorer_v1:extra_trees | observation_id_hash | 0.220402 | 0.148034 | 0.120571 | 0.901408 | 0.754586 | 0.241153 | 0.821596 |
| linear_candidate_scorer_v1 | observation_id_hash | 0.314434 | 0.187805 | 0.146479 | 0.840376 | 0.614436 | 0.321823 | 0.821596 |
| tree_candidate_scorer_v1:random_forest | time_ordered | 0.353427 | 0.223668 | 0.14879 | 0.913043 | 0.603865 | 0.204149 | 0.9 |
| tree_candidate_scorer_v1:gradient_boosting | time_ordered | 0.360001 | 0.228735 | 0.151311 | 0.908696 | 0.601449 | 0.209021 | 0.9 |
| linear_candidate_scorer_v1 | time_ordered | 0.436169 | 0.233206 | 0.174505 | 0.913043 | 0.565217 | 0.20406 | 0.9 |
| tree_candidate_scorer_v1:extra_trees | time_ordered | 0.413234 | 0.223951 | 0.177689 | 0.917391 | 0.60628 | 0.206787 | 0.9 |
| dummy_candidate_scorer_v1:mean | time_ordered | 0.468217 | 0.238819 | 0.194102 | 0.9 | 0.5 | 0.36189 | 0.9 |
| dummy_candidate_scorer_v1:majority | time_ordered | 0.468217 | 0.238819 | 0.194102 | 0.9 | 0.5 | 2.763104 | 0.9 |
| dummy_candidate_scorer_v1:mean | observation_id_hash | 0.434719 | 0.237182 | 0.201684 | 0.821596 | 0.5 | 0.470178 | 0.821596 |
| dummy_candidate_scorer_v1:majority | observation_id_hash | 0.434719 | 0.237182 | 0.201684 | 0.821596 | 0.5 | 4.929482 | 0.821596 |

## Honest Interpretation

- This is synthetic/simulation validation only.
- Accuracy is not sufficient because next_step_success is imbalanced.
- Runtime TypeScript integration for tree_candidate_scorer_v1 is not enabled by this script.
