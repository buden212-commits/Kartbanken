import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canCreateCourse, canEditCourse, canViewCourse } from "@/lib/auth/permissions";
import { getHeadVersionId } from "@/lib/checkout/repository";
import { CourseEditorClient } from "@/components/course/course-editor-client";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ course?: string }>;
};

export default async function CourseEditorPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { course: courseId } = await searchParams;

  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    redirect("/login");
  }

  if (!canCreateCourse(session.user.role)) {
    notFound();
  }

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) notFound();

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) notFound();

  const headVersion = await prisma.mapVersion.findUnique({
    where: { id: headVersionId },
    select: { versionNumber: true },
  });
  if (!headVersion) notFound();

  let canEdit = true;
  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { createdById: true, isPublic: true, mapFileId: true },
    });
    if (!course || course.mapFileId !== map.id) notFound();
    if (
      !canViewCourse(session.user.role, course, session.user.id)
    ) {
      notFound();
    }
    canEdit = canEditCourse(session.user.role, course.createdById, session.user.id);
  }

  return (
    <CourseEditorClient
      mapSlug={slug}
      mapTitle={map.title}
      headVersionId={headVersionId}
      headVersionNumber={headVersion.versionNumber}
      initialCourseId={courseId ?? null}
      canEdit={canEdit}
      sessionUserId={session.user.id}
    />
  );
}
