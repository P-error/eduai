import type { MlPersonalizationView } from "@/lib/ml-personalization-view";
import V2Card from "@/components/v2/V2Card";

type V2PersonalizationSummaryProps = {
  metadata?: MlPersonalizationView | null;
  className?: string;
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  difficulty: {
    easy: "лёгкая",
    medium: "средняя",
    hard: "сложная",
  },
  depth: {
    brief: "краткая",
    standard: "сбалансированная",
    detailed: "подробная",
  },
  support_level: {
    minimal: "минимальная",
    guided: "с подсказками",
    scaffolded: "пошаговая",
  },
  presentation_format: {
    paragraph: "связный текст",
    structured_list: "структурированный список",
    step_by_step: "пошагово",
    qa: "вопрос-ответ",
  },
  examples_level: {
    none: "без примеров",
    single: "один пример",
    multiple: "несколько примеров",
  },
  terminology_level: {
    simple: "простая",
    balanced: "сбалансированная",
    technical: "техническая",
  },
};

const DECISION_SOURCE_LABELS: Record<string, string> = {
  ml_policy: "ML-модель",
  heuristic_baseline: "эвристический fallback (не ML)",
  static_fallback: "безопасный fallback",
  fallback: "безопасный fallback",
  shadow_only: "shadow-наблюдение",
  legacy_derived: "устаревшая совместимость",
};

function humanize(value: string | null | undefined) {
  if (!value) return "не задано";
  return value.replaceAll("_", " ");
}

function label(axis: keyof typeof VALUE_LABELS, value: string | null | undefined) {
  if (!value) return "не задано";
  return VALUE_LABELS[axis]?.[value] ?? humanize(value);
}

function decisionHeadline(metadata: MlPersonalizationView) {
  if (
    metadata.decisionSource === "shadow_only" ||
    !metadata.appliedToLearnerFacingOutput
  ) {
    return "Shadow-наблюдение, не применено к объяснению";
  }
  if (
    metadata.fallbackUsed ||
    metadata.decisionSource === "static_fallback" ||
    metadata.decisionSource === "fallback" ||
    metadata.decisionSource === "legacy_derived"
  ) {
    return "Использован безопасный fallback";
  }
  if (metadata.decisionSource === "heuristic_baseline") {
    return "Эвристический fallback выбрал способ подачи";
  }
  if (metadata.decisionSource === "ml_policy") {
    return "ML-модель выбрала способ подачи";
  }
  return "Источник персонализации не распознан";
}

function decisionChipLabel(
  metadata: MlPersonalizationView,
  sourceLabel: string,
) {
  if (
    metadata.decisionSource === "shadow_only" ||
    !metadata.appliedToLearnerFacingOutput
  ) {
    return "Shadow-наблюдение";
  }
  if (metadata.fallbackUsed) {
    return "Безопасный fallback";
  }
  return sourceLabel;
}

export default function V2PersonalizationSummary({
  metadata,
  className,
}: V2PersonalizationSummaryProps) {
  if (!metadata) {
    return (
      <V2Card className={className} tone="soft">
        <p className="v2-eyebrow">Персонализация</p>
        <h3 className="v2-title-sm mt-2">Недостаточно данных для персонализации</h3>
        <p className="v2-copy-sm mt-2">
          Сейчас используется стандартная подача. EduAI начнёт точнее подбирать
          объяснение после нескольких проверок.
        </p>
      </V2Card>
    );
  }

  const selected = metadata.selected_config;
  const factors = [
    ["Сложность", label("difficulty", selected.difficulty)],
    ["Глубина", label("depth", selected.depth)],
    ["Поддержка", label("support_level", selected.support_level)],
    ["Формат", label("presentation_format", selected.presentation_format)],
    ["Примеры", label("examples_level", selected.examples_level)],
    ["Терминология", label("terminology_level", selected.terminology_level)],
  ] as const;
  const sourceLabel =
    DECISION_SOURCE_LABELS[metadata.decisionSource] ?? "техническая настройка";
  const headline = decisionHeadline(metadata);
  const chipLabel = decisionChipLabel(metadata, sourceLabel);

  return (
    <V2Card className={className} tone="soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="v2-eyebrow">Персонализация</p>
          <h3 className="v2-title-sm mt-2">{headline}</h3>
        </div>
        <p className="v2-chip">{chipLabel}</p>
      </div>

      <div className="v2-factor-grid mt-5">
        {factors.map(([name, value]) => (
          <div key={name} className="v2-factor">
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {metadata.warnings.length > 0 ? (
        <p className="v2-copy-sm mt-4 rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-2 text-amber-900">
          {metadata.warnings.slice(0, 2).join(" ")}
        </p>
      ) : null}

      <details className="v2-details mt-4">
        <summary>Технические детали</summary>
        <div className="mt-3 grid gap-2 text-sm">
          <p>Источник решения: {metadata.decisionSource}</p>
          <p>Backend: {metadata.backendKind ?? "не указан"}</p>
          <p>Fallback: {metadata.fallbackUsed ? "использован" : "нет"}</p>
          <p>
            Кандидатов:{" "}
            {metadata.candidateCount == null ? "не указано" : metadata.candidateCount}
          </p>
          <p>
            Применено к объяснению:{" "}
            {metadata.appliedToLearnerFacingOutput ? "да" : "нет"}
          </p>
          <p>
            Artifact/model version:{" "}
            {metadata.modelVersion ?? metadata.artifactVersion ?? "не указана"}
          </p>
          <p>
            Инструкций применено:{" "}
            {metadata.appliedPromptInstructionCount ?? "не указано"}
          </p>
          <p>Путь применения: {metadata.appliedPath ?? "не указан"}</p>
        </div>
      </details>
    </V2Card>
  );
}
