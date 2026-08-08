import { prisma } from "@/lib/prisma";

const versionSelect = {
  id: true,
  versionNumber: true,
  isRecommended: true,
} as const;

export type RecommendedVersion = {
  id: string;
  versionNumber: number;
  isRecommended: boolean;
};

/** Mark one version as recommended; clears recommendation on siblings when enabling. */
export async function setVersionRecommended(
  mapFileId: string,
  versionId: string,
  isRecommended: boolean,
): Promise<RecommendedVersion> {
  if (!isRecommended) {
    return prisma.mapVersion.update({
      where: { id: versionId },
      data: { isRecommended: false },
      select: versionSelect,
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.mapVersion.updateMany({
      where: { mapFileId, id: { not: versionId }, isRecommended: true },
      data: { isRecommended: false },
    });
    return tx.mapVersion.update({
      where: { id: versionId },
      data: { isRecommended: true },
      select: versionSelect,
    });
  });
}
