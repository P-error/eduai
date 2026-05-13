# Glossary

- Declared preference: what the learner says they prefer.
- Effective preference: the content parameters that actually lead to the best measurable learning result for that learner.
- Optimal educational content: content that maximizes learning gain.
- Next-task success probability: the first practical baseline proxy for optimality in the current research framing.
- ML prediction layer: the layer that predicts pedagogically meaningful variables from replay-safe behavioral and performance data.
- Rendering layer: the rule-based layer that materializes pedagogical decisions into tone, style, formatting, and presentation.
- Authoring/tagging taxonomy: the 10-axis content description schema used to describe and analyze content; it is not the same thing as the set of ML targets.
- Difficulty: a pedagogical decision variable and current first-version ML target.
- Explanation depth: the second current first-version ML target.
- Instructional mode: an optional future ML axis, not a required first-version dissertation target.
- Heuristic baseline: an explicit non-ML policy used for baseline, fallback, or comparison.
- Stub model: a placeholder runtime path that validates the contract shape without claiming a trained model exists.
- Artifact-backed ML: a runtime path that loads an auditable trained artifact and must report artifact availability honestly.
- `generationSource`: whether test content came from an LLM path or a fallback path.
- `taggingSource`: whether tagging came fully from LLM logic or from mixed/rule fallback logic.
- `learningEligible`: whether an attempt is allowed to update learning/personalization statistics under current quality gates.
- Calibration: how closely predictions match observed outcomes.
- Replay-safe: computed only from information available before the current decision point.
