import Link from "next/link";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";
import { v2ButtonClass } from "@/components/v2/V2Button";

type V2StatusPanelProps = {
  attemptsLearningEligible?: number | null;
  attemptsRecorded?: number | null;
  expectedAccuracy?: number | null;
  isDemo?: boolean;
  personalizationReady?: boolean | null;
};

function formatCount(value: number | null | undefined) {
  return value == null ? "-" : String(value);
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "-" : `${(value * 100).toFixed(0)}%`;
}

function StatusRows({
  attemptsLearningEligible,
  attemptsRecorded,
  expectedAccuracy,
  isDemo,
  personalizationReady,
}: V2StatusPanelProps) {
  return (
    <div className="v2-status-rows">
      <div>
        <span>Попытки</span>
        <strong>{isDemo ? "демо" : formatCount(attemptsRecorded)}</strong>
      </div>
      <div>
        <span>Готовность персонализации</span>
        <strong>{personalizationReady ? "готова" : "набирает данные"}</strong>
      </div>
      <div>
        <span>Ожидаемая точность</span>
        <strong>{formatPercent(expectedAccuracy)}</strong>
      </div>
      <div>
        <span>Учтено системой</span>
        <strong>{isDemo ? "пример" : formatCount(attemptsLearningEligible)}</strong>
      </div>
    </div>
  );
}

export default function V2StatusPanel(props: V2StatusPanelProps) {
  return (
    <aside className="v2-card v2-status-panel text-sm">
      <details className="lg:hidden">
        <summary className="v2-status-summary">Статус обучения</summary>
        <div className="mt-4">
          <StatusRows {...props} />
          <Link
            className={v2ButtonClass({ className: "mt-4 w-full", size: "sm", variant: "secondary" })}
            href={DEFAULT_LEARNER_ENTRY_HREF}
          >
            Следующий шаг
          </Link>
        </div>
      </details>

      <div className="hidden lg:block">
        <p className="v2-eyebrow">Статус обучения</p>
        <h2 className="v2-title-sm mt-2">Следующий шаг</h2>
        <p className="v2-copy-sm mt-2">
          Продолжи учебный эпизод или начни новый по выбранной теме.
        </p>
        <div className="mt-4">
          <StatusRows {...props} />
        </div>
        <Link
          className={v2ButtonClass({ className: "mt-4 w-full", size: "sm", variant: "secondary" })}
          href={DEFAULT_LEARNER_ENTRY_HREF}
        >
          Перейти к обучению
        </Link>
      </div>
    </aside>
  );
}
