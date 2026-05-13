ALTER TABLE "EvaluationEpisode"
ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "EvaluationEpisode_clientKey_key"
ON "EvaluationEpisode"("clientKey");

CREATE UNIQUE INDEX "EvaluationEpisodeItem_episodeId_sequenceRole_key"
ON "EvaluationEpisodeItem"("episodeId", "sequenceRole");
