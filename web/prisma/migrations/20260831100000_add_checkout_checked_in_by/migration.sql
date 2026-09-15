-- AlterTable
ALTER TABLE "MapCheckout" ADD COLUMN "checkedInById" TEXT;

-- Backfill: integrated versions should credit checkout owner when check-in user was not recorded
UPDATE "MapVersion" mv
SET "uploadedById" = mc."userId"
FROM "MapCheckout" mc
WHERE mc."integratedVersionId" = mv.id
  AND mc."checkinStoragePath" IS NOT NULL
  AND mc."userId" IS NOT NULL;
