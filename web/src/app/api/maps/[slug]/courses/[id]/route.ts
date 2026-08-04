import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  assertCourseDeleteAccess,
  assertCourseEditAccess,
  assertCourseViewAccess,
} from "@/lib/course/access";
import {
  deleteCourse,
  getCourseById,
  serializeCourseDetail,
  updateCourse,
} from "@/lib/course/repository";
import { validateCourseName } from "@/lib/course/validation";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function loadCourse(slug: string, courseId: string) {
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };

  const course = await getCourseById(courseId);
  if (!course || course.mapFileId !== map.id) {
    return { error: NextResponse.json({ error: "Banan hittades inte" }, { status: 404 }) };
  }

  return { course, map };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadCourse(slug, id);
  if ("error" in result && result.error) return result.error;

  const denied = assertCourseViewAccess(session, result.course!);
  if (denied) return denied;

  return NextResponse.json(serializeCourseDetail(result.course!));
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadCourse(slug, id);
  if ("error" in result && result.error) return result.error;

  const denied = assertCourseEditAccess(session, result.course!);
  if (denied) return denied;

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
  const updates: { name?: string; isPublic?: boolean } = {};

  if ("name" in record) {
    const name = validateCourseName(record.name);
    if (!name) {
      return NextResponse.json({ error: "Namn krävs (1–120 tecken)" }, { status: 400 });
    }
    updates.name = name;
  }

  if ("isPublic" in record) {
    updates.isPublic = record.isPublic === true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
  }

  const course = await updateCourse(id, updates);

  await logAction(session.user.id, "COURSE_UPDATED", "Course", id, {
    mapSlug: slug,
    ...updates,
  });

  return NextResponse.json(serializeCourseDetail(course));
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadCourse(slug, id);
  if ("error" in result && result.error) return result.error;

  const denied = assertCourseDeleteAccess(session, result.course!);
  if (denied) return denied;

  await deleteCourse(id);

  await logAction(session.user.id, "COURSE_DELETED", "Course", id, {
    mapSlug: slug,
    name: result.course!.name,
  });

  return NextResponse.json({ ok: true });
}
