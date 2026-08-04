import {
  canCreateCourse,
  canDeleteCourse,
  canEditCourse,
  canViewCourse,
} from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/api";
import { NextResponse } from "next/server";

type CourseRecord = {
  id: string;
  mapFileId: string;
  createdById: string;
  isPublic: boolean;
};

export function assertCourseViewAccess(
  session: AuthSession,
  course: CourseRecord,
): NextResponse | null {
  if (
    !canViewCourse(session.user.role, course, session.user.id)
  ) {
    return NextResponse.json({ error: "Banan hittades inte" }, { status: 404 });
  }
  return null;
}

export function assertCourseEditAccess(
  session: AuthSession,
  course: CourseRecord,
): NextResponse | null {
  if (!canViewCourse(session.user.role, course, session.user.id)) {
    return NextResponse.json({ error: "Banan hittades inte" }, { status: 404 });
  }
  if (!canEditCourse(session.user.role, course.createdById, session.user.id)) {
    return NextResponse.json({ error: "Ingen behörighet att redigera banan" }, { status: 403 });
  }
  return null;
}

export function assertCourseCreateAccess(session: AuthSession): NextResponse | null {
  if (!canCreateCourse(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet att skapa banor" }, { status: 403 });
  }
  return null;
}

export function assertCourseDeleteAccess(
  session: AuthSession,
  course: CourseRecord,
): NextResponse | null {
  if (!canViewCourse(session.user.role, course, session.user.id)) {
    return NextResponse.json({ error: "Banan hittades inte" }, { status: 404 });
  }
  if (!canDeleteCourse(session.user.role, course.createdById, session.user.id)) {
    return NextResponse.json({ error: "Ingen behörighet att radera banan" }, { status: 403 });
  }
  return null;
}

export { canCreateCourse, canDeleteCourse, canEditCourse, canViewCourse };
