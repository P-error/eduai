-- CreateTable
CREATE TABLE "EvaluationEpisode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "sectionId" TEXT,
    "objectiveKey" TEXT NOT NULL,
    "protocolKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "policyArm" TEXT NOT NULL,
    "primarySignalKind" TEXT NOT NULL,
    "topic" TEXT,
    "conceptKey" TEXT,
    "skillKey" TEXT,
    "assignmentJson" JSONB NOT NULL,
    "designJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationEpisode_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "GeneratedTest"
ADD COLUMN "evaluationEpisodeId" TEXT;

-- AlterTable
ALTER TABLE "ChatSession"
ADD COLUMN "evaluationEpisodeId" TEXT;

-- CreateIndex
CREATE INDEX "EvaluationEpisode_userId_createdAt_idx" ON "EvaluationEpisode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationEpisode_subjectId_createdAt_idx" ON "EvaluationEpisode"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationEpisode_userId_policyArm_createdAt_idx" ON "EvaluationEpisode"("userId", "policyArm", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedTest_evaluationEpisodeId_idx" ON "GeneratedTest"("evaluationEpisodeId");

-- CreateIndex
CREATE INDEX "ChatSession_evaluationEpisodeId_idx" ON "ChatSession"("evaluationEpisodeId");

-- AddForeignKey
ALTER TABLE "EvaluationEpisode"
ADD CONSTRAINT "EvaluationEpisode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationEpisode"
ADD CONSTRAINT "EvaluationEpisode_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationEpisode"
ADD CONSTRAINT "EvaluationEpisode_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "SubjectSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedTest"
ADD CONSTRAINT "GeneratedTest_evaluationEpisodeId_fkey"
FOREIGN KEY ("evaluationEpisodeId") REFERENCES "EvaluationEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession"
ADD CONSTRAINT "ChatSession_evaluationEpisodeId_fkey"
FOREIGN KEY ("evaluationEpisodeId") REFERENCES "EvaluationEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
