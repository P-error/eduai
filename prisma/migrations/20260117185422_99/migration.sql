-- AlterTable
ALTER TABLE "GeneratedTest" ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "sectionSnapshot" TEXT;

-- CreateTable
CREATE TABLE "SubjectSection" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectSection_subjectId_idx" ON "SubjectSection"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectSection_parentId_idx" ON "SubjectSection"("parentId");

-- CreateIndex
CREATE INDEX "SubjectSection_subjectId_sortOrder_idx" ON "SubjectSection"("subjectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "SubjectSection" ADD CONSTRAINT "SubjectSection_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectSection" ADD CONSTRAINT "SubjectSection_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SubjectSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedTest" ADD CONSTRAINT "GeneratedTest_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SubjectSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
