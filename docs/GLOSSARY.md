# Glossary

- UX layer: personalization over presentation style (`tone`, `explanation_style`, `response_format`).
- Pedagogy layer: personalization over challenge/cognitive intent (`difficulty_target`, `cognitive_process`, `task_family`, `context`).
- Delivery: requested style/format constraints for generated tests.
- `generationSource`: whether test content came from LLM or fallback path.
- `taggingSource`: whether tagging came fully from LLM vs mixed/rule fallback.
- `learningEligible`: boolean gate indicating if attempt may update personalization stats.
- UX compliance: match quality between requested UX delivery and observed per-question tags.
- UX reward: bounded engagement proxy from timing + answer changes.
- Difficulty band: target accuracy interval `[0.65, 0.80]` used for difficulty decisions.
- Exploration: epsilon-greedy randomization for pedagogy axes (excluding difficulty axis).
- Policy mode: runtime behavior class (`personalized`, `standard`, `manual override`).
- Prediction proxy: heuristic expected outcome estimate (not causal learning estimate).
- Calibration: how closely predictions match observed outcomes (MAE/RMSE/bias).
