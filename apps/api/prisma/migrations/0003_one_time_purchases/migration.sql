-- Conversion packs and 24-hour passes; Paddle as a billing provider
ALTER TABLE "User" ADD COLUMN "paddleCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "passUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_paddleCustomerId_key" ON "User"("paddleCustomerId");

-- What paid for each conversion (existing rows were all free-allowance or plan)
ALTER TABLE "Conversion" ADD COLUMN "chargedAs" TEXT NOT NULL DEFAULT 'free';

CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "passUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Purchase_providerTransactionId_key" ON "Purchase"("providerTransactionId");
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
