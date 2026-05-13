# ML Dataset Contract

Этот контракт описывает формат пользовательского JSONL-датасета для обучения six-factor candidate outcome scorer. Датасет не генерируется кодом Codex: пользователь готовит наблюдения отдельно.

## Логика Наблюдения

Одна строка JSONL соответствует одному content event:

```text
pre_decision_features + delivered_config/candidate_config + outcome -> supervised training row
```

Обязательные блоки:

- `schema_version`: `training_observation.v1`.
- `ids`: `observation_id`, `user_ref`, `subject_ref`, `topic_ref`, `session_ref`, `content_event_ref`, `test_event_ref`.
- `timestamps`: `decision_created_at`, `outcome_observed_at`.
- `source`: происхождение строки и версия адаптера.
- `pre_decision_features`: learner-state до генерации.
- `candidate_config`: шесть факторов, которые scorer оценивает.
- `delivered_config`: шесть факторов, реально доставленные learner-facing content event.
- `outcome`: результат после генерации.
- `leakage_guard`: подтверждение, что feature snapshot построен только до генерации.
- `policy_context`: версия policy/model/backend.

## Допустимые Pre-Decision Features

`pre_decision_features` могут содержать только признаки, известные до генерации:

- `prior_attempts_count`
- `prior_correct_rate`
- `recent_correct_rate`
- `recent_attempts_count`
- `topic_seen_count`
- `minutes_since_last_activity`
- `session_position`
- `declared_preference_difficulty`
- `declared_preference_depth`
- `declared_preference_format`

Outcome-поля запрещены в feature snapshot: `pre_score`, `post_score`, `max_score`, `next_step_success`, `normalized_learning_gain`, `outcome_available`, `outcome`.

## Delivered Config

`delivered_config` должен содержать все 6 факторов:

- `difficulty`: `easy | medium | hard`
- `depth`: `brief | standard | detailed`
- `support_level`: `minimal | guided | scaffolded`
- `presentation_format`: `paragraph | structured_list | step_by_step | qa`
- `examples_level`: `none | single | multiple`
- `terminology_level`: `simple | balanced | technical`

`candidate_config` имеет такой же формат. В обычной supervised строке он равен доставленной конфигурации; в будущих ranking/counterfactual оценках может отличаться.

## Content Event To Outcome Link

`content_event_ref` указывает на сгенерированный образовательный контент. `test_event_ref` указывает на последующий тестовый/структурированный outcome. Outcome используется только как target после генерации и не должен попадать в `pre_decision_features`.

Строки с `outcome.outcome_available=false` валидны для аудита/экспорта, но непригодны для supervised training и пропускаются trainer-ом с явной причиной.

## Минимальный JSONL Пример

```jsonl
{"schema_version":"training_observation.v1","ids":{"observation_id":"obs_001","user_ref":"user_001","subject_ref":"math","topic_ref":"fractions","session_ref":"session_001","content_event_ref":"content_001","test_event_ref":"test_001"},"timestamps":{"decision_created_at":"2026-05-13T10:00:00Z","outcome_observed_at":"2026-05-13T10:08:00Z"},"source":{"source_kind":"real_user","source_name":"eduai_app","source_version":"app_export_v1","adapter_version":"real_user_export_adapter_v1_2026_05"},"pre_decision_features":{"prior_attempts_count":8,"prior_correct_rate":0.63,"recent_correct_rate":0.6,"recent_attempts_count":5,"topic_seen_count":2,"minutes_since_last_activity":14,"session_position":3,"declared_preference_difficulty":"medium","declared_preference_depth":"standard","declared_preference_format":"step_by_step"},"candidate_config":{"difficulty":"medium","depth":"standard","support_level":"guided","presentation_format":"step_by_step","examples_level":"single","terminology_level":"balanced"},"delivered_config":{"difficulty":"medium","depth":"standard","support_level":"guided","presentation_format":"step_by_step","examples_level":"single","terminology_level":"balanced"},"outcome":{"pre_score":0.4,"post_score":0.7,"max_score":1.0,"next_step_success":true,"normalized_learning_gain":0.5,"outcome_available":true},"leakage_guard":{"features_cutoff_at":"2026-05-13T10:00:00Z","uses_only_pre_decision_data":true,"notes":"Features were captured before content generation."},"policy_context":{"policy_id":"six_factor_runtime_ml_policy_v1","model_version":"user_dataset_model_v1","backend_kind":"linear_candidate_scorer_v1","fallback_used":false}}
```
