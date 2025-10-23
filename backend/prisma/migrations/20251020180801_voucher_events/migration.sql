-- CreateTable
CREATE TABLE "VoucherIssue" (
    "id" SERIAL NOT NULL,
    "block" BIGINT NOT NULL,
    "txHash" VARCHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "ts" INTEGER NOT NULL,
    "sponsor" VARCHAR(42) NOT NULL,
    "merchant" VARCHAR(42) NOT NULL,
    "amount" TEXT NOT NULL,

    CONSTRAINT "VoucherIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherSpend" (
    "id" SERIAL NOT NULL,
    "block" BIGINT NOT NULL,
    "txHash" VARCHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "ts" INTEGER NOT NULL,
    "merchant" VARCHAR(42) NOT NULL,
    "supplier" VARCHAR(42) NOT NULL,
    "amount" TEXT NOT NULL,

    CONSTRAINT "VoucherSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherRedeem" (
    "id" SERIAL NOT NULL,
    "block" BIGINT NOT NULL,
    "txHash" VARCHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "ts" INTEGER NOT NULL,
    "supplier" VARCHAR(42) NOT NULL,
    "net" TEXT NOT NULL,

    CONSTRAINT "VoucherRedeem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherIndexState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastScanned" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "VoucherIndexState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoucherIssue_merchant_idx" ON "VoucherIssue"("merchant");

-- CreateIndex
CREATE INDEX "VoucherIssue_sponsor_idx" ON "VoucherIssue"("sponsor");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherIssue_txHash_logIndex_key" ON "VoucherIssue"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "VoucherSpend_merchant_idx" ON "VoucherSpend"("merchant");

-- CreateIndex
CREATE INDEX "VoucherSpend_supplier_idx" ON "VoucherSpend"("supplier");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherSpend_txHash_logIndex_key" ON "VoucherSpend"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "VoucherRedeem_supplier_idx" ON "VoucherRedeem"("supplier");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedeem_txHash_logIndex_key" ON "VoucherRedeem"("txHash", "logIndex");
