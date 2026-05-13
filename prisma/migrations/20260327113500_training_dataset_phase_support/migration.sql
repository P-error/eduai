-- Add explicit training-data phase/origin markers to evaluation episodes.
ALTER TABLE "EvaluationEpisode"
ADD COLUMN "datasetPhase" TEXT NOT NULL DEFAULT 'real',
ADD COLUMN "datasetOrigin" TEXT NOT NULL DEFAULT 'runtime_user';

CREATE INDEX "EvaluationEpisode_datasetPhase_createdAt_idx"
ON "EvaluationEpisode"("datasetPhase", "createdAt");
