export type DashboardAttempt = {
  id: string;
  createdAt: string;
  subjectId: string;
  subjectTitle: string;
  topic: string;
  questionCount: number;
  score: number;
  actualAccuracy: number | null;
  actualTotalDurationMs: number | null;
  predictedAccuracy: number | null;
  predictedTotalDurationMs: number | null;
  durationConfidence: number | null;
  durationBasis: string | null;
  policyId: string | null;
  predictorVersion: string | null;
  difficulty: {
    current: string | null;
    next: string | null;
    changed: boolean;
    reason: string | null;
  };
  learningEligible: boolean | null;
};
