import { prisma } from "@/lib/prisma";
import { COMPLETED_VERSION_WHERE } from "./head-version";

export type MapVersionContext = {
  head: { id: string; versionNumber: number; isPublished: boolean } | null;
  published: { id: string; versionNumber: number } | null;
  unpublishedHeadCount: number;
};

export async function getLatestPublishedVersion(
  mapFileId: string,
): Promise<{ id: string; versionNumber: number } | null> {
  return prisma.mapVersion.findFirst({
    where: { mapFileId, isPublished: true },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
}

export async function getMapVersionContext(mapFileId: string): Promise<MapVersionContext> {
  const [head, published, unpublishedHeadCount] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { mapFileId, ...COMPLETED_VERSION_WHERE },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, isPublished: true },
    }),
    prisma.mapVersion.findFirst({
      where: { mapFileId, isPublished: true },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true },
    }),
    prisma.mapVersion.count({
      where: { mapFileId, isPublished: false },
    }),
  ]);

  return { head, published, unpublishedHeadCount };
}
