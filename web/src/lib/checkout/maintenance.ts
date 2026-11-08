import { CheckoutStatus, STALE_INTEGRATING_MS } from "./types";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";

/** Upload placeholders (upload-init without completed file) older than this are removed. */
const STALE_VERSION_PLACEHOLDER_MS = 24 * 60 * 60 * 1000;
/** EXPORTING checkouts older than this belong to a killed export and are removed. */
export const STALE_EXPORTING_MS = 15 * 60 * 1000;

export type CheckoutMaintenanceResult = {
  removedVersionPlaceholders: number;
  removedStaleExports: number;
  releasedStaleIntegrations: number;
};

/**
 * Cleans up state left behind by killed functions. Safe to run often; pass
 * `mapFileId` to limit the work to one map (e.g. before an overlap check).
 */
export async function runCheckoutMaintenance(
  mapFileId?: string,
): Promise<CheckoutMaintenanceResult> {
  const now = Date.now();
  const mapFilter = mapFileId ? { mapFileId } : {};

  const placeholders = await prisma.mapVersion.findMany({
    where: {
      ...mapFilter,
      contentHash: null,
      uploadedAt: { lt: new Date(now - STALE_VERSION_PLACEHOLDER_MS) },
      checkoutsAsBase: { none: {} },
      checkoutsAsIntegrated: { none: {} },
    },
    select: { id: true, storagePath: true },
  });
  for (const placeholder of placeholders) {
    await deleteFile(placeholder.storagePath).catch(() => undefined);
    await prisma.mapVersion.delete({ where: { id: placeholder.id } }).catch(() => undefined);
  }

  const staleExports = await prisma.mapCheckout.findMany({
    where: {
      ...mapFilter,
      status: CheckoutStatus.EXPORTING,
      createdAt: { lt: new Date(now - STALE_EXPORTING_MS) },
    },
    select: { id: true, exportStoragePath: true },
  });
  for (const checkout of staleExports) {
    const removed = await prisma.mapCheckout.deleteMany({
      where: { id: checkout.id, status: CheckoutStatus.EXPORTING },
    });
    if (removed.count > 0 && checkout.exportStoragePath) {
      await deleteFile(checkout.exportStoragePath).catch(() => undefined);
    }
  }

  const released = await prisma.mapCheckout.updateMany({
    where: {
      ...mapFilter,
      status: CheckoutStatus.INTEGRATING,
      updatedAt: { lt: new Date(now - STALE_INTEGRATING_MS) },
    },
    data: { status: CheckoutStatus.PENDING_ADMIN_CONFIRM },
  });

  return {
    removedVersionPlaceholders: placeholders.length,
    removedStaleExports: staleExports.length,
    releasedStaleIntegrations: released.count,
  };
}
