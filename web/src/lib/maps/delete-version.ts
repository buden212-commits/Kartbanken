import { LOCKING_CHECKOUT_STATUSES } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import {
  collectLayerPathsFromSummary,
  deleteStoragePaths,
} from "@/lib/maps/delete-storage";

export type DeleteVersionResult =
  | { ok: true; versionNumber: number }
  | { ok: false; error: string; status: number };

export async function deleteMapVersion(versionId: string): Promise<DeleteVersionResult> {
  const version = await prisma.mapVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      mapFileId: true,
      versionNumber: true,
      storagePath: true,
      previewSvgPath: true,
      tileManifestPath: true,
    },
  });

  if (!version) {
    return { ok: false, error: "Version hittades inte", status: 404 };
  }

  const versionCount = await prisma.mapVersion.count({
    where: { mapFileId: version.mapFileId },
  });

  if (versionCount <= 1) {
    return {
      ok: false,
      error: "Kan inte radera den enda versionen. Radera hela kartfilen i stället.",
      status: 409,
    };
  }

  const activeCheckoutRefs = await prisma.mapCheckout.count({
    where: {
      baseVersionId: versionId,
      status: { in: LOCKING_CHECKOUT_STATUSES },
    },
  });

  if (activeCheckoutRefs > 0) {
    return {
      ok: false,
      error: "Det finns aktiva utcheckningar på denna version.",
      status: 409,
    };
  }

  const historicalCheckouts = await prisma.mapCheckout.findMany({
    where: {
      baseVersionId: versionId,
      status: { notIn: LOCKING_CHECKOUT_STATUSES },
    },
    select: {
      id: true,
      exportStoragePath: true,
      checkinStoragePath: true,
    },
  });

  if (historicalCheckouts.length > 0) {
    await deleteStoragePaths(
      historicalCheckouts.flatMap((checkout) => [
        checkout.exportStoragePath,
        checkout.checkinStoragePath,
      ]),
    );
    await prisma.mapCheckout.deleteMany({
      where: { id: { in: historicalCheckouts.map((checkout) => checkout.id) } },
    });
  }

  const diffs = await prisma.versionDiff.findMany({
    where: {
      OR: [{ versionAId: versionId }, { versionBId: versionId }],
    },
    select: { id: true, summaryJson: true },
  });

  const storagePaths: (string | null | undefined)[] = [
    version.storagePath,
    version.previewSvgPath,
    version.tileManifestPath,
  ];
  for (const diff of diffs) {
    storagePaths.push(...collectLayerPathsFromSummary(diff.summaryJson));
  }

  await deleteStoragePaths(storagePaths);

  if (diffs.length > 0) {
    await prisma.versionDiff.deleteMany({
      where: { id: { in: diffs.map((diff) => diff.id) } },
    });
  }

  await prisma.mapVersion.delete({ where: { id: versionId } });

  return { ok: true, versionNumber: version.versionNumber };
}
