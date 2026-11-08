-- AlterTable
ALTER TABLE "MapVersion" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'UPLOAD';

-- Backfill server-built versions (they keep OCAD object indices stable)
UPDATE "MapVersion" SET "source" = 'INTEGRATION'
WHERE "id" IN (
  SELECT "integratedVersionId" FROM "MapCheckout"
  WHERE "integratedVersionId" IS NOT NULL AND "mode" = 'OCAD_DESKTOP'
);

UPDATE "MapVersion" SET "source" = 'FIELD_EDIT'
WHERE "originalFilename" LIKE 'faltredigering-%';

UPDATE "MapVersion" SET "source" = 'DUPLICATE_CLEANUP'
WHERE "originalFilename" LIKE '%-utan-dubbletter.ocd';
