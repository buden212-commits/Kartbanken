import { prisma } from "@/lib/prisma";
import type { CourseDetail, CourseObjectDto, CourseSummary } from "./types";
import { parseSequenceJson, resolveSequence } from "./sequence";
import {
  isControlLayerSymbol,
  isPersistedObjectId,
  mergeLayerAndCourseObjects,
  serializeLayerObjects,
} from "./control-layer";

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

const courseDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  objects: { orderBy: { sortOrder: "asc" as const } },
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

function serializeCourseObjects(
  objects: Array<{
    id: string;
    symbolNr: number;
    objectType: string;
    geometryJson: string;
    textContent: string | null;
    sortOrder: number;
  }>,
): CourseObjectDto[] {
  return objects
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
}

export async function listLayerObjects(mapFileId: string): Promise<CourseObjectDto[]> {
  const rows = await prisma.mapCourseLayerObject.findMany({
    where: { mapFileId },
    orderBy: { sortOrder: "asc" },
  });
  return serializeLayerObjects(rows);
}

export function serializeCourseDetail(
  course: {
    id: string;
    mapFileId?: string;
    name: string;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string | null; email: string };
    sequenceJson?: string | null;
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
  layerObjects: CourseObjectDto[] = [],
): CourseDetail {
  const courseObjects = serializeCourseObjects(course.objects);
  const objects = mergeLayerAndCourseObjects(layerObjects, courseObjects);

  return {
    id: course.id,
    name: course.name,
    isPublic: course.isPublic,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    createdBy: course.createdBy,
    objectCount: course._count?.objects ?? courseObjects.length,
    objects,
    sequence: resolveSequence(objects, parseSequenceJson(course.sequenceJson)),
  };
}

export async function toCourseDetail(
  course: Parameters<typeof serializeCourseDetail>[0] & { mapFileId: string },
): Promise<CourseDetail> {
  const layer = await listLayerObjects(course.mapFileId);
  return serializeCourseDetail(course, layer);
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
    include: courseDetailInclude,
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
    include: courseDetailInclude,
  });
}

export async function updateCourse(
  courseId: string,
  data: { name?: string; isPublic?: boolean },
) {
  return prisma.course.update({
    where: { id: courseId },
    data,
    include: courseDetailInclude,
  });
}

export async function deleteCourse(courseId: string) {
  return prisma.course.delete({ where: { id: courseId } });
}

type SavedCourseObject = {
  id?: string;
  symbolNr: number;
  objectType: string;
  geometryJson: string;
  textContent: string | null;
  sortOrder: number;
};

export async function replaceCourseObjects(
  courseId: string,
  mapFileId: string,
  objects: SavedCourseObject[],
  sequenceIndices: number[] = [],
) {
  return prisma.$transaction(async (tx) => {
    const existingLayer = await tx.mapCourseLayerObject.findMany({
      where: { mapFileId },
      select: { id: true },
    });
    const existingLayerIds = new Set(existingLayer.map((row) => row.id));
    const keepLayerIds = objects
      .filter((obj) => isControlLayerSymbol(obj.symbolNr) && isPersistedObjectId(obj.id))
      .map((obj) => obj.id!)
      .filter((id) => existingLayerIds.has(id));

    await tx.mapCourseLayerObject.deleteMany({
      where: {
        mapFileId,
        ...(keepLayerIds.length > 0 ? { id: { notIn: keepLayerIds } } : {}),
      },
    });

    const savedIds: string[] = [];
    const courseRows: SavedCourseObject[] = [];

    for (const obj of objects) {
      if (isControlLayerSymbol(obj.symbolNr)) {
        const data = {
          symbolNr: obj.symbolNr,
          objectType: obj.objectType,
          geometryJson: obj.geometryJson,
          textContent: obj.textContent,
          sortOrder: obj.sortOrder,
        };
        if (obj.id && existingLayerIds.has(obj.id) && keepLayerIds.includes(obj.id)) {
          await tx.mapCourseLayerObject.update({
            where: { id: obj.id },
            data,
          });
          savedIds.push(obj.id);
        } else {
          const created = await tx.mapCourseLayerObject.create({
            data: { mapFileId, ...data },
          });
          savedIds.push(created.id);
        }
      } else {
        courseRows.push(obj);
        savedIds.push("");
      }
    }

    await tx.courseObject.deleteMany({ where: { courseId } });
    if (courseRows.length > 0) {
      await tx.courseObject.createMany({
        data: courseRows.map((obj) => ({
          courseId,
          symbolNr: obj.symbolNr,
          objectType: obj.objectType,
          geometryJson: obj.geometryJson,
          textContent: obj.textContent,
          sortOrder: obj.sortOrder,
        })),
      });
    }
    const createdCourse = await tx.courseObject.findMany({
      where: { courseId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    let coursePtr = 0;
    for (let i = 0; i < objects.length; i++) {
      if (!isControlLayerSymbol(objects[i]!.symbolNr)) {
        savedIds[i] = createdCourse[coursePtr]?.id ?? "";
        coursePtr += 1;
      }
    }

    const sequenceIds = sequenceIndices
      .map((index) => savedIds[index])
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    await tx.course.update({
      where: { id: courseId },
      data: { sequenceJson: JSON.stringify(sequenceIds) },
    });
    return tx.course.findUniqueOrThrow({
      where: { id: courseId },
      include: courseDetailInclude,
    });
  });
}
