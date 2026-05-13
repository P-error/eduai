# App Inference Compatibility V1

This contract documents the safe bridge between the current EduAI app and the `ml/` candidate outcome scorer layer.

The target public app contract is:

```text
app context/features -> ML policy adapter -> six-factor config -> render/prompt policy
```

The internal ML scorer remains:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

The app must not depend on candidate scoring internals. The app-facing output is always a six-factor decision.

## Correctness Check

The current app and the dissertation target are only partially aligned.

- Current app decision ownership is mainly `difficulty` + `depth`.
- `tone`, `explanation_style`, and `response_format` are rendering-layer values, not thesis ML targets.
- Current `response_format=mcq` is not equivalent to six-factor `presentation_format`.
- The existing app can log delivered `difficulty` and `depth` through `pedagogicalDecisionJson`, `validationMetaJson`, chat `signalsJson`, and generated package metadata.
- The existing app does not persist `support_level`, `presentation_format`, `examples_level`, or `terminology_level` as first-class delivered decision fields.

Therefore direct ML serving must remain inactive until feature capture, six-factor rendering, and logging are added.

## Inference Input

`app_inference_features.v1` is a realistic inference-safe contract for data the app can provide or default safely.

Core blocks:

- `ids`: user, subject, topic, session/content/test references where available.
- `context`: surface, task type, subject/topic text, section/concept/skill references.
- `pre_decision_features`: learner history features available before the decision.
- `current_or_previous_config`: optional last known six-factor config.
- `runtime_context`: policy/backend provenance.
- `leakage_guard`: explicit no-future-data marker.

Outcome fields are forbidden in `pre_decision_features`.

## Six-Factor Decision Output

`app_six_factor_decision.v1` returns:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`
- provenance fields: `decision_source`, `model_version`, `policy_id`, `artifact_path`, `fallback_used`
- uncertainty/serving fields: `candidate_count`, `confidence`, `warnings`

`decision_source` is one of:

- `ml_policy`
- `heuristic_baseline`
- `static_fallback`

The app contract returns six factors even when the internal policy ranks bounded candidates with a candidate outcome scorer.

## Current App Compatibility

| Field group | Status | App source | Action |
| --- | --- | --- | --- |
| `user_ref` | available | `User.id` in route auth | use as pseudonymous ref/export key |
| `subject_ref` | available/partial | `GeneratedTest.subjectId`, `Subject.id`, episode item subject | use where scoped; null for generic chat |
| `topic_ref` | partial | topic string, `conceptKey`, `skillKey`, `familyKey` | prefer canonical skill/concept when present |
| `session_ref` | partial | `ChatSession.id`, `EvaluationEpisode.id` | use when request is episode/chat linked |
| `content_event_ref` | partial | `GeneratedTest.id`, `ChatSession.id`, `EvaluationEpisodeItem.contentId` | add six-factor logging before using as delivered evidence |
| `test_event_ref` | partial | `TestAttempt.id`, evaluation outcome | only after outcome, never as pre-decision feature |
| history counts/rates | available/partial | `TestAttempt`, `buildPredictionFeaturePayload` | compute aggregate before decision |
| topic seen count | partial | episode/test history by subject/topic/skill | add canonical topic/skill aggregation |
| declared difficulty/depth | available/partial | `declaredPreferencesJson` | use as declared features only |
| declared format | not aligned | current `response_format=mcq` | do not map directly to `presentation_format` |
| policy/backend provenance | available | active policy, evaluation assignment, runtime descriptors | use as policy context |
| six-factor delivered config | missing except first two factors | `pedagogicalDecisionJson` stores difficulty/depth | add logging before real-user training |

## Six-Factor Application Status

| Factor | Current support | Needed change |
| --- | --- | --- |
| `difficulty` | selected and prompted/logged | keep as policy factor |
| `depth` | selected and prompted/logged | keep as policy factor |
| `support_level` | indirectly implied by depth/formatting hint | add explicit prompt/render mapping and logging |
| `presentation_format` | not equivalent to current `response_format=mcq` | add content-structure instructions independent of UI format |
| `examples_level` | weak fallback text mentions examples | add explicit prompt instruction and logging |
| `terminology_level` | not explicit | add prompt instruction and logging |

## Integration Stages

1. Feature compatibility fixes: add topic/session aggregates and inference-safe feature builder in app.
2. Six-factor render mapping: map all six factors into prompt/package instructions without UI changes.
3. Logging/provenance expansion: persist full `delivered_config` and decision source.
4. Experimental ML adapter: load scorer artifact behind an explicit flag.
5. Shadow mode: score six-factor decisions but keep old app behavior.
6. Gated mode: apply ML decisions to selected episode paths only.
7. Full experimental mode: use ML policy for six-factor decisions where evidence is sufficient.
8. Real-user dataset export: convert logged decisions/outcomes to `training_observation.v1`.
9. Retraining: train and compare on real EduAI data with baselines.

## Honesty Note

The current app cannot yet honestly claim six-factor ML personalization. The new compatibility layer is a contract and validation scaffold. It does not activate ML runtime serving and does not prove real educational effect.
