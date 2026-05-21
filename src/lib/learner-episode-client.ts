import type {
  LearnerAttemptEvidenceContract,
  LearningExclusionReasonCode,
} from "@/lib/learning-evidence-contract";
import type { MlPersonalizationView } from "@/lib/ml-personalization-view";

export type LearnerEpisodeSequenceRole =
  | "precheck"
  | "learning_content"
  | "postcheck"
  | "holdout"
  | "delayed_recheck";

export type LearnerEpisodeStatus =
  | "ready"
  | "awaiting_test_submission"
  | "acknowledge_learning_content"
  | "pending_materialization"
  | "waiting_delay"
  | "completed";

export type LearnerEpisodeQuestion = {
  prompt: string;
  options: string[];
  explanation?: string;
};

export type LearnerEpisodeTestStep = {
  id: string;
  title: string;
  questions: LearnerEpisodeQuestion[];
};

export type LearnerEpisodeLearningContent = {
  sessionId: string;
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    body: string;
  }>;
  reflectionPrompt: string;
  renderedContent: string;
  generationSource: "llm" | "llm_repaired" | "fallback";
  dialogueThread: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAtIso: string;
    mlPersonalization?: MlPersonalizationView | null;
  }>;
  dialogueBudget: {
    maxLearnerTurns: number;
    learnerTurnsUsed: number;
    learnerTurnsRemaining: number;
    reachedLimit: boolean;
  };
  pedagogicalContext: {
    difficulty: string | null;
    depth: string | null;
    supportLevel?: string | null;
    presentationFormat?: string | null;
    examplesLevel?: string | null;
    terminologyLevel?: string | null;
    tone: string | null;
    explanationStyle: string | null;
    policyMode: string | null;
    policyId: string | null;
    personalizationMode: "on" | "off";
  };
  mlPersonalization?: MlPersonalizationView | null;
};

export type LearnerEpisodeStep =
  | {
      status: "ready" | "awaiting_test_submission" | "acknowledge_learning_content";
      sequenceRole: LearnerEpisodeSequenceRole;
      contentKind: "generated_test";
      contentId: string;
      itemId: string | null;
      test: LearnerEpisodeTestStep;
      learningContent: null;
      dueAtIso: null;
    }
  | {
      status: "ready" | "acknowledge_learning_content";
      sequenceRole: LearnerEpisodeSequenceRole;
      contentKind: "chat_session";
      contentId: string;
      itemId: string | null;
      test: null;
      learningContent: LearnerEpisodeLearningContent;
      dueAtIso: null;
    }
  | {
      status: "waiting_delay";
      sequenceRole: "delayed_recheck";
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: string;
    }
  | {
      status: "pending_materialization";
      sequenceRole: LearnerEpisodeSequenceRole;
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: null;
    }
  | {
      status: "completed";
      sequenceRole: null;
      contentKind: null;
      contentId: null;
      itemId: null;
      test: null;
      learningContent: null;
      dueAtIso: null;
    };

export type LearnerEpisodePrimaryOutcome = {
  sequenceRole: LearnerEpisodeSequenceRole;
  contentId: string;
  accuracy: number | null;
  questionCount: number | null;
  totalDurationMs: number | null;
  submittedAtIso: string | null;
  learningEligible: boolean | null;
  learningSkipReason?: LearningExclusionReasonCode | null;
  adaptiveStateUpdated?: boolean | null;
};

export type LearnerEpisodeSummary = {
  episodeId: string;
  status: string;
  arm: string;
  topic: string | null;
  subjectId: string | null;
  sectionId: string | null;
  conceptKey: string | null;
  skillKey: string | null;
  counts: {
    totalItems: number;
    testItems: number;
    chatItems: number;
    trainingItems: number;
    evaluationItems: number;
    supportingItems: number;
    completedTestOutcomes: number;
  };
  sequence: {
    expected: LearnerEpisodeSequenceRole[];
    observed: LearnerEpisodeSequenceRole[];
    completed: LearnerEpisodeSequenceRole[];
    missing: LearnerEpisodeSequenceRole[];
  };
  timing: {
    episodeCreatedAtIso: string;
    firstDeliveredAtIso: string | null;
    lastDeliveredAtIso: string | null;
    lastOutcomeAtIso: string | null;
    maxDelayedMinutes: number | null;
  };
  primaryOutcomes: LearnerEpisodePrimaryOutcome[];
};

export type LearnerEpisodeState = {
  episode: LearnerEpisodeSummary;
  currentStep: LearnerEpisodeStep;
};

export type LearnerEpisodeCreateInput = {
  subjectId: string;
  sectionId?: string | null;
  topic: string;
  clientKey?: string;
  questionCount?: number;
  mode?: "practice" | "quiz" | "exam";
  personalizationMode?: "on" | "off";
  assignmentArm?: "baseline" | "self_report" | "predicted" | "manual_override";
  includeHoldout?: boolean;
  expectedSequenceRoles?: LearnerEpisodeSequenceRole[];
};

export type LearnerEpisodeSubmitInput = {
  answers: number[];
  totalDurationMs: number;
  perQuestionFirstAnswerMs?: Array<number | null>;
  answerChangeCount?: number;
};

export type LearnerEpisodeSubmitResult = {
  score: number;
  byTag: Record<string, Record<string, { accuracy: number }>>;
  meta?: {
    predictionVsActual?: {
      expectedAccuracy: number | null;
      actualAccuracy: number;
      expectedTotalDurationMs: number | null;
      actualTotalDurationMs: number | null;
    };
    nextDifficultySuggestion?: {
      value: string | null;
      reason: string;
    };
    evidence?: LearnerAttemptEvidenceContract;
    dataQuality?: {
      excludedFromLearning: boolean;
      reasonCode: string | null;
      reasonLabel: string | null;
    };
  } | null;
  alreadySubmitted?: boolean;
};

type ApiFetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

type ApiErrorPayload = {
  error?: string | { code?: string; message?: string } | null;
  code?: string | null;
  message?: string | null;
  details?: unknown;
};

export class LearnerEpisodeClientError extends Error {
  status: number;
  code: string | null;
  details: unknown;

  constructor(message: string, status: number, code: string | null, details: unknown) {
    super(message);
    this.name = "LearnerEpisodeClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ACTIVE_LEARNER_EPISODE_STORAGE_KEY =
  "eduai.learn.activeEpisodeId";
export const PENDING_LEARNER_EPISODE_START_STORAGE_KEY =
  "eduai.learn.pendingStart";

type PendingLearnerEpisodeStart = {
  key: string;
  fingerprint: string;
};

async function parseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function requestJson<T>(
  fetcher: ApiFetcher,
  input: RequestInfo,
  init?: RequestInit,
) {
  const response = await fetcher(input, init);
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | T | null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    const errorCode =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : typeof errorPayload?.error === "object" && errorPayload.error
          ? (errorPayload.error.code ?? null)
          : (errorPayload?.code ?? null);
    const message =
      typeof errorPayload?.message === "string"
        ? errorPayload.message
        : typeof errorPayload?.error === "object" && errorPayload.error
          ? (errorPayload.error.message ?? "Request failed.")
          : "Request failed.";
    throw new LearnerEpisodeClientError(
      message,
      response.status,
      errorCode,
      errorPayload?.details ?? errorPayload,
    );
  }

  return payload as T;
}

export async function startLearnerEpisode(
  fetcher: ApiFetcher,
  payload: LearnerEpisodeCreateInput,
) {
  return requestJson<LearnerEpisodeState>(fetcher, "/api/evaluation/episodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function loadLearnerEpisode(
  fetcher: ApiFetcher,
  episodeId: string,
) {
  return requestJson<LearnerEpisodeState>(
    fetcher,
    `/api/evaluation/episodes/${episodeId}`,
    { method: "GET" },
  );
}

export async function advanceLearnerEpisode(
  fetcher: ApiFetcher,
  episodeId: string,
  acknowledgeLearningContent = false,
) {
  return requestJson<LearnerEpisodeState>(
    fetcher,
    `/api/evaluation/episodes/${episodeId}/next`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeLearningContent }),
    },
  );
}

export async function submitLearnerEpisodeTest(
  fetcher: ApiFetcher,
  testId: string,
  payload: LearnerEpisodeSubmitInput,
) {
  return requestJson<LearnerEpisodeSubmitResult>(
    fetcher,
    `/api/tests/${testId}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function sendLearnerEpisodeDialogueTurn(
  fetcher: ApiFetcher,
  episodeId: string,
  message: string,
) {
  return requestJson<LearnerEpisodeState>(
    fetcher,
    `/api/evaluation/episodes/${episodeId}/dialogue`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
}

export function readStoredActiveLearnerEpisodeId() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_LEARNER_EPISODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredActiveLearnerEpisodeId(episodeId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_LEARNER_EPISODE_STORAGE_KEY, episodeId);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredActiveLearnerEpisodeId() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_LEARNER_EPISODE_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

function createClientKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `episode_start_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPendingStartFingerprint(params: {
  subjectId: string;
  sectionId?: string | null;
  topic: string;
  mode: "practice" | "quiz" | "exam";
  personalizationMode: "on" | "off";
  includeHoldout: boolean;
  expectedSequenceRoles?: LearnerEpisodeSequenceRole[];
}) {
  return JSON.stringify({
    subjectId: params.subjectId,
    sectionId: params.sectionId ?? null,
    topic: params.topic.trim().toLowerCase(),
    mode: params.mode,
    personalizationMode: params.personalizationMode,
    includeHoldout: params.includeHoldout,
    expectedSequenceRoles: params.expectedSequenceRoles ?? null,
  });
}

export function reservePendingLearnerEpisodeStartKey(fingerprint: string) {
  if (typeof window === "undefined") {
    return createClientKey();
  }

  try {
    const raw = localStorage.getItem(PENDING_LEARNER_EPISODE_START_STORAGE_KEY);
    if (raw) {
      const existing = JSON.parse(raw) as PendingLearnerEpisodeStart;
      if (existing.key && existing.fingerprint === fingerprint) {
        return existing.key;
      }
    }
  } catch {
    // ignore storage parse errors
  }

  const next: PendingLearnerEpisodeStart = {
    key: createClientKey(),
    fingerprint,
  };

  try {
    localStorage.setItem(
      PENDING_LEARNER_EPISODE_START_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // ignore storage errors
  }

  return next.key;
}

export function clearPendingLearnerEpisodeStartKey() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_LEARNER_EPISODE_START_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function formatEpisodeRoleLabel(role: LearnerEpisodeSequenceRole | null) {
  if (role === "precheck") return "Precheck";
  if (role === "learning_content") return "Learning content";
  if (role === "postcheck") return "Postcheck";
  if (role === "holdout") return "Holdout";
  return "Delayed recheck";
}

export function formatEpisodeStatusLabel(status: LearnerEpisodeStatus) {
  if (status === "awaiting_test_submission") return "Answer and submit";
  if (status === "acknowledge_learning_content") return "Read and continue";
  if (status === "pending_materialization") return "Ready to continue";
  if (status === "waiting_delay") return "Waiting for later recheck";
  if (status === "completed") return "Episode completed";
  return "Ready";
}

export async function parseLearnerEpisodeResponse(response: Response) {
  return parseJson<LearnerEpisodeState>(response);
}
