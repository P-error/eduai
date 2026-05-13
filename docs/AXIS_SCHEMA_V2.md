# Axis Schema v2

Status:
- current authoring/tagging taxonomy document;
- supersedes the older framing where runtime personalization keys were implicitly treated as equal optimization targets.

This schema is for content description, authoring, telemetry slicing, and research analysis.
It is not a list of equal ML targets.

## The 10 Axes

- `education_level`
- `tone`
- `style`
- `format`
- `depth`
- `cognitive_level`
- `task_type`
- `micro_complexity`
- `domain`
- `context`

Tagging rule:
- one tag per axis per question.

## Role Of Each Axis

### Rendering-layer axes

These axes are primarily materialization decisions handled by the rule-based rendering layer:
- `tone`
- `style`
- `format`

They may affect presentation quality, but they are not the current dissertation ML targets.

### Current dissertation ML-relevant axis

Primary first-version authoring axis mapped to ML scope:
- `depth`

This corresponds to explanation depth as a pedagogically meaningful decision variable.

### Context, feature, or constraint axes

These axes typically describe the instructional setting or the slice in which a prediction should operate:
- `education_level`
- `domain`
- `context`
- often `task_type`

They should usually be treated as context/features/constraints rather than as equal optimization targets.

### Overlap axes

These axes remain useful for authoring and analysis, but should not be treated as independent first-version ML targets when they overlap with challenge:
- `cognitive_level`
- `micro_complexity`

## Difficulty Is Separate

`difficulty` is a core pedagogical decision variable and a current first-version ML target, but it is not one of the 10 authoring/tagging axes above.

In the current codebase, implementation-specific keys such as `difficulty_target` may still appear in runtime logic and APIs.
That does not change the taxonomy rule described here.

## Current Implementation Notes

The repository still contains internal runtime aliases and legacy keys from older framing, including fields such as:
- `explanation_style`
- `response_format`
- `difficulty_target`

Interpretation rule:
- these are current implementation details;
- they do not mean that all style/presentation fields are ML targets;
- they do not override the taxonomy roles defined in this document.

Current runtime limitation:
- active `format` support in the practice/test runtime is effectively constrained to `mcq`.

Current runtime alignment:
- core runtime decision outputs are now `difficulty` plus `depth`;
- legacy adapter objects such as `uxPreset`, `pedagogyPreset`, and route-level delivery payloads may still appear for compatibility;
- those adapter objects should be read as materialized outputs or transport wrappers, not as proof that all contained keys are equal decision targets.

## Legacy Framing Clarification

Older documentation sometimes grouped a smaller set of internal runtime keys into a personalization schema and treated them as the main active axes.
That framing should now be read only as implementation-specific baseline history.

For current project direction:
- keep the 10 axes as taxonomy;
- keep `difficulty` plus `depth` as first-version ML focus;
- keep tone/style/format inside the rendering layer.
- keep legacy keys such as `cognitive_process`, `task_family`, and `context` out of the core runtime decision-output contract even if they still appear in tagging, telemetry, or backward-compatible request shapes.
