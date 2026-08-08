import { prisma } from "@/lib/prisma";

export async function setMapArchived(
  mapFileId: string,
  archived: boolean,
): Promise<{ id: string; slug: string; title: string; archivedAt: Date | null }> {
  return prisma.mapFile.update({
    where: { id: mapFileId },
    data: { archivedAt: archived ? new Date() : null },
    select: { id: true, slug: true, title: true, archivedAt: true },
  });
}

export function isMapArchived(archivedAt: Date | null | undefined): boolean {
  return archivedAt != null;
}
