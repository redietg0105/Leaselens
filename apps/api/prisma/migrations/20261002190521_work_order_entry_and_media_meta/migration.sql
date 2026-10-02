-- CreateEnum
CREATE TYPE "EntryPermission" AS ENUM ('YES', 'NO', 'CALL_FIRST');

-- AlterTable
ALTER TABLE "work_order_media" ADD COLUMN     "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
ADD COLUMN     "sizeBytes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "accessNotes" TEXT,
ADD COLUMN     "entryPermission" "EntryPermission" NOT NULL DEFAULT 'CALL_FIRST';

-- CreateIndex
CREATE INDEX "work_orders_createdById_createdAt_idx" ON "work_orders"("createdById", "createdAt");
