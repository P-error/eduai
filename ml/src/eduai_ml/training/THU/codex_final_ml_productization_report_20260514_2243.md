# Final ML productization report

## Итог

PRODUCTION-READY BEHIND FLAGS

## Что сделано

- THU scorer оставлен в training path и скопирован в отдельный runtime path без изменения `current`.
- Env modes для shadow/apply/rollback задокументированы через уже существующие `EDUAI_SIX_FACTOR_*` flags.
- Добавлена численная защита scorer-а: non-finite model output приводит к явному fallback через `scoring_error`.
- Metadata/apply path проверены через настоящий `POST /api/chat`.
- Добавлен deployment-документ для THU runtime.

## Artifact

- training path: `ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json`
- runtime path: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`
- runtime manifest: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/runtime_manifest.json`
- sha256: `7dd4b9978e5ece3b819876d75e1a412c499c8ab6a1e540ac0f18c2ac9d29070e`
- model version: `linear_candidate_scorer_v1_seed_42`
- model family: `linear_candidate_scorer_v1`

## Env modes

| mode | env flags | effect | rollback |
|---|---|---|---|
| safe shadow | `EDUAI_SIX_FACTOR_SHADOW=1`; `EDUAI_SIX_FACTOR_ML_POLICY=1`; `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`; `EDUAI_SIX_FACTOR_APPLY=0` | ML decision is logged in metadata; learner-facing prompt is unchanged. | Set `EDUAI_SIX_FACTOR_SHADOW=0` or remove flags. |
| active ML apply | `EDUAI_SIX_FACTOR_SHADOW=1`; `EDUAI_SIX_FACTOR_ML_POLICY=1`; `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`; `EDUAI_SIX_FACTOR_APPLY=1` | ML selected config is converted into learner-facing render instructions. | Set `EDUAI_SIX_FACTOR_APPLY=0` for full learner-facing rollback. |
| ML-off bridge | `EDUAI_SIX_FACTOR_ML_POLICY=0` | Stops artifact-backed scorer; if shadow/apply stay enabled, explicit heuristic/static bridge remains available and labeled. | Set `EDUAI_SIX_FACTOR_APPLY=0` too if the prompt must be fully unchanged. |

## Runtime safety

| case | result |
|---|---|
| missing artifact | Fallback to heuristic/static bridge; `fallbackUsed=true`; warning includes `artifact_error:artifact_file_missing`. |
| invalid/unreadable artifact | Fallback to heuristic/static bridge; `fallbackUsed=true`; warning includes `artifact_error`. |
| NaN/Inf score | Fallback to heuristic/static bridge; `fallbackUsed=true`; warning includes `scoring_error`. |
| empty candidate set | Guardrails return safe static fallback candidate; `fallbackUsed=true`. |
| guardrail filtering | Unsafe candidates are filtered; metadata records `guardrails_filtered:<count>` and uses safe fallback if all are removed. |
| invalid/missing declared preference | Feature builder sanitizes to `null`; scorer uses missing-value features and does not mutate declared preference truth. |
| `source_kind=real_user` vs synthetic training | Runtime scorer sets `source_kind__real_user`; feature exists in artifact schema and does not break scoring. |

## Metadata

Stored fields checked in `sixFactorShadow` / `sixFactorDeliveredConfig`:

- `sixFactorShadow` present
- `decisionSource`
- `fallbackUsed`
- `policyId`
- `modelVersion`
- `artifactPath`
- `backendKind`
- `candidateConfig`
- `deliveredConfig` / selected config
- `candidateCount`
- `confidence`
- `warnings` / fallback reason
- `featuresSnapshot`
- `leakageGuard`
- `appliedToLearnerFacingOutput`
- `appliedPromptInstructionCount`
- `appliedPath`

## Final smoke

