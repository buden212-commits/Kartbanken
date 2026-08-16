import { objectIdsFromSelection, selectionToCropBbox } from "@/lib/checkout/selection-objects";
import type { CheckoutSelectionGeometry } from "@/lib/checkout/types";
import { CheckoutSelectionType } from "@/lib/checkout/types";
import { cropOcadBuffer, readOcadHeaderVersion } from "./ocad-export-server";
import {
  defaultOcadExportVersion,
  type CropOcadResult,
  type OcadExportVersion,
} from "./ocad-export-shared";
import { parseOcadBuffer } from "./read";
import type { NormalizedOcadObject } from "./types";

export type CheckoutSubsetExport = {
  buffer: Buffer;
  manifestBuffer: Buffer;
  objectIds: string[];
  cropResult: CropOcadResult;
  objects: NormalizedOcadObject[];
  warnings: string[];
};

/**
 * Generates a subset .ocd by cropping the base file to the checkout selection bbox.
 * Polygon selections use their bounding box for the binary crop; objectIds are filtered
 * precisely via geometry intersection.
 *
 * Real polygon-clipped .ocd writes are not supported by ocad2geojson — see PRD §18.7.
 *
 * For BBOX selections we skip the full GeoJSON parse (expensive on large maps like Mora Väst)
 * and use object indices from the binary crop instead.
 */
export async function exportCheckoutSubset(
  sourceBuffer: Buffer,
  fileName: string,
  selectionGeometry: CheckoutSelectionGeometry,
  options?: { targetVersion?: OcadExportVersion; allowEmpty?: boolean },
): Promise<CheckoutSubsetExport> {
  const bbox = selectionToCropBbox(selectionGeometry);
  const isBbox = selectionGeometry.type === CheckoutSelectionType.BBOX;

  if (isBbox) {
    const targetVersion =
      options?.targetVersion ??
      defaultOcadExportVersion(readOcadHeaderVersion(sourceBuffer));
    const cropResult = cropOcadBuffer(sourceBuffer, {
      bbox,
      targetVersion,
      allowEmpty: options?.allowEmpty,
    });
    const objectIds = cropResult.keptObjectIndices.map(String);
    const manifest = {
      kind: "checkout-subset-manifest",
      version: 1,
      objectIds,
      selectionGeometry,
      cropBbox: bbox,
      keptObjects: cropResult.keptObjects,
      removedObjects: cropResult.removedObjects,
      sourceOcadVersion: cropResult.sourceVersion,
      targetOcadVersion: cropResult.targetVersion,
      warnings: [] as string[],
    };

    return {
      buffer: cropResult.buffer,
      manifestBuffer: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
      objectIds,
      cropResult,
      objects: [],
      warnings: [],
    };
  }

  const summary = await parseOcadBuffer(sourceBuffer, fileName);
  const objectIds = objectIdsFromSelection(summary.objects, selectionGeometry);
  const objects = summary.objects.filter((object) =>
    objectIds.includes(String(object.objectIndex)),
  );
  const targetVersion =
    options?.targetVersion ?? defaultOcadExportVersion(summary.ocadVersion);

  const cropResult = cropOcadBuffer(sourceBuffer, {
    bbox,
    targetVersion,
    allowEmpty: options?.allowEmpty,
  });

  const warnings = [...summary.warnings];
  warnings.push(
    "Polygonval använder omslutande rektangel för .ocd-export; objekt filtreras exakt via geometri.",
  );

  const manifest = {
    kind: "checkout-subset-manifest",
    version: 1,
    objectIds,
    selectionGeometry,
    cropBbox: bbox,
    keptObjects: cropResult.keptObjects,
    removedObjects: cropResult.removedObjects,
    sourceOcadVersion: cropResult.sourceVersion,
    targetOcadVersion: cropResult.targetVersion,
    warnings,
  };

  return {
    buffer: cropResult.buffer,
    manifestBuffer: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
    objectIds,
    cropResult,
    objects,
    warnings,
  };
}
