#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"

DB_NAME="${DB_NAME:-eduai_v18_check_$(date +%Y%m%d_%H%M%S)}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

ADMIN_DB_URL="${ADMIN_DB_URL:-postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres}"
DB_URL="${DB_URL:-postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

WORK_DIR="${WORK_DIR:-tmp/eduai_v18_check}"
EXPORT_DIR="${EXPORT_DIR:-tmp/eduai_v18_export}"
EXPORT_FILE="${EXPORT_DIR}/training_observations.v18.jsonl"

DOCKER_CONTAINER="${DOCKER_CONTAINER:-eduai-v18-postgres}"
AUTO_DOCKER="${AUTO_DOCKER:-1}"

if [ -z "$ZIP_PATH" ]; then
  echo "Ошибка: укажи путь к архиву v18."
  echo "Пример:"
  echo "  ./check_v18.sh ~/Downloads/eduai_user_waves_001_003_v18_antitemplate_chat_clean.zip"
  exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
  echo "Ошибка: архив не найден: $ZIP_PATH"
  exit 1
fi

if [[ ! "$DB_NAME" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "Ошибка: DB_NAME должен содержать только латинские буквы, цифры и подчёркивания."
  echo "Текущий DB_NAME: $DB_NAME"
  exit 1
fi

echo "== Проверка окружения =="

command -v unzip >/dev/null || { echo "Нет unzip"; exit 1; }
command -v psql >/dev/null || { echo "Нет psql"; exit 1; }
command -v npm >/dev/null || { echo "Нет npm"; exit 1; }
command -v npx >/dev/null || { echo "Нет npx"; exit 1; }
command -v python3 >/dev/null || { echo "Нет python3"; exit 1; }

echo "== Проверка PostgreSQL =="

set +e
psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null 2>&1
POSTGRES_OK=$?
set -e

if [ "$POSTGRES_OK" -ne 0 ]; then
  if [ "$AUTO_DOCKER" = "1" ]; then
    command -v docker >/dev/null || {
      echo "PostgreSQL не доступен, Docker не найден."
      echo "Запусти PostgreSQL вручную или установи Docker."
      exit 1
    }

    echo "PostgreSQL не доступен. Пробую поднять временный PostgreSQL через Docker."

    if docker ps -a --format '{{.Names}}' | grep -qx "$DOCKER_CONTAINER"; then
      docker start "$DOCKER_CONTAINER" >/dev/null
    else
      docker run --name "$DOCKER_CONTAINER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_DB=postgres \
        -p "${DB_PORT}:5432" \
        -d postgres:16 >/dev/null
    fi

    echo "Ожидание PostgreSQL..."

    for i in {1..30}; do
      set +e
      psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null 2>&1
      POSTGRES_OK=$?
      set -e

      if [ "$POSTGRES_OK" -eq 0 ]; then
        break
      fi

      sleep 1
    done

    if [ "$POSTGRES_OK" -ne 0 ]; then
      echo "PostgreSQL в Docker не поднялся."
      echo "Проверь:"
      echo "  docker logs $DOCKER_CONTAINER"
      exit 1
    fi
  else
    echo "PostgreSQL не доступен по адресу:"
    echo "  $ADMIN_DB_URL"
    exit 1
  fi
fi

echo "== Очистка временных папок =="

rm -rf "$WORK_DIR" "$EXPORT_DIR"
mkdir -p "$WORK_DIR" "$EXPORT_DIR"

echo "== Проверка ZIP =="

unzip -t "$ZIP_PATH" >/dev/null

echo "== Распаковка архива =="

unzip -q "$ZIP_PATH" -d "$WORK_DIR"

IMPORT_SQL="$WORK_DIR/import_all_waves.sql"

if [ ! -f "$IMPORT_SQL" ]; then
  echo "Ошибка: не найден import_all_waves.sql внутри архива."
  echo "Файлы внутри архива:"
  find "$WORK_DIR" -maxdepth 3 -type f | sort
  exit 1
fi

if [ ! -f "$WORK_DIR/waves/eduai_wave_01.sql" ]; then
  echo "Ошибка: не найден waves/eduai_wave_01.sql."
  find "$WORK_DIR" -maxdepth 3 -type f | sort
  exit 1
fi

echo "== Создание тестовой базы: $DB_NAME =="

psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}';
" >/dev/null

psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null
psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null

echo "== Подготовка Prisma =="

if [ ! -d "node_modules" ]; then
  npm install
fi

DATABASE_URL="$DB_URL" \
DIRECT_URL="$DB_URL" \
npx prisma generate

echo "== Создание схемы через Prisma в локальной тестовой базе =="

DATABASE_URL="$DB_URL" \
DIRECT_URL="$DB_URL" \
npx prisma db push --skip-generate

echo "== Импорт SQL =="

(
  cd "$WORK_DIR"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f import_all_waves.sql
)

echo "== Counts по ключевым таблицам =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'User' AS table_name, COUNT(*) FROM \"User\"
UNION ALL SELECT 'Collection', COUNT(*) FROM \"Collection\"
UNION ALL SELECT 'Subject', COUNT(*) FROM \"Subject\"
UNION ALL SELECT 'SubjectSection', COUNT(*) FROM \"SubjectSection\"
UNION ALL SELECT 'EvaluationEpisode', COUNT(*) FROM \"EvaluationEpisode\"
UNION ALL SELECT 'GeneratedTest', COUNT(*) FROM \"GeneratedTest\"
UNION ALL SELECT 'TestAttempt', COUNT(*) FROM \"TestAttempt\"
UNION ALL SELECT 'EvaluationEpisodeItem', COUNT(*) FROM \"EvaluationEpisodeItem\"
UNION ALL SELECT 'ChatSession', COUNT(*) FROM \"ChatSession\"
UNION ALL SELECT 'ChatMessage', COUNT(*) FROM \"ChatMessage\"
UNION ALL SELECT 'TagAssignment', COUNT(*) FROM \"TagAssignment\"
UNION ALL SELECT 'UserTagStat', COUNT(*) FROM \"UserTagStat\"
ORDER BY table_name;
"

echo "== Проверка чатов =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
WITH ordered AS (
  SELECT
    \"sessionId\",
    role,
    \"createdAt\",
    LAG(role) OVER (
      PARTITION BY \"sessionId\"
      ORDER BY \"createdAt\", id
    ) AS prev_role
  FROM \"ChatMessage\"
)
SELECT
  COUNT(*) FILTER (WHERE role = prev_role) AS same_role_adjacency
FROM ordered;
"

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
WITH first_msg AS (
  SELECT DISTINCT ON (\"sessionId\")
    \"sessionId\",
    role
  FROM \"ChatMessage\"
  ORDER BY \"sessionId\", \"createdAt\", id
)
SELECT COUNT(*) AS sessions_not_starting_with_user
FROM first_msg
WHERE role <> 'user';
"

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT COUNT(*) AS messages_outside_session_interval
FROM \"ChatMessage\" m
JOIN \"ChatSession\" s ON s.id = m.\"sessionId\"
WHERE m.\"createdAt\" < s.\"createdAt\"
   OR m.\"createdAt\" > s.\"updatedAt\" + interval '5 minutes';
"

echo "== Проверка шаблонных маркеров v18 =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT marker, hits
FROM (
  SELECT 'Финальная проверка' AS marker, COUNT(*) AS hits
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%Финальная проверка%'

  UNION ALL SELECT 'Контрольный шаг', COUNT(*)
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%Контрольный шаг%'

  UNION ALL SELECT 'На этой теме держи', COUNT(*)
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%На этой теме держи%'

  UNION ALL SELECT 'Так полезнее', COUNT(*)
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%Так полезнее%'

  UNION ALL SELECT 'Если хочешь, следующим сообщением', COUNT(*)
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%Если хочешь, следующим сообщением%'

  UNION ALL SELECT 'Для «', COUNT(*)
  FROM \"ChatMessage\"
  WHERE role = 'assistant' AND content LIKE '%Для «%'
) t
ORDER BY hits DESC;
"

echo "== Проверка sixFactorDeliveredConfig в ChatMessage.signalsJson =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT
  COUNT(*) AS total_messages,
  COUNT(*) FILTER (
    WHERE \"signalsJson\" ? 'sixFactorDeliveredConfig'
  ) AS with_six_factor_config
FROM \"ChatMessage\";
"

echo "== Проверка user-wave конфликтов =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
WITH per_user_wave AS (
  SELECT
    \"userId\",
    NULLIF(\"assignmentJson\"->>'releaseWave', '')::int AS release_wave,
    COUNT(
      DISTINCT COALESCE(
        \"assignmentJson\"#>>'{researchRouting,experimentArm}',
        \"assignmentJson\"->>'arm',
        \"policyArm\"
      )
    ) AS arm_count
  FROM \"EvaluationEpisode\"
  WHERE \"userId\" IS NOT NULL
    AND \"assignmentJson\" ? 'releaseWave'
  GROUP BY
    \"userId\",
    NULLIF(\"assignmentJson\"->>'releaseWave', '')::int
)
SELECT COUNT(*) AS user_wave_conflicts
FROM per_user_wave
WHERE arm_count > 1;
"

echo "== Проверка updatedAt < createdAt =="

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT table_name, bad_rows
FROM (
  SELECT 'Collection' AS table_name, COUNT(*) AS bad_rows
  FROM \"Collection\"
  WHERE \"updatedAt\" < \"createdAt\"

  UNION ALL SELECT 'Subject', COUNT(*)
  FROM \"Subject\"
  WHERE \"updatedAt\" < \"createdAt\"

  UNION ALL SELECT 'SubjectSection', COUNT(*)
  FROM \"SubjectSection\"
  WHERE \"updatedAt\" < \"createdAt\"

  UNION ALL SELECT 'ChatSession', COUNT(*)
  FROM \"ChatSession\"
  WHERE \"updatedAt\" < \"createdAt\"

  UNION ALL SELECT 'EvaluationEpisode', COUNT(*)
  FROM \"EvaluationEpisode\"
  WHERE \"updatedAt\" < \"createdAt\"

  UNION ALL SELECT 'EvaluationEpisodeItem', COUNT(*)
  FROM \"EvaluationEpisodeItem\"
  WHERE \"updatedAt\" < \"createdAt\"
) t
ORDER BY table_name;
"

echo "== Официальный экспорт training_observation.v1 =="

DATABASE_URL="$DB_URL" \
DIRECT_URL="$DB_URL" \
bash scripts/export-real-user-training-observations.sh \
  --out "$EXPORT_FILE" \
  --limit 50000

if [ ! -s "$EXPORT_FILE" ]; then
  echo "Ошибка: экспорт не создан или пустой: $EXPORT_FILE"
  exit 1
fi

echo "== Размер экспорта =="

wc -l "$EXPORT_FILE"
du -h "$EXPORT_FILE"

echo "== Проверка утечек в pre_decision_features =="

python3 - <<PY
import json
from pathlib import Path

path = Path("$EXPORT_FILE")

forbidden = {
    "id",
    "userId",
    "clientKey",
    "familyKey",
    "createdAt",
    "releaseWave",
    "servedModelVersion",
    "policyId",
    "policyArm",
    "assignmentType",
    "experimentArm",
    "datasetPhase",
    "datasetOrigin",
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "normalized_learning_gain_clamped",
    "outcome_available",
}

bad = []
total = 0

with path.open("r", encoding="utf-8") as f:
    for line_no, line in enumerate(f, start=1):
        if not line.strip():
            continue

        total += 1
        obj = json.loads(line)
        features = obj.get("pre_decision_features", {})
        leaked = sorted(set(features.keys()) & forbidden)

        if leaked:
            bad.append((line_no, leaked))
            if len(bad) >= 20:
                break

print(f"rows={total}")
print(f"leakage_rows={len(bad)}")

if bad:
    for line_no, leaked in bad:
        print(f"line={line_no} leaked={leaked}")
    raise SystemExit(1)
PY

echo "== Проверка обязательных блоков training_observation.v1 =="

python3 - <<PY
import json
from pathlib import Path

path = Path("$EXPORT_FILE")

required_top = {
    "schema_version",
    "ids",
    "timestamps",
    "source",
    "pre_decision_features",
    "candidate_config",
    "delivered_config",
    "outcome",
    "leakage_guard",
    "policy_context",
}

missing = []
bad_schema = []
total = 0

with path.open("r", encoding="utf-8") as f:
    for line_no, line in enumerate(f, start=1):
        if not line.strip():
            continue

        total += 1
        obj = json.loads(line)

        absent = sorted(required_top - set(obj.keys()))
        if absent:
            missing.append((line_no, absent))

        if obj.get("schema_version") != "training_observation.v1":
            bad_schema.append((line_no, obj.get("schema_version")))

        if len(missing) >= 20 or len(bad_schema) >= 20:
            break

print(f"rows={total}")
print(f"missing_required_rows={len(missing)}")
print(f"bad_schema_rows={len(bad_schema)}")

if missing:
    for line_no, absent in missing:
        print(f"line={line_no} missing={absent}")
    raise SystemExit(1)

if bad_schema:
    for line_no, value in bad_schema:
        print(f"line={line_no} schema_version={value}")
    raise SystemExit(1)
PY

echo "== ML-валидация, если доступна =="

if [ -d "ml" ]; then
  cd ml

  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi

  source .venv/bin/activate

  python -m pip install -U pip >/dev/null
  python -m pip install -e . >/dev/null

  if [ -f "scripts/diagnose_training_observations.py" ]; then
    python scripts/diagnose_training_observations.py "../$EXPORT_FILE"
  fi

  set +e
  python -m eduai_ml.data.dataset_validation "../$EXPORT_FILE"
  VALIDATION_STATUS=$?
  set -e

  if [ "$VALIDATION_STATUS" -ne 0 ] && [ -f "src/eduai_ml/data/dataset_validation.py" ]; then
    python src/eduai_ml/data/dataset_validation.py "../$EXPORT_FILE"
  fi

  cd ..
else
  echo "Папка ml не найдена, ML-валидация пропущена."
fi

echo "== Готово =="
echo "База: $DB_NAME"
echo "DATABASE_URL=$DB_URL"
echo "Экспорт: $EXPORT_FILE"

if [ "$AUTO_DOCKER" = "1" ]; then
  echo ""
  echo "Если PostgreSQL был поднят через Docker и больше не нужен:"
  echo "  docker stop $DOCKER_CONTAINER"
  echo "  docker rm $DOCKER_CONTAINER"
fi
