# Six-Factor Delivered Config Logging

## Purpose

This layer records the app-facing six-factor decision that was available at delivery time. It supports the dissertation loop:

`decision -> delivered content -> observed outcome -> real_user training_observation.v1 export`.

## Candidate Config And Delivered Config

`candidate_config` is the six-factor candidate selected by the app-facing policy adapter:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

`delivered_config` is the six-factor config actually delivered to the learner. In current metadata mode they are equal. Keeping both fields is intentional because future runtime may score candidates offline while a fallback or constrained config is actually delivered.

## Storage Points

No database migration is required for v1. Existing JSON fields are used:

- chat route: `ChatMessage.signalsJson.sixFactorDeliveredConfig`
- learning content generation: `ChatMessage.signalsJson.sixFactorDeliveredConfig`
- test generation: `GeneratedTest.validationMetaJson.sixFactorDeliveredConfig`
- evaluation item registration: `EvaluationEpisodeItem.decisionRuntimeJson.sixFactorDeliveredConfig`
- test outcomes: `EvaluationEpisodeItem.outcomeJson`

The existing `sixFactorShadow` metadata remains available for regression/debugging. `sixFactorDeliveredConfig` is the canonical export-oriented metadata object.

## Leakage Guard

`featuresSnapshot` is built only from pre-decision app features. Outcome fields such as `postScore`, `nextStepSuccess`, and `normalizedLearningGain` must not be copied into `featuresSnapshot` or `pre_decision_features`.

Outcome is linked later through `EvaluationEpisodeItem.outcomeJson` and exported only in the `outcome` block of `training_observation.v1`.

## Apply Flag

If `EDUAI_SIX_FACTOR_APPLY=1`, metadata records:

- `appliedToLearnerFacingOutput=true`
- `appliedPath=learning_content`
- `appliedPromptInstructionCount=6`

If apply is disabled, `appliedToLearnerFacingOutput=false`. Default learner-facing behavior remains unchanged.
