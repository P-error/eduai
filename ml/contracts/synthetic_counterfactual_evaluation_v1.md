# Synthetic Counterfactual Evaluation V1

Observed `training_observation.v1` rows contain one delivered candidate and one observed outcome. That is enough for supervised fit metrics, but it is not enough to evaluate whether a scorer can choose the best candidate from a set.

Synthetic counterfactual evaluation creates decision states with multiple candidate labels from the same synthetic outcome function:

```text
pre_decision_features + candidate_config -> synthetic_outcome
```

This is used only for ranking diagnostics.

## Leakage Boundary

Hidden effective learner config and candidate synthetic outcomes are never training features.

The counterfactual file stores evaluation-only labels under `candidate_set[].synthetic_outcome` and marks `diagnostic_truth.not_for_training = true`.

Training feature extraction continues to use only:

- `pre_decision_features`
- `candidate_config`
- safe source/id encodings

It must not use `diagnostic_truth`, `synthetic_outcome`, or hidden/effective config.

## Why This Exists

Candidate outcome scoring is a ranking problem: the policy needs to score many candidate configurations and select one. Without counterfactual labels, ordinary observed rows can only test prediction on delivered rows.

Synthetic counterfactual labels let us test ranking behavior before real counterfactual or randomized EduAI data exists.

## Interpretation

Synthetic ranking metrics are not proof of real educational effect. They only show whether the current scorer can recover the synthetic world's outcome function.

Real-user observations remain necessary for dissertation claims about delivered configuration and learning outcome.

## Commands

Generate counterfactual eval data:

```bash
python ml/scripts/generate_synthetic_counterfactual_eval.py \
  --out ml/examples/synthetic_counterfactual_eval.sample.jsonl \
  --n-learners 30 \
  --n-topics 8 \
  --states-per-learner 8 \
  --max-candidates 30 \
  --seed 42
```

Evaluate a trained artifact as a ranker:

```bash
python ml/scripts/evaluate_candidate_ranker.py \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --counterfactual-input ml/examples/synthetic_counterfactual_eval.sample.jsonl \
  --eval-out ml/examples/candidate_ranker_eval.example.json
```
