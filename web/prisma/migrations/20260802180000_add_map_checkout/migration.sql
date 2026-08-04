-- CreateTable
CREATE TABLE "MapCheckout" (
    "id" TEXT NOT NULL,
    "mapFileId" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "selectionType" TEXT NOT NULL,
    "selectionJson" TEXT NOT NULL,
    "exportStoragePath" TEXT,
    "checkinStoragePath" TEXT,
    "diffSummaryJson" TEXT,
    "userConfirmedAt" TIMESTAMP(3),
    "adminConfirmedAt" TIMESTAMP(3),
    "integratedAt" TIMESTAMP(3),
    "integratedVersionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapCheckout_mapFileId_status_idx" ON "MapCheckout"("mapFileId", "status");

-- AddForeignKey
ALTER TABLE "MapCheckout" ADD CONSTRAINT "MapCheckout_mapFileId_fkey" FOREIGN KEY ("mapFileId") REFERENCES "MapFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapCheckout" ADD CONSTRAINT "MapCheckout_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "MapVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapCheckout" ADD CONSTRAINT "MapCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapCheckout" ADD CONSTRAINT "MapCheckout_integratedVersionId_fkey" FOREIGN KEY ("integratedVersionId") REFERENCES "MapVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapCheckout" ADD CONSTRAINT "MapCheckout_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
