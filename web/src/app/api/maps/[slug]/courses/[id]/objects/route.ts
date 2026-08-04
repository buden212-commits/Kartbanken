import { requireSession } from "@/lib/auth/api";
import {
  assertCourseEditAccess,
  assertCourseViewAccess,
} from "@/lib/course/access";
import {
  getCourseById,
  replaceCourseObjects,
  serializeCourseDetail,
} from "@/lib/course/repository";
import {
  COURSE_MAX_OBJECTS,
  validateCourseObjectInput,
} from "@/lib/course/validation";
import type { CourseObjectInput } from "@/lib/course/types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const course = await getCourseById(id);
  if (!course || course.mapFileId !== map.id) {
    return NextResponse.json({ error: "Banan hittades inte" }, { status: 404 });
  }

  const viewDenied = assertCourseViewAccess(session, course);
  if (viewDenied) return viewDenied;

  const editDenied = assertCourseEditAccess(session, course);
  if (editDenied) return editDenied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.objects)) {
    return NextResponse.json({ error: "objects måste vara en array" }, { status: 400 });
  }

  const rawObjects = record.objects as unknown[];
  const warnings: string[] = [];

  if (rawObjects.length > COURSE_MAX_OBJECTS) {
    warnings.push(
      `Banan har ${rawObjects.length} objekt — rekommenderat max är ${COURSE_MAX_OBJECTS}.`,
    );
  }

  const validated: CourseObjectInput[] = [];
  for (let i = 0; i < rawObjects.length; i++) {
    const result = validateCourseObjectInput(rawObjects[i], i);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    validated.push(result.value);
  }

  const sorted = validated
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((obj, index) => ({
      symbolNr: obj.symbolNr,
      objectType: obj.objectType,
      geometryJson: JSON.stringify(obj.geometry),
      textContent: obj.textContent ?? null,
      sortOrder: index,
    }));

  const updated = await replaceCourseObjects(id, sorted);

  return NextResponse.json({
    ...serializeCourseDetail(updated),
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
