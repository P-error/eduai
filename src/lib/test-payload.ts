export type StoredQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
};
export type PublicQuestion = Omit<StoredQuestion, "answerIndex">;

export function sanitizeQuestionForClient(question: StoredQuestion): PublicQuestion {
  const { answerIndex, ...safeQuestion } = question;
  void answerIndex;
  return safeQuestion;
}

export function sanitizeQuestionsForClient(
  questions: StoredQuestion[],
): PublicQuestion[] {
  return questions.map(sanitizeQuestionForClient);
}

function payloadContainsAnswerIndex(payload: unknown): boolean {
  const stack: unknown[] = [payload];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (key === "answerIndex") {
        return true;
      }
      stack.push(value);
    }
  }

  return false;
}

export function assertNoAnswerIndexLeak(payload: unknown, context: string) {
  if (payloadContainsAnswerIndex(payload)) {
    throw new Error(`answerIndex leak detected in ${context}`);
  }
}
