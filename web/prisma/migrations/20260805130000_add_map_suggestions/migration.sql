-- CreateTable
CREATE TABLE "MapSuggestion" (
    "id" TEXT NOT NULL,
    "mapFileId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "category" TEXT NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "reviewComment" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "checkoutId" TEXT,
    "integratedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapSuggestionObject" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "geometryJson" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapSuggestionObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapSuggestion_mapFileId_status_idx" ON "MapSuggestion"("mapFileId", "status");

-- CreateIndex
CREATE INDEX "MapSuggestion_mapVersionId_idx" ON "MapSuggestion"("mapVersionId");

-- CreateIndex
CREATE INDEX "MapSuggestion_createdById_idx" ON "MapSuggestion"("createdById");

-- CreateIndex
CREATE INDEX "MapSuggestionObject_suggestionId_sortOrder_idx" ON "MapSuggestionObject"("suggestionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_mapFileId_fkey" FOREIGN KEY ("mapFileId") REFERENCES "MapFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "MapCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestion" ADD CONSTRAINT "MapSuggestion_integratedVersionId_fkey" FOREIGN KEY ("integratedVersionId") REFERENCES "MapVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapSuggestionObject" ADD CONSTRAINT "MapSuggestionObject_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "MapSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
