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
  objectIds: string[];
  cropResult: CropOcadResult;
  objects: NormalizedOcadObject[];
  warnings: string[];
};

/**
 * Generates a subset .ocd from the base file. Objects outside the selection are marked
 * deleted (indices are preserved). The exported file and `objectIds` always describe the
 * same set of objects:
 * - BBOX: binary crop on the object index bbox (no full parse — expensive on large maps).
 * - POLYGON: objects are selected via geometry intersection, then exactly those are kept.
 */
export async function exportCheckoutSubset(
  sourceBuffer: Buffer,
  fileName: string,
  selectionGeometry: CheckoutSelectionGeometry,
  options?: { targetVersion?: OcadExportVersion; allowEmpty?: boolean },
): Promise<CheckoutSubsetExport> {
  const bbox = selectionToCropBbox(selectionGeometry);

  if (selectionGeometry.type === CheckoutSelectionType.BBOX) {
    const targetVersion =
      options?.targetVersion ??
      defaultOcadExportVersion(readOcadHeaderVersion(sourceBuffer));
    const cropResult = cropOcadBuffer(sourceBuffer, {
      bbox,
      targetVersion,
      allowEmpty: options?.allowEmpty,
    });

    return {
      buffer: cropResult.buffer,
      objectIds: cropResult.keptObjectIndices.map(String),
      cropResult,
      objects: [],
      warnings: [],
    };
  }

  const summary = await parseOcadBuffer(sourceBuffer, fileName);
  const objectIds = objectIdsFromSelection(summary.objects, selectionGeometry);
  const keepObjectIndices = new Set(objectIds.map(Number));
  const objects = summary.objects.filter((object) => keepObjectIndices.has(object.objectIndex));
  const targetVersion =
    options?.targetVersion ?? defaultOcadExportVersion(summary.ocadVersion);

  const cropResult = cropOcadBuffer(sourceBuffer, {
    bbox,
    targetVersion,
    allowEmpty: options?.allowEmpty,
    keepObjectIndices,
  });

  return {
    buffer: cropResult.buffer,
    objectIds: cropResult.keptObjectIndices.map(String),
    cropResult,
    objects,
    warnings: [...summary.warnings],
  };
}
