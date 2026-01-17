/*
  Warnings:

  - A unique constraint covering the columns `[key,version]` on the table `PromptTemplate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `version` to the `PromptTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PromptTemplate_key_key";

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "promptTemplateVersion" INTEGER;

-- AlterTable
ALTER TABLE "GeneratedTest" ADD COLUMN     "promptTemplateVersion" INTEGER;

-- AlterTable
ALTER TABLE "PromptTemplate" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_version_key" ON "PromptTemplate"("key", "version");
