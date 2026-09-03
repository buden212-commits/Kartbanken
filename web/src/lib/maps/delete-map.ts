import { findActiveAreaLocksForMap } from "@/lib/checkout/repository";
import { prisma } from "@/lib/prisma";
import {
  collectLayerPathsFromSummary,
  deleteStoragePaths,
} from "@/lib/maps/delete-storage";

export type DeleteMapResult =
  | { ok: true; title: string; slug: string; versionCount: number }
  | { ok: false; error: string; status: number };

export async function deleteMapFile(mapFileId: string): Promise<DeleteMapResult> {
  const map = await prisma.mapFile.findUnique({
    where: { id: mapFileId },
    select: {
      id: true,
      slug: true,
      title: true,
      versions: {
        select: {
          storagePath: true,
          previewSvgPath: true,
          tileManifestPath: true,
        },
      },
      checkouts: {
        select: {
          exportStoragePath: true,
          checkinStoragePath: true,
        },
      },
    },
  });

  if (!map) {
    return { ok: false, error: "Kartfil hittades inte", status: 404 };
  }

  const activeCheckouts = await findActiveAreaLocksForMap(mapFileId);
  if (activeCheckouts.length > 0) {
    return {
      ok: false,
      error: "Kartfilen har aktiva utcheckningar eller fältredigeringar. Avbryt dem innan radering.",
      status: 409,
    };
  }

  const diffs = await prisma.versionDiff.findMany({
    where: { mapFileId },
    select: { summaryJson: true },
  });

  const storagePaths: (string | null | undefined)[] = [];
  for (const version of map.versions) {
    storagePaths.push(version.storagePath, version.previewSvgPath, version.tileManifestPath);
  }
  for (const checkout of map.checkouts) {
    storagePaths.push(checkout.exportStoragePath, checkout.checkinStoragePath);
  }
  for (const diff of diffs) {
    storagePaths.push(...collectLayerPathsFromSummary(diff.summaryJson));
  }

  await deleteStoragePaths(storagePaths);

  await prisma.versionDiff.deleteMany({ where: { mapFileId } });
  await prisma.mapFile.delete({ where: { id: mapFileId } });

  return {
    ok: true,
    title: map.title,
    slug: map.slug,
    versionCount: map.versions.length,
  };
}
