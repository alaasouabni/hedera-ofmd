/*
  Warnings:

  - You are about to drop the column `block` on the `VoucherIssue` table. All the data in the column will be lost.
  - You are about to drop the column `ts` on the `VoucherIssue` table. All the data in the column will be lost.
  - You are about to drop the column `block` on the `VoucherRedeem` table. All the data in the column will be lost.
  - You are about to drop the column `ts` on the `VoucherRedeem` table. All the data in the column will be lost.
  - You are about to drop the column `block` on the `VoucherSpend` table. All the data in the column will be lost.
  - You are about to drop the column `ts` on the `VoucherSpend` table. All the data in the column will be lost.
  - Added the required column `blockNumber` to the `VoucherIssue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blockTs` to the `VoucherIssue` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `amount` on the `VoucherIssue` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `blockNumber` to the `VoucherRedeem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blockTs` to the `VoucherRedeem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fee` to the `VoucherRedeem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gross` to the `VoucherRedeem` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `net` on the `VoucherRedeem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `blockNumber` to the `VoucherSpend` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blockTs` to the `VoucherSpend` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `amount` on the `VoucherSpend` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "VoucherIssue" DROP COLUMN "block",
DROP COLUMN "ts",
ADD COLUMN     "blockNumber" BIGINT NOT NULL,
ADD COLUMN     "blockTs" INTEGER NOT NULL,
ALTER COLUMN "txHash" SET DATA TYPE TEXT,
ALTER COLUMN "sponsor" SET DATA TYPE TEXT,
ALTER COLUMN "merchant" SET DATA TYPE TEXT,
DROP COLUMN "amount",
ADD COLUMN     "amount" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "VoucherRedeem" DROP COLUMN "block",
DROP COLUMN "ts",
ADD COLUMN     "blockNumber" BIGINT NOT NULL,
ADD COLUMN     "blockTs" INTEGER NOT NULL,
ADD COLUMN     "fee" BIGINT NOT NULL,
ADD COLUMN     "gross" BIGINT NOT NULL,
ALTER COLUMN "txHash" SET DATA TYPE TEXT,
ALTER COLUMN "supplier" SET DATA TYPE TEXT,
DROP COLUMN "net",
ADD COLUMN     "net" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "VoucherSpend" DROP COLUMN "block",
DROP COLUMN "ts",
ADD COLUMN     "blockNumber" BIGINT NOT NULL,
ADD COLUMN     "blockTs" INTEGER NOT NULL,
ALTER COLUMN "txHash" SET DATA TYPE TEXT,
ALTER COLUMN "merchant" SET DATA TYPE TEXT,
ALTER COLUMN "supplier" SET DATA TYPE TEXT,
DROP COLUMN "amount",
ADD COLUMN     "amount" BIGINT NOT NULL;
