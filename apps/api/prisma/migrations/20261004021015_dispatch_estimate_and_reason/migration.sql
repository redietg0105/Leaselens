-- AlterTable
ALTER TABLE "dispatches" ADD COLUMN     "estimatedCostUsd" DECIMAL(10,2),
ADD COLUMN     "matchReason" TEXT;
