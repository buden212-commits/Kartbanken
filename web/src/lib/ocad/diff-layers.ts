import type { OcadObjectChange } from "./diff-types";
import type { SvgBounds } from "./svg-utils";
import { generateOcadSvgFiltered } from "./svg";
import { uploadFile } from "@/lib/storage";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (input: Buffer, options?: { quietWarnings?: boolean }) => Promise<{
    getBounds: () => number[];
  }>;
};

export type DiffLayerKind = "added" | "removed" | "modified";

export type DiffLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: SvgBounds;
};

export function buildDiffLayerPath(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  layer: DiffLayerKind,
): string {
  return `maps/${mapFileId}/diff/${versionAId}_${versionBId}/${layer}.svg`;
}

/**
 * Vyns utsnitt är samma råa OCAD-bounds som SVG-renderingen använder.
 * Läs dem direkt i stället för att rendera hela kartan bara för att få måtten —
 * en full rendering tar minuter på stora kartor och gjorde jämförelsen ofärdig.
 */
function boundsFromOcadFile(ocadFile: { getBounds: () => number[] }): SvgBounds {
  const raw = ocadFile.getBounds();
  if (raw && raw.length >= 4) {
    const [minX, minY, maxX, maxY] = raw;
    return { minX, minY, maxX, maxY };
  }
  return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
}

export function buildTempDiffLayerPath(jobId: string, layer: DiffLayerKind): string {
  return `temp-compare/${jobId}/layers/${layer}.svg`;
}

export function buildCheckoutDiffLayerPath(
  mapFileId: string,
  checkoutId: string,
  layer: DiffLayerKind,
): string {
  return `maps/${mapFileId}/checkout-diff/${checkoutId}/${layer}.svg`;
}

export async function generateDiffLayerSvgs(
  bufferA: Buffer,
  bufferB: Buffer,
  changes: OcadObjectChange[],
  storagePaths: {
    added: string;
    removed: string;
    modified: string;
  },
): Promise<DiffLayerPaths> {
  const addedIndices = new Set<number>();
  const removedIndices = new Set<number>();
  const modifiedIndices = new Set<number>();

  for (const change of changes) {
    if (change.changeType === "added") addedIndices.add(change.objectIndex);
    else if (change.changeType === "removed") removedIndices.add(change.objectIndex);
    else modifiedIndices.add(change.objectIndex);
  }

  return generateDiffLayerSvgsFromIndices(
    bufferA,
    bufferB,
    { added: addedIndices, removed: removedIndices, modified: modifiedIndices },
    storagePaths,
  );
}

export async function generateDiffLayerSvgsFromIndices(
  bufferA: Buffer,
  bufferB: Buffer,
  indices: {
    added: Set<number>;
    removed: Set<number>;
    modified: Set<number>;
  },
  storagePaths: {
    added: string;
    removed: string;
    modified: string;
  },
): Promise<DiffLayerPaths> {
  const ocadFileB = await readOcad(bufferB, { quietWarnings: true });
  const viewBounds = boundsFromOcadFile(ocadFileB);

  // Renderingarna delar parsad fil och körs efter varandra för att hålla minnestoppen nere.
  const addedSvg = await generateOcadSvgFiltered(bufferB, indices.added, viewBounds);
  await uploadFile(storagePaths.added, Buffer.from(addedSvg, "utf-8"));

  const modifiedSvg = await generateOcadSvgFiltered(bufferB, indices.modified, viewBounds);
  await uploadFile(storagePaths.modified, Buffer.from(modifiedSvg, "utf-8"));

  const removedSvg = await generateOcadSvgFiltered(bufferA, indices.removed, viewBounds);
  await uploadFile(storagePaths.removed, Buffer.from(removedSvg, "utf-8"));

  return { ...storagePaths, bounds: viewBounds };
}
