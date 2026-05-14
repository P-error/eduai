# Quick shadow check for THU scorer

## 1. Что сделано

Проверен быстрый shadow/dry-run путь для THU scorer artifact без активации модели для пользователей. Добавлен минимальный smoke-скрипт под `ml/scripts`, artifact загружен, прогнан на 100 observation rows, проверены базовые guardrails/fallback.

## 2. Artifact load

- path: `ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json`
- loaded: yes
- model type/version: `linear_candidate_scorer_v1` / `linear_candidate_scorer_v1_seed_42`
- feature count: 74
- candidate_config fields: `difficulty`, `depth`, `support_level`, `presentation_format`, `examples_level`, `terminology_level`
- forbidden fields found: no
- score range: expected `0..1`; observed `0.261897..0.606238`

## 3. Runtime compatibility

- Текущий runtime/policy path: `src/lib/ml-six-factor-shadow.ts` -> `src/lib/ml-six-factor-policy-adapter.ts` -> `src/lib/ml-six-factor-artifact-loader.ts` + `src/lib/ml-six-factor-runtime-scorer.ts`.
- Shadow включается env flag `EDUAI_SIX_FACTOR_SHADOW=1`; ML scorer отдельно включается `EDUAI_SIX_FACTOR_ML_POLICY=1` и `EDUAI_SIX_FACTOR_ARTIFACT_PATH=...`.
- Подключить artifact сейчас можно только в flagged shadow/dry-run режиме. Runtime source уже умеет читать JSON artifact, генерировать candidate set, фильтровать guardrails, считать score и писать metadata; learner-facing apply требует отдельного `EDUAI_SIX_FACTOR_APPLY`, его не включал.
- Runtime может собрать нужные признаки: попытки, correct rates, recent/topic counters, minutes_since_last_activity, session position, declared difficulty/depth/format, previous difficulty/depth, subject/topic refs.
- Требуют аккуратного mapping при реальном включении: соответствие runtime `previousDifficulty/previousDepth` к THU six-factor state; `declaredPreferenceFormat` может быть `null`, если текущий UI даёт `mcq`; runtime scoring ставит `source_kind__real_user`, тогда как THU model обучена на synthetic rows.
- `user_ref` и outcome-поля не используются как scorer features; `subject_ref/topic_ref` используются только как стабильные hash features.

## 4. Shadow scoring smoke result

- sample_size: 100
- sample_mode: first
- source_kind_for_scoring: `real_user`
- max_candidates: 30
- candidate_count min/mean/max after guardrails: 4 / 14.34 / 27
- unique top-1 configs: 26
- predicted score min/mean/max: 0.261897 / 0.467930 / 0.606238
- NaN/Inf count: 0
- delivered_config match count: 0

Top-1 factor distributions:

| factor | distribution |
|---|---|
| difficulty | easy=1, medium=78, hard=21 |
| depth | brief=7, standard=45, detailed=48 |
| support_level | guided=98, scaffolded=2 |
| presentation_format | paragraph=1, structured_list=16, step_by_step=41, qa=42 |
| examples_level | single=92, multiple=8 |
| terminology_level | simple=19, balanced=78, technical=3 |

## 5. Guardrail/fallback

- checked: yes
- Guardrail result on 100-row smoke: `filtered_total=645`, `fallback_count=0`.
- Runtime fallback smoke: missing artifact falls back to `heuristic_baseline` with `fallbackUsed=true`.
- Что ещё нужно: отдельный staging/dev episode check through real app metadata path, because this quick check did not call API routes or mutate runtime state.

## 6. Быстрые проверки

| команда | статус | краткий результат |
|---|---|---|
| `ml/.venv/bin/python ml/scripts/shadow_check_thu_scorer.py --artifact ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json --dataset ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl --sample-size 100 --sample-mode first --max-candidates 30 --source-kind real_user --output ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42_shadow_quick.json` | pass | 100 rows scored; 26 unique top-1 configs; NaN/Inf=0 |
| targeted runtime loader smoke via temporary TS compile under `ml/.codex_tmp` | pass | THU artifact loaded; runtime decisionSource=`ml_policy`; missing artifact fallback=`heuristic_baseline`; temp dir removed |
| `ml/.venv/bin/python ml/scripts/validate_dataset.py --input ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl` | pass | 1528 observations; supervised_usable=1528; supervised_unusable=0 |
| `ml/.venv/bin/python -m pytest ml/tests/test_artifact_writer.py ml/tests/test_feature_extraction.py ml/tests/test_app_inference_compatibility.py ml/tests/test_guardrails.py -q` | pass | 19 passed in 1.05s |

## 7. Вывод

READY FOR FLAGGED SHADOW INTEGRATION

## 8. Следующий минимальный шаг

Запустить один staging/dev episode с `EDUAI_SIX_FACTOR_SHADOW=1`, `EDUAI_SIX_FACTOR_ML_POLICY=1`, `EDUAI_SIX_FACTOR_ARTIFACT_PATH=ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json` и без `EDUAI_SIX_FACTOR_APPLY`, затем проверить metadata `sixFactorShadow.decisionSource=ml_policy`.

## 9. Служебно

- Changed files: `ml/scripts/shadow_check_thu_scorer.py`, `ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42_shadow_quick.json`, this report.
- Key touched modules/contracts: only offline ML smoke tooling; runtime scorer/loader/guardrail source inspected but not modified.
- Behavioral change: no runtime, API, UI, learner-facing, or production/current artifact behavior changed.
- Intentionally not done: no production/current artifact copy, no model activation, no API route changes, no exhaustive evaluation, no full test suite.
- Data/model honesty note: artifact is an offline linear candidate scorer trained on synthetic THU observations; real-user calibration is not trained yet; runtime still contains explicit fallback/heuristic bridge paths.
- Weakest remaining point: THU artifact was trained on `source_kind=synthetic`, while runtime shadow scoring emits `source_kind=real_user`; this is acceptable for shadow telemetry only, not evidence of production educational quality.
- Next-step impact: the code path is ready for a controlled flagged shadow integration check that records metadata without changing learner-facing output.
- Report delivery status to phone: failed. Reason: initial `sync_docs.py` auto mode had no Taildrop target and SSH fallback lacked `paramiko`; explicit Taildrop to `100.88.154.9` failed because `poco-x6-5g` is offline (`tailscale status`: last seen 18d ago).
