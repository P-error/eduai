# Six-Factor A/B Evaluation Harness

This harness compares app-facing six-factor policy modes under a controlled mock outcome function.

It is not a browser E2E, not a live LLM/API test, and not real-user educational evidence.

## What Is Compared

Default policies:

- `static_default`: fixed six-factor config:
  - `difficulty=medium`
  - `depth=standard`
  - `support_level=guided`
  - `presentation_format=qa`
  - `examples_level=single`
  - `terminology_level=balanced`
- `declared_preferences_only`: uses declared profile preferences for difficulty, depth, and presentation format only. It does not use learned post-test aggregate adaptation.
- `heuristic_baseline`: explicit six-factor heuristic comparator.
- `ml_policy`: artifact-backed six-factor candidate scorer using `EDUAI_SIX_FACTOR_ML_POLICY=1` semantics.

All modes return a normal app-facing six-factor decision shape. The app-facing contract remains:

`features -> six-factor decision`

The internal ML scorer remains:

`features + candidate_config -> predicted_outcome`

## How To Run

```bash
bash scripts/run-six-factor-ab-evaluation.sh \
  --sessions-per-policy 20 \
  --mock-content \
  --seed 42
```

Optional arguments:

- `--policies static_default,declared_preferences_only,heuristic_baseline,ml_policy`
- `--out exports/six_factor_ab_evaluation_results.json`
- `--jsonl-out exports/six_factor_ab_evaluation_observations.jsonl`
- `--artifact ml/examples/candidate_scorer_artifact.example.json`
- `--subject "Six-factor A/B Controlled Subject"`
- `--topic "Six-factor A/B Controlled Topic"`

Validate the exported observations:

```bash
ml/.venv/bin/python ml/scripts/validate_dataset.py \
  --input exports/six_factor_ab_evaluation_observations.jsonl
```

## Evaluation Design

For each learner index, the runner creates the same latent learner state for every policy mode. The latent state includes:

- base ability;
- learning rate;
- noise level;
- effective six-factor config;
- noisy declared preferences.

Each policy gets the same learner distribution and two sequential simulated content/test steps. Step 2 features may use Step 1 outcome only as already-observed aggregate history:

- prior attempts;
- prior correct rate;
- recent correct rate;
- topic seen count;
- previous delivered difficulty/depth.

Raw outcome fields are never copied into `pre_decision_features`.

## Outcome Simulation

Mock outcome depends on:

- learner ability;
- prior/recent aggregate state;
- match between delivered six-factor config and latent effective config;
- overload penalty;
- learning rate;
- deterministic seed noise.

The simulation is intentionally policy-neutral: it does not reward a row because its policy mode is `ml_policy`.

## Metrics

The result JSON contains:

- observations count;
- mean post score;
- mean normalized learning gain;
- positive gain share;
- next-step success rate;
- mean regret vs simulated oracle;
- fallback-used rate;
- decision source counts;
- factor distribution by policy;
- pairwise differences for ML vs baseline policies.

The recommendation can be:

- `ml_better_controlled_mock`;
- `inconclusive`;
- `ml_not_better_controlled_mock`.

Any positive result is still mock-only and must not be presented as real educational effect.

## Export Format

The runner writes:

- `exports/six_factor_ab_evaluation_results.json`
- `exports/six_factor_ab_evaluation_observations.jsonl`

The JSONL rows follow `training_observation.v1` and use:

- `source_kind=synthetic`
- `source_name=eduai_ab_controlled_mock`

This avoids mixing controlled mock rows with real learner evidence.

## What Real Proof Requires

A defensible real-user evaluation needs:

- randomized policy assignment;
- same or balanced topics;
- pre/post tests;
- no future leakage;
- linked `delivered_config -> outcome` logs;
- enough observations for statistical comparison;
- clear baseline arms, including declared-preference-only and heuristic baseline.
