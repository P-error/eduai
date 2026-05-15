import type { MlPersonalizationView } from "@/lib/ml-personalization-view";

type MlPersonalizationCardProps = {
  metadata?: MlPersonalizationView | null;
  className?: string;
};

const difficultyLabels = {
  easy: "лёгкая",
  medium: "средняя",
  hard: "высокая",
} as const;

const depthLabels = {
  brief: "краткая",
  standard: "стандартная",
  detailed: "подробная",
} as const;

const supportLabels = {
  minimal: "минимальная",
  guided: "направляемая",
  scaffolded: "пошаговая поддержка",
} as const;

const formatLabels = {
  paragraph: "связный текст",
  structured_list: "структурированный список",
  step_by_step: "пошагово",
  qa: "вопрос–ответ",
} as const;

const examplesLabels = {
  none: "без примеров",
  single: "один пример",
  multiple: "несколько примеров",
} as const;

const terminologyLabels = {
  simple: "простая",
  balanced: "сбалансированная",
  technical: "техническая",
} as const;

const decisionSourceLabels: Record<string, string> = {
  ml_policy: "ML-модель",
  heuristic_baseline: "базовая эвристика",
  static_fallback: "fallback",
  fallback: "fallback",
  shadow_only: "shadow-наблюдение",
};

function isMlPersonalizationVisible() {
  return process.env.NEXT_PUBLIC_SHOW_ML_PERSONALIZATION === "1";
}

function label<T extends string>(
  labels: Record<T, string>,
  value: T,
) {
  return labels[value] ?? value;
}

export default function MlPersonalizationCard({
  metadata,
  className = "",
}: MlPersonalizationCardProps) {
  if (!isMlPersonalizationVisible() || !metadata) return null;

  const selected = metadata.selected_config;
  const summary = [
    `${label(difficultyLabels, selected.difficulty)} сложность`,
    `${label(depthLabels, selected.depth)} глубина`,
    label(formatLabels, selected.presentation_format),
  ].join(" · ");
  const fields = [
    ["Сложность", label(difficultyLabels, selected.difficulty)],
    ["Глубина", label(depthLabels, selected.depth)],
    ["Поддержка", label(supportLabels, selected.support_level)],
    ["Формат", label(formatLabels, selected.presentation_format)],
    ["Примеры", label(examplesLabels, selected.examples_level)],
    ["Терминология", label(terminologyLabels, selected.terminology_level)],
    [
      "Источник решения",
      decisionSourceLabels[metadata.decisionSource] ?? metadata.decisionSource,
    ],
    [
      "Режим применения",
      metadata.appliedToLearnerFacingOutput
        ? "применено к ответу"
        : "только shadow-наблюдение",
    ],
  ];

  return (
    <details
      className={`rounded-2xl border border-violet-700/50 bg-violet-950/20 px-4 py-3 text-sm text-violet-50 ${className}`}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-violet-200">
              ML-персонализация
            </p>
            <p className="mt-1 font-medium">Режим подачи для этого шага</p>
          </div>
          <p className="max-w-xl text-left text-xs leading-5 text-violet-100/90">
            ML выбрала: {summary}
          </p>
        </div>
      </summary>

      <div className="mt-4 grid gap-4">
        <div>
          <p className="text-sm text-violet-100">
            ML-персонализация выбрала режим объяснения для этого шага.
          </p>
          <p className="mt-2 text-xs leading-5 text-violet-100/80">
            Это не постоянные настройки профиля, а адаптация текущего ответа по
            учебной истории и контексту. Если модель недоступна, система
            использует безопасный fallback.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map(([name, value]) => (
            <div
              key={name}
              className="rounded-xl border border-violet-700/40 bg-slate-950/30 px-3 py-2"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-violet-200/80">
                {name}
              </p>
              <p className="mt-1 font-medium text-violet-50">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-violet-100/75">
          {metadata.artifactVersion ? (
            <span className="rounded-full border border-violet-700/40 px-2 py-1">
              Артефакт: {metadata.artifactVersion}
            </span>
          ) : null}
          {metadata.appliedPromptInstructionCount != null ? (
            <span className="rounded-full border border-violet-700/40 px-2 py-1">
              Инструкций: {metadata.appliedPromptInstructionCount}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
