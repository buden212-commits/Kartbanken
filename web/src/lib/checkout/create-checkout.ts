import { logAction } from "@/lib/audit";
import { runAfterResponse } from "@/lib/background";
import { runCheckoutMaintenance } from "@/lib/checkout/maintenance";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  createCheckout,
  findActiveOverlapCandidates,
  type CreateCheckoutInput,
} from "@/lib/checkout/repository";
import {
  CheckoutSelectionType,
  CheckoutStatus,
  parseBbox,
  parsePolygonRing,
  type CheckoutOverlapConflict,
  type CheckoutSelection,
} from "@/lib/checkout/types";
import { formatAreaKm2, selectionAreaM2 } from "@/lib/checkout/selection-area";
import { notifyCheckoutCreated } from "@/lib/email";
import { DEFAULT_MAP_SCALE } from "@/lib/field-edit/scale";
import { readOcadFileInfo } from "@/lib/ocad/ocad-file-info";
import { resolveMaxCheckoutAreaKm2 } from "@/lib/settings/app-settings";
import { lockMapAndVerifyHead } from "@/lib/maps/head-version";
import { exportCheckoutSubset } from "@/lib/ocad/subset-export";
import {
  incompatibleExportVersionMessage,
  isCompatibleExportVersion,
  type OcadExportVersion,
} from "@/lib/ocad/ocad-export-shared";
import { prisma } from "@/lib/prisma";
import { buildCheckoutExportPath, deleteFile, readStoredFile, uploadFile } from "@/lib/storage";

export class CheckoutConflictError extends Error {
  constructor(
    readonly conflicts: CheckoutOverlapConflict[],
    message = "Området överlappar en befintlig utcheckning",
  ) {
    super(message);
    this.name = "CheckoutConflictError";
  }
}

/** Invalid request (e.g. area too large) — maps to HTTP 400. */
export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

export type CreateCheckoutWithExportInput = Omit<CreateCheckoutInput, "status" | "exportOcadVersion"> & {
  exportOcadVersion: OcadExportVersion;
  /** Head buffer when the caller already has it (avoids a second download). */
  sourceBuffer?: Buffer;
};

/**
 * Creates an OCAD desktop checkout:
 * 1. Builds the export and computes objectIds on the server (client objectIds are ignored).
 * 2. Under the per-map lock: verifies head, checks overlap, inserts the row as EXPORTING.
 * 3. Uploads the export and flips the row to ACTIVE.
 * Anything left in EXPORTING (killed function) is removed by runCheckoutMaintenance.
 */
export async function createCheckoutWithExport(input: CreateCheckoutWithExportInput) {
  const version = await prisma.mapVersion.findUnique({ where: { id: input.baseVersionId } });
  if (!version) {
    throw new Error("Basversion hittades inte");
  }

  await runCheckoutMaintenance(input.mapFileId);

  const sourceBuffer = input.sourceBuffer ?? (await readStoredFile(version.storagePath));
  const selection = input.selection;

  const fileInfo = readOcadFileInfo(sourceBuffer);
  if (!isCompatibleExportVersion(fileInfo.version, input.exportOcadVersion)) {
    throw new CheckoutValidationError(
      incompatibleExportVersionMessage(fileInfo.version, input.exportOcadVersion),
    );
  }

  if (!selection.importPartial) {
    const maxAreaKm2 = await resolveMaxCheckoutAreaKm2();
    if (maxAreaKm2 > 0) {
      const scale = fileInfo.scaleParams?.scale;
      const areaM2 = selectionAreaM2(
        selection.geometry,
        scale && Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_MAP_SCALE,
      );
      if (areaM2 > maxAreaKm2 * 1_000_000) {
        throw new CheckoutValidationError(
          `Området är ${formatAreaKm2(areaM2)} km² — max ${maxAreaKm2} km² per utcheckning. Välj ett mindre område.`,
        );
      }
    }
  }
  // Importerad delkarta: använd polygon (exakt objectIds) när den finns; annars unpadded AABB.
  const cropGeometry =
    selection.importPartial && selection.geometry.type === CheckoutSelectionType.POLYGON
      ? selection.geometry
      : selection.importPartial && selection.importExtent
        ? { type: CheckoutSelectionType.BBOX, bbox: selection.importExtent }
        : selection.geometry;

  const subset = await exportCheckoutSubset(sourceBuffer, version.originalFilename, cropGeometry, {
    targetVersion: input.exportOcadVersion,
    allowEmpty: selection.importPartial === true,
  });

  const enrichedSelection: CheckoutSelection = { ...selection, objectIds: subset.objectIds };

  const checkout = await prisma.$transaction(
    async (tx) => {
      await lockMapAndVerifyHead(tx, input.mapFileId, input.baseVersionId);
      const conflicts = detectCheckoutConflicts(
        enrichedSelection,
        await findActiveOverlapCandidates(input.mapFileId, tx),
      );
      if (conflicts.length > 0) {
        throw new CheckoutConflictError(conflicts);
      }
      return createCheckout(
        { ...input, selection: enrichedSelection, status: CheckoutStatus.EXPORTING },
        tx,
      );
    },
    { timeout: 20_000 },
  );

  let storedRef: string | null = null;
  try {
    storedRef = await uploadFile(buildCheckoutExportPath(input.mapFileId, checkout.id), subset.buffer);
    const activated = await prisma.mapCheckout.updateMany({
      where: { id: checkout.id, status: CheckoutStatus.EXPORTING },
      data: { exportStoragePath: storedRef, status: CheckoutStatus.ACTIVE },
    });
    if (activated.count !== 1) {
      throw new Error("Utcheckningen avbröts medan exportfilen skapades. Försök igen.");
    }
  } catch (err) {
    if (storedRef) await deleteFile(storedRef).catch(() => undefined);
    await prisma.mapCheckout
      .deleteMany({ where: { id: checkout.id, status: CheckoutStatus.EXPORTING } })
      .catch(() => undefined);
    throw err;
  }

  return {
    ...checkout,
    status: CheckoutStatus.ACTIVE as string,
    exportStoragePath: storedRef,
  };
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

  // objectIds are always recomputed on the server from the base file.
  const objectIds: string[] = [];

  if (selectionType === CheckoutSelectionType.BBOX) {
    const bbox = parseBbox(geom.bbox);
    if (!bbox || bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY) return null;
    return {
      geometry: { type: CheckoutSelectionType.BBOX, bbox },
      objectIds,
    };
  }

  if (Array.isArray(geom.ring) && geom.ring.length > MAX_POLYGON_POINTS) return null;
  const ring = parsePolygonRing(geom.ring);
  if (!ring || ringSignedArea(ring) === 0) return null;

  return {
    geometry: { type: CheckoutSelectionType.POLYGON, ring },
    objectIds,
  };
}

const MAX_POLYGON_POINTS = 10_000;

function ringSignedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export async function finalizeCheckoutNotifications(
  checkout: { id: string; user: { name: string | null; email: string } },
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
