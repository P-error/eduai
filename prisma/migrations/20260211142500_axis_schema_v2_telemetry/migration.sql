-- AxisSchema v2 telemetry fields for attempt-level UX metrics
ALTER TABLE "TestAttempt"
ADD COLUMN "totalDurationMs" INTEGER,
ADD COLUMN "perQuestionFirstAnswerMsJson" JSONB,
ADD COLUMN "answerChangeCount" INTEGER DEFAULT 0;
