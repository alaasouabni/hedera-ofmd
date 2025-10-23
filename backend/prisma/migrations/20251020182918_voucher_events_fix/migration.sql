/*
  Warnings:

  - You are about to drop the column `blockTs` on the `VoucherIssue` table. All the data in the column will be lost.
  - You are about to drop the column `blockTs` on the `VoucherRedeem` table. All the data in the column will be lost.
  - You are about to drop the column `blockTs` on the `VoucherSpend` table. All the data in the column will be lost.
  - Added the required column `timestamp` to the `VoucherIssue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timestamp` to the `VoucherRedeem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timestamp` to the `VoucherSpend` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "VoucherIssue" DROP COLUMN "blockTs",
ADD COLUMN     "timestamp" INTEGER NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "VoucherRedeem" DROP COLUMN "blockTs",
ADD COLUMN     "timestamp" INTEGER NOT NULL,
ALTER COLUMN "fee" SET DATA TYPE TEXT,
ALTER COLUMN "gross" SET DATA TYPE TEXT,
ALTER COLUMN "net" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "VoucherSpend" DROP COLUMN "blockTs",
ADD COLUMN     "timestamp" INTEGER NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "VoucherIssue_blockNumber_idx" ON "VoucherIssue"("blockNumber");

-- CreateIndex
CREATE INDEX "VoucherRedeem_blockNumber_idx" ON "VoucherRedeem"("blockNumber");

-- CreateIndex
CREATE INDEX "VoucherSpend_blockNumber_idx" ON "VoucherSpend"("blockNumber");
