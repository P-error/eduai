# SUN Candidate Scorer Model Comparison

- Seed: 42
- Target schema: `outcome_targets.v2_signed_gain`
- sklearn: `available`
- Best offline model: `tree_candidate_scorer_v1:random_forest`
- Best runtime-compatible model: `linear_candidate_scorer_v1`

| model | train | validation | test | signed RMSE | combined RMSE | success acc | balanced acc | log loss | majority acc |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tree_candidate_scorer_v1:random_forest | 5330 | 1263 | 1077 | 0.199023 | 0.1324 | 0.81987 | 0.822085 | 0.373784 | 0.620241 |
| tree_candidate_scorer_v1:extra_trees | 5330 | 1263 | 1077 | 0.20056 | 0.134742 | 0.815227 | 0.822134 | 0.387333 | 0.620241 |
| tree_candidate_scorer_v1:gradient_boosting | 5330 | 1263 | 1077 | 0.214005 | 0.137133 | 0.81337 | 0.813054 | 0.384375 | 0.620241 |
| linear_candidate_scorer_v1 | 5330 | 1263 | 1077 | 0.265737 | 0.156143 | 0.783658 | 0.785784 | 0.430073 | 0.620241 |
| dummy_candidate_scorer_v1:mean | 5330 | 1263 | 1077 | 0.394806 | 0.237822 | 0.620241 | 0.5 | 0.688396 | 0.620241 |
| dummy_candidate_scorer_v1:majority | 5330 | 1263 | 1077 | 0.394806 | 0.237822 | 0.620241 | 0.5 | 10.493126 | 0.620241 |

## Honest Notes

- Synthetic data only; no proof of real learner effectiveness.
- No full counterfactual labels for every possible candidate.
- Tree models remain offline-only unless a TypeScript tree runtime is implemented and tested.
