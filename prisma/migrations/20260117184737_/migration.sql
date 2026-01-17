-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "llmModel" TEXT,
ADD COLUMN     "promptTemplateKey" TEXT,
ADD COLUMN     "promptTemplateSnapshot" TEXT;

-- AlterTable
ALTER TABLE "GeneratedTest" ADD COLUMN     "llmModel" TEXT,
ADD COLUMN     "normalizedJson" JSONB,
ADD COLUMN     "promptTemplateKey" TEXT,
ADD COLUMN     "promptTemplateSnapshot" TEXT,
ADD COLUMN     "rawLlmOutput" TEXT,
ADD COLUMN     "validationMetaJson" JSONB;
