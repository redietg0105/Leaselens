-- AlterTable
ALTER TABLE "triage_results" ADD COLUMN     "followUpQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "subIssue" TEXT;
