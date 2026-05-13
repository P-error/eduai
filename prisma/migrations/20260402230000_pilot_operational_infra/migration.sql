-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "researchConsentWithdrawnAt" TIMESTAMP(3),
  ADD COLUMN "trainingDataExclusionAt" TIMESTAMP(3),
  ADD COLUMN "trainingDataExclusionReason" TEXT;

-- CreateTable
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "routeClass" TEXT NOT NULL,
  "bucketKind" TEXT NOT NULL,
  "limit" INTEGER NOT NULL,
  "windowMs" INTEGER NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OperatorAuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "result" TEXT NOT NULL,
  "ipAddress" TEXT,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_routeClass_resetAt_idx" ON "RateLimitBucket"("routeClass", "resetAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_actorUserId_createdAt_idx" ON "OperatorAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_action_createdAt_idx" ON "OperatorAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_createdAt_idx" ON "OperatorAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "OperatorAuditEvent"
  ADD CONSTRAINT "OperatorAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
