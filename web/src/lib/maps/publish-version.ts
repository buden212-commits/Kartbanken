import { prisma } from "@/lib/prisma";

const versionSelect = {
  id: true,
  versionNumber: true,
  isPublished: true,
} as const;

export type PublishedVersion = {
  id: string;
  versionNumber: number;
  isPublished: boolean;
};

/** Set publish state; publishing one version unpublishes all others in the same area. */
export async function setVersionPublished(
  mapFileId: string,
  versionId: string,
  isPublished: boolean,
): Promise<PublishedVersion> {
  if (!isPublished) {
    return prisma.mapVersion.update({
      where: { id: versionId },
      data: { isPublished: false },
      select: versionSelect,
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.mapVersion.updateMany({
      where: { mapFileId, id: { not: versionId }, isPublished: true },
      data: { isPublished: false },
    });

    return tx.mapVersion.update({
      where: { id: versionId },
      data: { isPublished: true },
      select: versionSelect,
    });
  });
}
