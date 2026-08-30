-- AlterTable
ALTER TABLE "MapVersion" ADD COLUMN "tileBuildTotal" INTEGER;
ALTER TABLE "MapVersion" ADD COLUMN "tileBuildDone" INTEGER;
ALTER TABLE "MapVersion" ADD COLUMN "tileBuildCurrentZ" INTEGER;
ALTER TABLE "MapVersion" ADD COLUMN "tileBuildMaxZPregen" INTEGER;
