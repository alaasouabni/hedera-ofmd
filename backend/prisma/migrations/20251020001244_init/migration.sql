-- CreateTable
CREATE TABLE "IndexState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastScanned" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" VARCHAR(42) NOT NULL,
    "owner" VARCHAR(42) NOT NULL,
    "original" VARCHAR(42) NOT NULL,
    "collateral" VARCHAR(42) NOT NULL,
    "openedBlock" BIGINT NOT NULL,
    "openedTx" VARCHAR(66) NOT NULL,
    "openedTs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "minted" DECIMAL(78,0) NOT NULL,
    "price" DECIMAL(78,0) NOT NULL,
    "reservePPM" INTEGER NOT NULL,
    "riskPPM" INTEGER NOT NULL,
    "minColl" DECIMAL(78,0) NOT NULL,
    "limit" DECIMAL(78,0) NOT NULL,
    "start" INTEGER NOT NULL,
    "cooldown" INTEGER NOT NULL,
    "expiration" INTEGER NOT NULL,
    "challenged" DECIMAL(78,0) NOT NULL,
    "challengePeriod" INTEGER NOT NULL,
    "ofdAddr" VARCHAR(42) NOT NULL,
    "collBal" DECIMAL(78,0) NOT NULL,
    "collDecimals" INTEGER NOT NULL,
    "collSymbol" TEXT NOT NULL,
    "priceDecimals" INTEGER NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "number" INTEGER NOT NULL,
    "positionId" TEXT NOT NULL,
    "challenger" VARCHAR(42) NOT NULL,
    "start" INTEGER NOT NULL,
    "size" DECIMAL(78,0) NOT NULL,
    "currentPrice" DECIMAL(78,0) NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("number","positionId")
);

-- CreateIndex
CREATE INDEX "Challenge_positionId_idx" ON "Challenge"("positionId");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
