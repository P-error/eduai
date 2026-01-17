-- AlterTable
ALTER TABLE "GeneratedTest" ADD COLUMN     "recommendationSnapshot" JSONB,
ADD COLUMN     "recommended" BOOLEAN NOT NULL DEFAULT false;
