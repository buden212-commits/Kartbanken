import { notFound, redirect } from "next/navigation";
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

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) notFound();

  if (!v1 || !v2) {
    const versions = await prisma.mapVersion.findMany({
      where: { mapFileId: map.id },
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

  return <ComparePageClient mapSlug={slug} mapTitle={map.title} v1={v1} v2={v2} />;
}
