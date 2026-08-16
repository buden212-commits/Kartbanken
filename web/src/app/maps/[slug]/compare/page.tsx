import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canViewVersion } from "@/lib/auth/version-access";
import { versionVisibilityFilter } from "@/lib/maps/version-query";
import { ComparePageClient } from "@/components/compare-page-client";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v1?: string; v2?: string }>;
};

export default async function ComparePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { v1, v2 } = await searchParams;
  const session = await auth();
  const role = session?.user.role;

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) notFound();

  if (!v1 || !v2) {
    const versions = await prisma.mapVersion.findMany({
      where: { mapFileId: map.id, ...versionVisibilityFilter(role) },
      orderBy: { versionNumber: "desc" },
      take: 2,
    });

    if (versions.length < 2) {
      redirect(`/maps/${slug}`);
    }

    redirect(
      `/maps/${slug}/compare?v1=${versions[1]!.id}&v2=${versions[0]!.id}`,
    );
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true },
    }),
  ]);

  if (!versionA || !versionB || !role) notFound();

  if (!canViewVersion(role, versionA.isPublished) || !canViewVersion(role, versionB.isPublished)) {
    notFound();
  }

  const [older, newer] =
    versionA.versionNumber < versionB.versionNumber
      ? [versionA, versionB]
      : [versionB, versionA];

  return (
    <ComparePageClient
      mapSlug={slug}
      mapTitle={map.title}
      v1={older.id}
      v2={newer.id}
      versionANumber={older.versionNumber}
      versionBNumber={newer.versionNumber}
    />
  );
}
