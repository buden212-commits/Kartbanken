import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  assertCourseCreateAccess,
  assertCourseViewAccess,
} from "@/lib/course/access";
import {
  createCourse,
  listCoursesForMap,
  serializeCourseDetail,
  serializeCourseSummary,
} from "@/lib/course/repository";
import { validateCourseName } from "@/lib/course/validation";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const courses = await listCoursesForMap(map.id, session.user.id);
  return NextResponse.json({
    courses: courses.map(serializeCourseSummary),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const denied = assertCourseCreateAccess(session);
  if (denied) return denied;

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

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
  const name = validateCourseName(record.name);
  if (!name) {
    return NextResponse.json({ error: "Namn krävs (1–120 tecken)" }, { status: 400 });
  }

  const isPublic = record.isPublic === true;

  const course = await createCourse({
    mapFileId: map.id,
    name,
    createdById: session.user.id,
    isPublic,
  });

  await logAction(session.user.id, "COURSE_CREATED", "Course", course.id, {
    mapSlug: slug,
    name,
    isPublic,
  });

  return NextResponse.json(serializeCourseDetail(course), { status: 201 });
}
