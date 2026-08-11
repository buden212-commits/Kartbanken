import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canCreateCourse, canEditCourse, canViewCourse } from "@/lib/auth/permissions";
import { CourseEditorClient } from "@/components/course/course-editor-client";
import { getLatestPublishedVersion } from "@/lib/maps/version-context";
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

  const publishedVersion = await getLatestPublishedVersion(map.id);
  if (!publishedVersion) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-lg font-medium text-slate-900">Lägg bana</h1>
        <p className="mt-3 text-sm text-slate-600">
          Banläggning kräver en publicerad kartversion. Det finns ingen publicerad version av{" "}
          <strong>{map.title}</strong> ännu.
        </p>
        <Link
          href={`/maps/${slug}`}
          className="mt-6 inline-block text-sm font-medium text-ifk-blue hover:underline"
        >
          Tillbaka till området
        </Link>
      </div>
    );
  }

  let canEdit = true;
  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { createdById: true, isPublic: true, mapFileId: true },
    });
    if (!course || course.mapFileId !== map.id) notFound();
    if (!canViewCourse(session.user.role, course, session.user.id)) {
      notFound();
    }
    canEdit = canEditCourse(session.user.role, course.createdById, session.user.id);
  }

  return (
    <CourseEditorClient
      mapSlug={slug}
      mapTitle={map.title}
      headVersionId={publishedVersion.id}
      headVersionNumber={publishedVersion.versionNumber}
      initialCourseId={courseId ?? null}
      canEdit={canEdit}
      sessionUserId={session.user.id}
    />
  );
}
