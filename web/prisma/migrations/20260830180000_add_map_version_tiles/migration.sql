-- AlterTable
ALTER TABLE "MapVersion" ADD COLUMN "tileStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "MapVersion" ADD COLUMN "tileError" TEXT;
ALTER TABLE "MapVersion" ADD COLUMN "tileManifestPath" TEXT;
