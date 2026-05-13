-- CreateTable
CREATE TABLE "EvaluationEpisodeItem" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "contentKind" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "sequenceRole" TEXT NOT NULL,
    "touchpointType" TEXT NOT NULL,
    "signalQuality" TEXT NOT NULL,
    "itemRole" TEXT NOT NULL,
    "itemVariant" TEXT NOT NULL,
    "linkageKind" TEXT NOT NULL,
    "linkedContentId" TEXT,
    "familyKey" TEXT,
    "conceptKey" TEXT,
    "skillKey" TEXT,
    "holdoutStrategy" TEXT NOT NULL,
    "delayedMinutes" INTEGER,
    "policyArm" TEXT NOT NULL,
    "subjectId" TEXT,
    "sectionId" TEXT,
    "topic" TEXT,
    "pedagogicalDecisionJson" JSONB,
    "decisionRuntimeJson" JSONB,
    "outcomeJson" JSONB,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationEpisodeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationEpisodeItem_contentKind_contentId_key" ON "EvaluationEpisodeItem"("contentKind", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationEpisodeItem_episodeId_sequenceIndex_key" ON "EvaluationEpisodeItem"("episodeId", "sequenceIndex");

-- CreateIndex
CREATE INDEX "EvaluationEpisodeItem_episodeId_sequenceRole_idx" ON "EvaluationEpisodeItem"("episodeId", "sequenceRole");

-- CreateIndex
CREATE INDEX "EvaluationEpisodeItem_episodeId_familyKey_idx" ON "EvaluationEpisodeItem"("episodeId", "familyKey");

-- CreateIndex
CREATE INDEX "EvaluationEpisodeItem_episodeId_linkedContentId_idx" ON "EvaluationEpisodeItem"("episodeId", "linkedContentId");

-- AddForeignKey
ALTER TABLE "EvaluationEpisodeItem"
ADD CONSTRAINT "EvaluationEpisodeItem_episodeId_fkey"
FOREIGN KEY ("episodeId") REFERENCES "EvaluationEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
