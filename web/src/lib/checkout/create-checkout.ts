import { logAction } from "@/lib/audit";
import { runAfterResponse } from "@/lib/background";
import { objectIdsFromSelection } from "@/lib/checkout/selection-objects";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  createCheckout,
  findActiveOverlapCandidates,
  getHeadVersionId,
  serializeCheckoutResponse,
  updateCheckoutExportPath,
} from "@/lib/checkout/repository";
import {
  CheckoutSelectionType,
  serializeSelection,
  type CheckoutSelection,
} from "@/lib/checkout/types";
import { notifyCheckoutCreated } from "@/lib/email";
import { exportCheckoutSubset } from "@/lib/ocad/subset-export";
import type { OcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { prisma } from "@/lib/prisma";
import {
  buildCheckoutExportPath,
  buildCheckoutManifestPath,
  readStoredFile,
  uploadFile,
} from "@/lib/storage";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { NextResponse } from "next/server";

export async function generateCheckoutExport(
  mapFileId: string,
  checkoutId: string,
  baseVersionId: string,
  selection: CheckoutSelection,
  targetVersion: OcadExportVersion,
): Promise<string> {
  const version = await prisma.mapVersion.findUnique({ where: { id: baseVersionId } });
  if (!version) {
    throw new Error("Basversion hittades inte");
  }

  const sourceBuffer = await readStoredFile(version.storagePath);
  const summary = await parseOcadBuffer(sourceBuffer, version.originalFilename);
  const cropGeometry =
    selection.importPartial && selection.importExtent
      ? { type: CheckoutSelectionType.BBOX, bbox: selection.importExtent }
      : selection.geometry;
  const enrichedSelection: CheckoutSelection = {
    ...selection,
    objectIds: objectIdsFromSelection(summary.objects, cropGeometry),
  };

  const subset = await exportCheckoutSubset(
    sourceBuffer,
    version.originalFilename,
    cropGeometry,
    { targetVersion, allowEmpty: selection.importPartial === true },
  );

  const exportPath = buildCheckoutExportPath(mapFileId, checkoutId);
  const manifestPath = buildCheckoutManifestPath(mapFileId, checkoutId);
  const storedRef = await uploadFile(exportPath, subset.buffer);
  await uploadFile(manifestPath, subset.manifestBuffer);

  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      selectionJson: serializeSelection(enrichedSelection),
    },
  });

  await updateCheckoutExportPath(checkoutId, storedRef);
  return storedRef;
}

export function parseSelectionPayload(
  selectionType: CheckoutSelectionType,
  selection: unknown,
): CheckoutSelection | null {
  if (!selection || typeof selection !== "object") return null;
  const record = selection as Record<string, unknown>;
  const geometry = record.geometry;
  if (!geometry || typeof geometry !== "object") return null;

  const geom = geometry as Record<string, unknown>;
  if (geom.type !== selectionType) return null;

  const objectIds = Array.isArray(record.objectIds)
    ? record.objectIds.filter((id): id is string => typeof id === "string")
    : [];

  if (selectionType === CheckoutSelectionType.BBOX) {
    const bbox = geom.bbox;
    if (!bbox || typeof bbox !== "object") return null;
    const box = bbox as Record<string, unknown>;
    return {
      geometry: {
        type: CheckoutSelectionType.BBOX,
        bbox: {
          minX: Number(box.minX),
          minY: Number(box.minY),
          maxX: Number(box.maxX),
          maxY: Number(box.maxY),
        },
      },
      objectIds,
    };
  }

  const ring = geom.ring;
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const normalized = ring.map((point) => {
    if (!Array.isArray(point) || point.length < 2) return null;
    return [Number(point[0]), Number(point[1])] as [number, number];
  });
  if (normalized.some((point) => point === null)) return null;

  return {
    geometry: {
      type: CheckoutSelectionType.POLYGON,
      ring: normalized as [number, number][],
    },
    objectIds,
  };
}

export async function finalizeCheckoutNotifications(
  checkout: NonNullable<Awaited<ReturnType<typeof createCheckout>>>,
  map: { title: string; slug: string },
  userId: string,
): Promise<void> {
  await logAction(userId, "CHECKOUT_CREATED", "MapCheckout", checkout.id, {
    mapSlug: map.slug,
  });

  notifyCheckoutCreated({
    checkoutId: checkout.id,
    map,
    owner: {
      name: checkout.user.name,
      email: checkout.user.email,
    },
  });
}

export { runAfterResponse };
