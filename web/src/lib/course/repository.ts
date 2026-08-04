import { prisma } from "@/lib/prisma";
import type { CourseDetail, CourseObjectDto, CourseSummary } from "./types";

const courseWithUserSelect = {
  id: true,
  mapFileId: true,
  name: true,
  isPublic: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
  _count: { select: { objects: true } },
} as const;

export function serializeCourseSummary(
  course: {
    id: string;
    name: string;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string | null; email: string };
    _count: { objects: number };
  },
): CourseSummary {
  return {
    id: course.id,
    name: course.name,
    isPublic: course.isPublic,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    createdBy: course.createdBy,
    objectCount: course._count.objects,
  };
}

function parseGeometryJson(json: string): CourseObjectDto["geometry"] {
  return JSON.parse(json) as CourseObjectDto["geometry"];
}

export function serializeCourseDetail(
  course: {
    id: string;
    name: string;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string | null; email: string };
    objects: Array<{
      id: string;
      symbolNr: number;
      objectType: string;
      geometryJson: string;
      textContent: string | null;
      sortOrder: number;
    }>;
    _count?: { objects: number };
  },
): CourseDetail {
  const objects: CourseObjectDto[] = course.objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((obj) => ({
      id: obj.id,
      symbolNr: obj.symbolNr,
      objectType: obj.objectType as CourseObjectDto["objectType"],
      geometry: parseGeometryJson(obj.geometryJson),
      textContent: obj.textContent,
      sortOrder: obj.sortOrder,
    }));

  return {
    id: course.id,
    name: course.name,
    isPublic: course.isPublic,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    createdBy: course.createdBy,
    objectCount: course._count?.objects ?? objects.length,
    objects,
  };
}

export async function listCoursesForMap(
  mapFileId: string,
  userId: string,
) {
  return prisma.course.findMany({
    where: {
      mapFileId,
      OR: [{ createdById: userId }, { isPublic: true }],
    },
    select: courseWithUserSelect,
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function getCourseById(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function createCourse(params: {
  mapFileId: string;
  name: string;
  createdById: string;
  isPublic: boolean;
}) {
  return prisma.course.create({
    data: {
      mapFileId: params.mapFileId,
      name: params.name,
      createdById: params.createdById,
      isPublic: params.isPublic,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      objects: true,
      _count: { select: { objects: true } },
    },
  });
}

export async function updateCourse(
  courseId: string,
  data: { name?: string; isPublic?: boolean },
) {
  return prisma.course.update({
    where: { id: courseId },
    data,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function deleteCourse(courseId: string) {
  return prisma.course.delete({ where: { id: courseId } });
}

export async function replaceCourseObjects(
  courseId: string,
  objects: Array<{
    symbolNr: number;
    objectType: string;
    geometryJson: string;
    textContent: string | null;
    sortOrder: number;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.courseObject.deleteMany({ where: { courseId } });
    if (objects.length > 0) {
      await tx.courseObject.createMany({
        data: objects.map((obj) => ({ courseId, ...obj })),
      });
    }
    return tx.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        objects: { orderBy: { sortOrder: "asc" } },
        _count: { select: { objects: true } },
      },
    });
  });
}
