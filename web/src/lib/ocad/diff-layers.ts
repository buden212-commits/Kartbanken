import type { OcadObjectChange } from "./diff-types";
import type { SvgBounds } from "./svg-utils";
import { generateOcadSvgFiltered, generateOcadSvg } from "./svg";
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

async function resolveViewBounds(bufferB: Buffer): Promise<SvgBounds> {
  const { bounds } = await generateOcadSvg(bufferB);
  if (bounds) return bounds;

  const ocadFile = await readOcad(bufferB, { quietWarnings: true });
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
  const addedIndices = new Set(
    changes.filter((c) => c.changeType === "added").map((c) => c.objectIndex),
  );
  const removedIndices = new Set(
    changes.filter((c) => c.changeType === "removed").map((c) => c.objectIndex),
  );
  const modifiedIndices = new Set(
    changes.filter((c) => c.changeType === "modified").map((c) => c.objectIndex),
  );

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
  const viewBounds = await resolveViewBounds(bufferB);

  const paths = storagePaths;

  const [addedSvg, removedSvg, modifiedSvg] = await Promise.all([
    generateOcadSvgFiltered(bufferB, indices.added, viewBounds),
    generateOcadSvgFiltered(bufferA, indices.removed, viewBounds),
    generateOcadSvgFiltered(bufferB, indices.modified, viewBounds),
  ]);

  await Promise.all([
    uploadFile(paths.added, Buffer.from(addedSvg, "utf-8")),
    uploadFile(paths.removed, Buffer.from(removedSvg, "utf-8")),
    uploadFile(paths.modified, Buffer.from(modifiedSvg, "utf-8")),
  ]);

  return { ...paths, bounds: viewBounds };
}
