# SUN extended model comparison

- Dataset: `/home/perror/eduai/ml/src/eduai_ml/training/SUN/merged/sun_training_observations_merged_v1.jsonl`
- Seed: 42
- Target schema: `outcome_targets.v2_signed_gain`
- Best offline: `tree_candidate_scorer_v1:random_forest`
- Best currently runtime-compatible: `linear_candidate_scorer_v1`
- Recommended integration: `tree_candidate_scorer_v1:random_forest`
- Runtime rewrite needed: `True`

## User split

| model | train | val | test | signed RMSE | combined RMSE | log loss | bal acc | majority acc | gap | sec |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tree_candidate_scorer_v1:random_forest | 5330 | 1263 | 1077 | 0.199023 | 0.1324 | 0.373784 | 0.822085 | 0.620241 | 0.029443 | 13.315 |
| sklearn_candidate_scorer_v1:hist_gradient_boosting | 5330 | 1263 | 1077 | 0.201288 | 0.133575 | 0.373834 | 0.835408 | 0.620241 | 0.020712 | 19.361 |
| sklearn_candidate_scorer_v1:bagging | 5330 | 1263 | 1077 | 0.200089 | 0.133936 | 0.384985 | 0.832689 | 0.620241 | 0.029409 | 72.632 |
| tree_candidate_scorer_v1:extra_trees | 5330 | 1263 | 1077 | 0.20056 | 0.134742 | 0.387333 | 0.822134 | 0.620241 | 0.027054 | 10.956 |
| tree_candidate_scorer_v1:gradient_boosting | 5330 | 1263 | 1077 | 0.214005 | 0.137133 | 0.384375 | 0.813054 | 0.620241 | 0.005794 | 10.04 |
| sklearn_candidate_scorer_v1:shallow_mlp | 5330 | 1263 | 1077 | 0.225051 | 0.147968 | 0.3763 | 0.82705 | 0.620241 | 0.027428 | 6.517 |
| sklearn_candidate_scorer_v1:ridge | 5330 | 1263 | 1077 | 0.242551 | 0.14897 | 0.514858 | 0.801028 | 0.620241 | -0.00066 | 3.566 |
| sklearn_candidate_scorer_v1:elastic_net | 5330 | 1263 | 1077 | 0.249024 | 0.151655 | 0.393284 | 0.801303 | 0.620241 | -0.000879 | 6.27 |
| sklearn_candidate_scorer_v1:linear_support_vector | 5330 | 1263 | 1077 | 0.254091 | 0.151966 | 0.48296 | 0.805245 | 0.620241 | 0.000597 | 13.214 |
| sklearn_candidate_scorer_v1:k_neighbors | 5330 | 1263 | 1077 | 0.240644 | 0.154313 | 0.572489 | 0.781966 | 0.620241 | 0.152276 | 27.093 |
| linear_candidate_scorer_v1 | 5330 | 1263 | 1077 | 0.265737 | 0.156143 | 0.430073 | 0.785784 | 0.620241 | 0.000069 | 131.539 |
| dummy_candidate_scorer_v1:mean | 5330 | 1263 | 1077 | 0.394806 | 0.237822 | 0.688396 | 0.5 | 0.620241 | 0.013845 | 1.416 |
| dummy_candidate_scorer_v1:majority | 5330 | 1263 | 1077 | 0.394806 | 0.237822 | 10.493126 | 0.5 | 0.620241 | 0.013845 | 1.429 |

## Observation split