| route | status | key metadata |
|---|---|---|
| shadow route | passed via `POST /api/chat`, HTTP 200 | `decisionSource=ml_policy`; `fallbackUsed=false`; `appliedToLearnerFacingOutput=false`; selected config `difficulty=medium`, `depth=detailed`, `support_level=guided`, `presentation_format=step_by_step`, `examples_level=multiple`, `terminology_level=balanced`; learner-facing prompt changed: no. |
| apply route | passed via `POST /api/chat`, HTTP 200 | `decisionSource=ml_policy`; `fallbackUsed=false`; selected config reached generation: yes; learner-facing prompt changed: yes; `appliedPromptInstructionCount=6`. |

Apply was enabled only in the local Next.js process environment for the smoke; `.env` and `.env.local` were not changed.

## Что изменено

- `src/lib/ml-six-factor-runtime-scorer.ts`
- `src/lib/ml-six-factor-shadow-self-check.ts`
- `docs/ml_six_factor_apply_mode.md`
- `ml/src/eduai_ml/training/THU/ML_RUNTIME_DEPLOYMENT.md`
- `ml/src/eduai_ml/training/THU/codex_final_ml_productization_report_20260514_2243.md`
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/runtime_manifest.json`
- `codex-report/codex_report_20260514_2243.md`

## Что НЕ сделано

- production env не менялся.
- `artifacts/runtime/eduai_native_pedagogy/current` не перезаписывался.
- real-user efficacy не доказана.
- full counterfactual ranking не появился.
- UI не менялся.
- commit/push не выполнялись.

## Следующий шаг для пользователя

For demo/production shadow set `EDUAI_SIX_FACTOR_SHADOW=1`, `EDUAI_SIX_FACTOR_ML_POLICY=1`, `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`, `EDUAI_SIX_FACTOR_APPLY=0`; for active apply change only `EDUAI_SIX_FACTOR_APPLY=1`.

## Key touched modules/contracts

- `scoreSixFactorCandidate`: finite-score guard before candidate selection.
- `resolveSixFactorPolicyDecisionForFeatures`: existing catch/fallback path now covers non-finite scorer output.
- `sixFactorShadow` / `sixFactorDeliveredConfig`: metadata contract verified unchanged and complete.
- `POST /api/chat`: verified as the real learner-facing route path; no route rewrite.
- THU runtime artifact handoff: new versioned runtime copy plus manifest, no `current` pointer mutation.

## Data/model honesty note

- Actually trained/served: `linear_candidate_scorer_v1_seed_42` JSON scorer trained offline on synthetic THU observations.
- Not trained/proven yet: real-user efficacy and production calibration on real learner outcomes.
- Still bridge logic: heuristic/static fallback, guardrail filtering, and render mapping remain explicit bridge/safety layers, not ML.

## Behavioral change

With THU runtime flags, the app can run ML shadow or active apply from a versioned runtime artifact path; scorer non-finite output now falls back instead of allowing non-finite scores into selection/metadata.

## Intentionally not done

No UI changes, no schema changes, no migration, no production env activation, no `current` pointer switch, no long test suite.

## Weakest remaining point

The artifact is synthetic-trained; real-user learning efficacy and calibration remain the main unproven risk.

## Next-step impact

This unlocks local/demo/production shadow rollout behind flags and a controlled apply demo with one-variable learner-facing rollback.

## Checks/scripts run

- `npx prisma validate` - passed.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json bash scripts/ml-six-factor-shadow-self-check.sh` - passed.
- `jq empty` on runtime artifact and manifest - passed.
- `sha256sum` on training and runtime artifacts - passed, hashes match.
- `git diff --check` on changed code/docs - passed.
- `POST /api/chat` shadow smoke through local Next.js server and mock OpenAI-compatible endpoint - passed.
- `POST /api/chat` apply smoke through local Next.js server and mock OpenAI-compatible endpoint - passed.

## Checks failed

None.

## Important remaining limitations

- Local route smoke needed temporary local Postgres startup; smoke records were deleted afterward and the container was stopped.
- The route smoke used a mock OpenAI-compatible endpoint; it verified prompt/metadata routing, not real LLM quality.

## Report delivery status to phone

Failed. Reason: Taildrop to `100.88.154.9` failed because the peer is offline.
