import { DIFFICULTY_ORDER, EXPECTED_TIME_MS } from "@/lib/tags";
import { getActivePredictionModelParams } from "./prediction-params";

export const BASELINE_QUESTION_COUNT = 5;

export type DifficultyTarget = (typeof DIFFICULTY_ORDER)[number];
export type ResponseFormat = "mcq" | "short" | "multipart";

const RESPONSE_FORMATS: ResponseFormat[] = ["mcq", "short", "multipart"];

export function clampDifficulty(
  difficultyTarget: string | null | undefined,
): DifficultyTarget {
  if (difficultyTarget === "easy" || difficultyTarget === "medium" || difficultyTarget === "hard") {
    return difficultyTarget;
  }
  return "medium";
}

export function clampResponseFormat(
  responseFormat: string | null | undefined,
): ResponseFormat {
  if (responseFormat && RESPONSE_FORMATS.includes(responseFormat as ResponseFormat)) {
    return responseFormat as ResponseFormat;
  }
  return "mcq";
}

export function clampQuestionCount(questionCount: number | null | undefined) {
  if (typeof questionCount !== "number" || !Number.isFinite(questionCount)) return 1;
  return Math.max(1, Math.floor(questionCount));
}

export function expectedTotalDurationBaselineMs(params: {
  difficultyTarget: string | null | undefined;
  responseFormat: string | null | undefined;
  questionCount: number | null | undefined;
}) {
  const difficulty = clampDifficulty(params.difficultyTarget);
  const responseFormat = clampResponseFormat(params.responseFormat);
  const questionCount = clampQuestionCount(params.questionCount);
  const baselineForFiveQuestions = EXPECTED_TIME_MS[difficulty][responseFormat];
  const scaled = baselineForFiveQuestions * (questionCount / BASELINE_QUESTION_COUNT);
  return Math.round(scaled);
}

export function difficultyAccuracyAdjust(
  difficultyTarget: string | null | undefined,
  diffAdjustMag?: number,
) {
  const active = getActivePredictionModelParams();
  const magnitude = diffAdjustMag ?? active.diffAdjustMag;
  const difficulty = clampDifficulty(difficultyTarget);
  if (difficulty === "easy") return magnitude;
  if (difficulty === "hard") return -magnitude;
  return 0;
}
