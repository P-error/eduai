# Pedagogy Policy Contract V1

## Purpose

This contract defines the future EduAI-native ML policy boundary for scoring candidate pedagogical configurations. It is independent from the current application runtime and is compatible with the present `difficulty` + `depth` operational baseline.

The intended model form is:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

The model scores candidate configurations. A later policy layer selects the candidate with the best expected educational outcome under explicit constraints.

## Factor Space

V1 contains six categorical factors.

| Factor | Type | Values |
| --- | --- | --- |
| `difficulty` | ordinal pedagogical challenge | `easy`, `medium`, `hard` |
| `depth` | ordinal explanation depth | `brief`, `standard`, `detailed` |
| `support_level` | ordinal instructional support | `minimal`, `guided`, `scaffolded` |
| `presentation_format` | categorical delivery form | `paragraph`, `structured_list`, `step_by_step`, `qa` |
| `examples_level` | ordinal example density | `none`, `single`, `multiple` |
| `terminology_level` | ordinal terminology density | `simple`, `balanced`, `technical` |

The full grid has 972 candidates. Online use should usually score a bounded deterministic subset near the current/base configuration.

## Candidate Config

`candidate_config` is the complete six-factor configuration being evaluated by an offline or runtime scorer.

It must contain exactly:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

No partial candidate is valid in this contract.

## Delivered Config

`delivered_config` has the same shape as `candidate_config`.

It may equal `candidate_config`, but it is intentionally separate because future logs may contain:

- candidates scored offline but not shown;
- a candidate selected by policy;
- the actual configuration delivered after constraints, safety checks, or rendering limitations.

## Training Observation

A canonical training observation stores:

- stable ids for learner, topic, session, content event, and test event;
- decision and outcome timestamps;
- source metadata for `synthetic`, `open_dataset`, or `real_user`;
- pre-decision learner-state features;
- candidate and delivered configurations;
- observed outcome fields;
- leakage guard metadata;
- policy/runtime provenance where available.

The primary target is expected educational outcome, initially proxied by next-step success probability and normalized learning gain when available.

Supervised training rows must preserve the causal order:

```text
features captured before generation + delivered six-factor config + outcome observed after generation
```

Rows with missing outcomes may be exported for audit, but trainer code marks them unusable for supervised fitting and skips them.

## Leakage Guard

Only pre-decision data may appear in `pre_decision_features`.

Outcome fields are explicitly excluded from feature input:

- `post_score`
- `next_step_success`
- `normalized_learning_gain`
- other values observed after delivery

The schema requires `leakage_guard.uses_only_pre_decision_data = true` for valid training observations.

## Open Dataset Compatibility

Open educational datasets often do not contain EduAI's six personalization factors.

Allowed use:

- build learner-state features;
- calibrate success prediction from attempt/outcome history;
- test feature construction and replay-safe evaluation flows.

Not allowed as an honesty claim:

- claiming an open dataset directly trains all six EduAI factors when those factors are absent;
- treating adapted or synthetic factor labels as observed real factor effects without labeling them.

Full six-factor coverage requires synthetic data first and real EduAI delivery/outcome data later.

## Model Artifact

A future model artifact stores:

- artifact identity and schema version;
- factor-space version;
- training-data summary;
- target definition;
- feature and candidate schemas;
- model family, parameters, and optional serialized payload;
- evaluation metrics and baseline comparison;
- compatibility metadata;
- limitations.

The v1 example artifact is schema-valid but untrained. It contains no real weights and must not be served as a model.

## Current Runtime Compatibility

The current app may use only part of this factor space, mainly `difficulty` and `depth`. This is acceptable because this contract is a separate ML foundation.

Compatibility rule:

- existing runtime decisions can be mapped into partial six-factor candidates using explicit defaults during future integration;
- defaults must be labeled as bridge or rendering constraints, not inferred ML outputs;
- current heuristics must not be renamed as ML.

## Future Runtime Integration

A later integration can add a policy layer that:

1. builds replay-safe `pre_decision_features`;
2. generates a bounded candidate set;
3. scores each candidate through a trained artifact;
4. selects a candidate using objective and constraint rules;
5. records candidate, delivered config, provenance, and outcome for backtesting.

The current app integration has a guarded metadata/apply path for this contract, but the trained artifact still depends on user-provided outcome-linked observations before it can support final research claims.