| model | train | val | test | signed RMSE | combined RMSE | log loss | bal acc | majority acc | gap | sec |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sklearn_candidate_scorer_v1:hist_gradient_boosting | 5351 | 1177 | 1142 | 0.179731 | 0.129013 | 0.384585 | 0.822733 | 0.514011 | 0.012737 | 19.572 |
| tree_candidate_scorer_v1:extra_trees | 5351 | 1177 | 1142 | 0.180539 | 0.129193 | 0.421547 | 0.810891 | 0.514011 | 0.018239 | 11.143 |
| tree_candidate_scorer_v1:random_forest | 5351 | 1177 | 1142 | 0.182565 | 0.130573 | 0.402045 | 0.820538 | 0.514011 | 0.024356 | 13.365 |
| sklearn_candidate_scorer_v1:bagging | 5351 | 1177 | 1142 | 0.185807 | 0.131254 | 0.401978 | 0.822127 | 0.514011 | 0.023522 | 72.319 |
| sklearn_candidate_scorer_v1:shallow_mlp | 5351 | 1177 | 1142 | 0.19271 | 0.136498 | 0.390823 | 0.818523 | 0.514011 | 0.006987 | 6.415 |
| tree_candidate_scorer_v1:gradient_boosting | 5351 | 1177 | 1142 | 0.197046 | 0.139637 | 0.414302 | 0.798293 | 0.514011 | 0.006087 | 10.176 |
| sklearn_candidate_scorer_v1:k_neighbors | 5351 | 1177 | 1142 | 0.191234 | 0.140195 | 0.451371 | 0.765615 | 0.514011 | 0.138168 | 27.424 |
| sklearn_candidate_scorer_v1:ridge | 5351 | 1177 | 1142 | 0.218974 | 0.151302 | 0.541031 | 0.788285 | 0.514011 | 0.001056 | 3.669 |

## Time ordered split

| model | train | val | test | signed RMSE | combined RMSE | log loss | bal acc | majority acc | gap | sec |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sklearn_candidate_scorer_v1:ridge | 5369 | 1150 | 1151 | 0.328446 | 0.160347 | 0.440592 | 0.780729 | 0.663771 | 0.007265 | 3.847 |
| sklearn_candidate_scorer_v1:linear_support_vector | 5369 | 1150 | 1151 | 0.336938 | 0.17338 | 0.408771 | 0.781987 | 0.663771 | 0.016794 | 13.289 |
| sklearn_candidate_scorer_v1:elastic_net | 5369 | 1150 | 1151 | 0.360698 | 0.177332 | 0.349405 | 0.781366 | 0.663771 | 0.022183 | 6.211 |
| linear_candidate_scorer_v1 | 5369 | 1150 | 1151 | 0.3802 | 0.184678 | 0.401765 | 0.788514 | 0.663771 | 0.027752 | 134.945 |
| tree_candidate_scorer_v1:gradient_boosting | 5369 | 1150 | 1151 | 0.380441 | 0.18468 | 0.334545 | 0.804588 | 0.663771 | 0.050309 | 10.145 |
| tree_candidate_scorer_v1:random_forest | 5369 | 1150 | 1151 | 0.376348 | 0.19147 | 0.353089 | 0.787206 | 0.663771 | 0.089312 | 13.769 |
| sklearn_candidate_scorer_v1:hist_gradient_boosting | 5369 | 1150 | 1151 | 0.380828 | 0.191885 | 0.348795 | 0.800729 | 0.663771 | 0.076871 | 19.459 |
| sklearn_candidate_scorer_v1:bagging | 5369 | 1150 | 1151 | 0.37343 | 0.192265 | 0.364692 | 0.802055 | 0.663771 | 0.087506 | 72.199 |

## Failures

- `sklearn_candidate_scorer_v1:ada_boost` / `user_id_hash`: model training exceeded per-model timeout
- `sklearn_candidate_scorer_v1:ada_boost` / `observation_id_hash`: model training exceeded per-model timeout
- `sklearn_candidate_scorer_v1:ada_boost` / `time_ordered`: model training exceeded per-model timeout

## Honest limitations

- Synthetic data only; no real learner effectiveness proof.
- No full counterfactual labels for every possible candidate.
- Current TypeScript runtime supports only linear_candidate_scorer_v1.
- Non-linear offline winners require explicit runtime/export work before production use.
