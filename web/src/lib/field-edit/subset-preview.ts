import { exportCheckoutSubset } from "@/lib/ocad/subset-export";
import { generateAndStorePreviewSvg } from "@/lib/ocad/svg";
import { parseSelectionJson } from "@/lib/checkout/types";
import {
  applySelectionViewBoxToPreviewSvg,
  previewRootTransformFromObjectBounds,
  selectionToPreviewSvgBounds,
} from "@/lib/field-edit/preview-extent";
import { prisma } from "@/lib/prisma";
import { buildCheckoutExportPath, readStoredFile, uploadFile } from "@/lib/storage";

export function buildFieldEditPreviewPath(mapFileId: string, checkoutId: string): string {
  return `maps/${mapFileId}/field-edits/${checkoutId}/preview.svg`;
}

export async function generateFieldEditSubset(
  mapFileId: string,
  checkoutId: string,
  baseVersionId: string,
  selectionJson: string,
): Promise<{ exportPath: string; previewPath: string }> {
  const version = await prisma.mapVersion.findUnique({
    where: { id: baseVersionId },
    select: { storagePath: true, originalFilename: true },
  });
  if (!version) {
    throw new Error("Basversion hittades inte");
  }

  const sourceBuffer = await readStoredFile(version.storagePath);
  const selection = parseSelectionJson(selectionJson);
  const subset = await exportCheckoutSubset(
    sourceBuffer,
    version.originalFilename,
    selection.geometry,
  );

  const exportPath = buildCheckoutExportPath(mapFileId, checkoutId);
  const storedRef = await uploadFile(exportPath, subset.buffer);

  const previewPath = buildFieldEditPreviewPath(mapFileId, checkoutId);
  // Object bounds drive the OCAD Y-flip transform; selection bounds set the viewBox
  // so «Hela kartan» fits the utcheckade området without empty white margins.
  await generateAndStorePreviewSvg(subset.buffer, previewPath, {
    viewBoundsFromSelection: (objectBounds) => {
      const transform = previewRootTransformFromObjectBounds(objectBounds);
      return selectionToPreviewSvgBounds(selection.geometry, transform);
    },
  });

  // Ensure stored preview viewBox matches selection (covers generator fallbacks).
  try {
    const previewSvg = (await readStoredFile(previewPath)).toString("utf-8");
    const clipped = applySelectionViewBoxToPreviewSvg(previewSvg, selection.geometry);
    if (clipped !== previewSvg) {
      await uploadFile(previewPath, Buffer.from(clipped, "utf-8"));
    }
  } catch {
    // Preview already stored; serve path can repair later.
  }

  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: { exportStoragePath: storedRef },
  });

  return { exportPath: storedRef, previewPath };
}
