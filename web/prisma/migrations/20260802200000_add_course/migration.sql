-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "mapFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseObject" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "symbolNr" INTEGER NOT NULL,
    "objectType" TEXT NOT NULL,
    "geometryJson" TEXT NOT NULL,
    "textContent" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Course_mapFileId_isPublic_idx" ON "Course"("mapFileId", "isPublic");

-- CreateIndex
CREATE INDEX "CourseObject_courseId_sortOrder_idx" ON "CourseObject"("courseId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_mapFileId_fkey" FOREIGN KEY ("mapFileId") REFERENCES "MapFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseObject" ADD CONSTRAINT "CourseObject_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
