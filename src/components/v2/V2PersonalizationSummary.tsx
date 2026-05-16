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
  ml_policy: "персонализированная настройка",
  heuristic_baseline: "обычный режим",
  static_fallback: "стандартный режим",
  fallback: "стандартный режим",
  shadow_only: "режим наблюдения",
};

function humanize(value: string | null | undefined) {
  if (!value) return "не задано";
  return value.replaceAll("_", " ");
}

function label(axis: keyof typeof VALUE_LABELS, value: string | null | undefined) {
  if (!value) return "не задано";
  return VALUE_LABELS[axis]?.[value] ?? humanize(value);
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

  return (
    <V2Card className={className} tone="soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="v2-eyebrow">Персонализация</p>
          <h3 className="v2-title-sm mt-2">EduAI выбрал способ подачи</h3>
        </div>
        <p className="v2-chip">
          {metadata.fallbackUsed ? "Стандартная подача" : sourceLabel}
        </p>
      </div>

      <div className="v2-factor-grid mt-5">
        {factors.map(([name, value]) => (
          <div key={name} className="v2-factor">
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <details className="v2-details mt-4">
        <summary>Технические детали</summary>
        <div className="mt-3 grid gap-2 text-sm">
          <p>Источник решения: {metadata.decisionSource}</p>
          <p>
            Применено к объяснению:{" "}
            {metadata.appliedToLearnerFacingOutput ? "да" : "нет"}
          </p>
          <p>
            Техническая версия: {metadata.artifactVersion ?? "не указана"}
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
