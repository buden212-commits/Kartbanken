-- CreateTable
CREATE TABLE "MapCourseLayerObject" (
    "id" TEXT NOT NULL,
    "mapFileId" TEXT NOT NULL,
    "symbolNr" INTEGER NOT NULL,
    "objectType" TEXT NOT NULL,
    "geometryJson" TEXT NOT NULL,
    "textContent" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapCourseLayerObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapCourseLayerObject_mapFileId_sortOrder_idx" ON "MapCourseLayerObject"("mapFileId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MapCourseLayerObject" ADD CONSTRAINT "MapCourseLayerObject_mapFileId_fkey" FOREIGN KEY ("mapFileId") REFERENCES "MapFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
