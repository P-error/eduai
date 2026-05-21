import type { MlPersonalizationView } from "@/lib/ml-personalization-view";

type MlPersonalizationCardProps = {
  metadata?: MlPersonalizationView | null;
  className?: string;
  compact?: boolean;
  forceVisible?: boolean;
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
  heuristic_baseline: "эвристическая персонализация",
  static_fallback: "безопасный fallback",
  fallback: "безопасный fallback",
  shadow_only: "shadow-наблюдение",
  legacy_derived: "устаревшая совместимость",
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

function decisionHeadline(metadata: MlPersonalizationView) {
  if (
    metadata.decisionSource === "shadow_only" ||
    !metadata.appliedToLearnerFacingOutput
  ) {
    return "Shadow-наблюдение, не применено к ответу";
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
    return "Эвристическая персонализация выбрала";
  }
  if (metadata.decisionSource === "ml_policy") {
    return "ML-модель выбрала";
  }
  return "Источник персонализации не распознан";
}

export default function MlPersonalizationCard({
  metadata,
  className = "",
  compact = false,
  forceVisible = false,
}: MlPersonalizationCardProps) {
  if (!metadata) return null;
  const debugVisible = isMlPersonalizationVisible();
  const learnerPrimaryVisible =
    forceVisible &&
    metadata.isPrimary &&
    metadata.appliedToLearnerFacingOutput;
  if (!debugVisible && !learnerPrimaryVisible) return null;

  const selected = metadata.selected_config;
  const headline = decisionHeadline(metadata);
  const summary = [
    `${label(difficultyLabels, selected.difficulty)} сложность`,
    `${label(depthLabels, selected.depth)} глубина`,
    `${label(supportLabels, selected.support_level)} поддержка`,
    label(formatLabels, selected.presentation_format),
    label(examplesLabels, selected.examples_level),
    `${label(terminologyLabels, selected.terminology_level)} терминология`,
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
    ["Fallback", metadata.fallbackUsed ? "использован" : "нет"],
    ["Backend", metadata.backendKind ?? "не указан"],
    [
      "Artifact/model version",
      metadata.modelVersion ?? metadata.artifactVersion ?? "не указана",
    ],
    [
      "Кандидатов",
      metadata.candidateCount == null ? "не указано" : String(metadata.candidateCount),
    ],
  ];

  if (compact || !debugVisible) {
    return (
      <section
        className={`rounded-2xl border border-violet-700/45 bg-violet-950/15 px-4 py-3 text-sm text-violet-50 ${className}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-violet-200">
              Six-factor personalization
            </p>
            <p className="mt-1 font-medium">{headline}</p>
          </div>
          <p className="max-w-xl text-left text-xs leading-5 text-violet-100/90">
            {summary}
          </p>
        </div>
        {metadata.fallbackUsed ||
        metadata.decisionSource === "heuristic_baseline" ||
        metadata.decisionSource === "legacy_derived" ? (
          <p className="mt-2 text-xs leading-5 text-violet-100/75">
            Источник подписан явно: fallback/эвристика не являются ML-доказательством.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <details
      className={`rounded-2xl border border-violet-700/50 bg-violet-950/20 px-4 py-3 text-sm text-violet-50 ${className}`}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-violet-200">
              Источник персонализации
            </p>
            <p className="mt-1 font-medium">{headline}</p>
          </div>
          <p className="max-w-xl text-left text-xs leading-5 text-violet-100/90">
            {headline}: {summary}
          </p>
        </div>
      </summary>

      <div className="mt-4 grid gap-4">
        <div>
          <p className="text-sm text-violet-100">
            Текущий режим объяснения: {summary}.
          </p>
          <p className="mt-2 text-xs leading-5 text-violet-100/80">
            Источник: {headline}. Это не постоянные настройки профиля.
            Источник решения и fallback показаны явно, чтобы эвристика не
            выглядела как ML.
          </p>
        </div>

        {metadata.warnings.length > 0 ? (
          <div className="rounded-xl border border-amber-300/40 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-100">
            {metadata.warnings.slice(0, 2).join(" ")}
          </div>
        ) : null}

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
          {(metadata.modelVersion ?? metadata.artifactVersion) ? (
            <span className="rounded-full border border-violet-700/40 px-2 py-1">
              Версия: {metadata.modelVersion ?? metadata.artifactVersion}
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
