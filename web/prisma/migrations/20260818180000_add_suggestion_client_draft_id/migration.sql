-- AlterTable
ALTER TABLE "MapSuggestion" ADD COLUMN "clientDraftId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MapSuggestion_clientDraftId_key" ON "MapSuggestion"("clientDraftId");
