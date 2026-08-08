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

export type PublishVersionResult =
  | { ok: true; version: PublishedVersion }
  | { ok: false; error: string; status: number };

/** Set publish state; publishing one version unpublishes all others in the same area. */
export async function setVersionPublished(
  mapFileId: string,
  versionId: string,
  isPublished: boolean,
): Promise<PublishVersionResult> {
  if (isPublished) {
    const version = await prisma.mapVersion.findUnique({
      where: { id: versionId },
      select: { parseStatus: true, parseError: true },
    });
    if (!version) {
      return { ok: false, error: "Version hittades inte", status: 404 };
    }
    if (version.parseStatus === "PROCESSING" || version.parseStatus === "PENDING") {
      return {
        ok: false,
        error: "Versionen parsas fortfarande — vänta tills parsningen är klar.",
        status: 409,
      };
    }
    if (version.parseStatus === "ERROR") {
      return {
        ok: false,
        error: version.parseError?.trim()
          ? `Versionen har parsningsfel och kan inte publiceras: ${version.parseError}`
          : "Versionen har parsningsfel och kan inte publiceras.",
        status: 409,
      };
    }
  }

  if (!isPublished) {
    const version = await prisma.mapVersion.update({
      where: { id: versionId },
      data: { isPublished: false },
      select: versionSelect,
    });
    return { ok: true, version };
  }

  const version = await prisma.$transaction(async (tx) => {
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

  return { ok: true, version };
}
