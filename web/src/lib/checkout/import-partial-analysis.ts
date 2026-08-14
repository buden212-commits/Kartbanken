import { bboxFromGeometry } from "./overlap";
import { CheckoutSelectionType, type Bbox } from "./types";
import { compareOcadObjects } from "@/lib/ocad/diff";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { NormalizedOcadObject, OcadParseSummary } from "@/lib/ocad/types";

const DIFF_TOLERANCE_M = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
const MAX_EDGE_SAMPLES = 80;
const MAX_DIFF_SAMPLES = 40;
const MAX_SYMBOL_ROWS = 80;

export type ImportSymbolRow = {
  number: number;
  nameHead: string;
  namePartial: string;
  countPartial: number;
};

export type ImportEdgeObject = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: NormalizedOcadObject["type"];
  centroid: [number, number];
  bbox: [number, number, number, number];
  likelyClipped: boolean;
};

export type ImportDiffSample = {
  changeType: OcadObjectChange["changeType"];
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectChange["type"];
  centroid: [number, number];
};

export type ImportPartialAnalysis = {
  extent: Bbox;
  extentInsideHead: boolean;
  headBounds: Bbox | null;
  symbols: {
    matched: ImportSymbolRow[];
    onlyInPartial: ImportSymbolRow[];
    onlyInHeadUsedByPartialArea: ImportSymbolRow[];
  };
  interiorCount: number;
  edgeCount: number;
  likelyClippedCount: number;
  edgeObjects: ImportEdgeObject[];
  diff: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    samples: ImportDiffSample[];
  };
  blockers: string[];
  warnings: string[];
};

function bboxFromTuple(bounds: number[] | null): Bbox | null {
  if (!bounds || bounds.length < 4) return null;
  const minX = Math.min(bounds[0]!, bounds[2]!);
  const minY = Math.min(bounds[1]!, bounds[3]!);
  const maxX = Math.max(bounds[0]!, bounds[2]!);
  const maxY = Math.max(bounds[1]!, bounds[3]!);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

export function bboxFromObjects(objects: NormalizedOcadObject[]): Bbox | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    minX = Math.min(minX, object.bbox[0], object.centroid[0]);
    minY = Math.min(minY, object.bbox[1], object.centroid[1]);
    maxX = Math.max(maxX, object.bbox[2], object.centroid[0]);
    maxY = Math.max(maxY, object.bbox[3], object.centroid[1]);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function padBbox(bbox: Bbox, fraction = 0.01, minPad = 100): Bbox {
  const padX = Math.max((bbox.maxX - bbox.minX) * fraction, minPad);
  const padY = Math.max((bbox.maxY - bbox.minY) * fraction, minPad);
  return {
    minX: bbox.minX - padX,
    minY: bbox.minY - padY,
    maxX: bbox.maxX + padX,
    maxY: bbox.maxY + padY,
  };
}

function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

export function objectIntersectsBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  return (
    object.bbox[0] <= bbox.maxX &&
    object.bbox[2] >= bbox.minX &&
    object.bbox[1] <= bbox.maxY &&
    object.bbox[3] >= bbox.minY
  );
}

export function objectCrossesBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  if (!objectIntersectsBbox(object, bbox)) return false;
  return (
    object.bbox[0] < bbox.minX ||
    object.bbox[2] > bbox.maxX ||
    object.bbox[1] < bbox.minY ||
    object.bbox[3] > bbox.maxY
  );
}

export function objectFullyInsideBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  return (
    object.bbox[0] >= bbox.minX &&
    object.bbox[2] <= bbox.maxX &&
    object.bbox[1] >= bbox.minY &&
    object.bbox[3] <= bbox.maxY
  );
}

function edgeSnap(extent: Bbox): number {
  return Math.max(50, (extent.maxX - extent.minX) * 0.005, (extent.maxY - extent.minY) * 0.005);
}

export function isLikelyClipped(object: NormalizedOcadObject, extent: Bbox): boolean {
  const snap = edgeSnap(extent);
  if (object.vertices && object.vertices.length >= 2) {
    const onEdge = object.vertices.filter(([x, y]) => {
      return (
        Math.abs(x - extent.minX) <= snap ||
        Math.abs(x - extent.maxX) <= snap ||
        Math.abs(y - extent.minY) <= snap ||
        Math.abs(y - extent.maxY) <= snap
      );
    });
    return onEdge.length >= 2;
  }

  if (object.type !== "line" && object.type !== "area") return false;
  const [minX, minY, maxX, maxY] = object.bbox;
  let sides = 0;
  if (Math.abs(minX - extent.minX) <= snap) sides += 1;
  if (Math.abs(maxX - extent.maxX) <= snap) sides += 1;
  if (Math.abs(minY - extent.minY) <= snap) sides += 1;
  if (Math.abs(maxY - extent.maxY) <= snap) sides += 1;
  return sides >= 2;
}

function usedSymbols(
  objects: NormalizedOcadObject[],
): Map<number, { name: string; count: number }> {
  const map = new Map<number, { name: string; count: number }>();
  for (const object of objects) {
    const current = map.get(object.symbolNumber) ?? { name: object.symbolName, count: 0 };
    current.count += 1;
    if (!current.name) current.name = object.symbolName;
    map.set(object.symbolNumber, current);
  }
  return map;
}

export function analyzeImportPartial(input: {
  head: OcadParseSummary;
  partial: OcadParseSummary;
}): ImportPartialAnalysis {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const headSymbolNums = new Set(input.head.symbolNums);
  const extent = bboxFromObjects(input.partial.objects);
  const headBounds = bboxFromTuple(input.head.bounds) ?? bboxFromObjects(input.head.objects);

  if (!extent || input.partial.objects.length === 0) {
    blockers.push("Delkartan innehåller inga kartobjekt att importera.");
  }

  const extentInsideHead =
    !!extent && !!headBounds && (bboxContains(headBounds, extent) || bboxesOverlap(headBounds, extent));

  if (extent && headBounds && !bboxesOverlap(headBounds, extent)) {
    blockers.push(
      "Delkartans utbredning hamnar utanför den stora kartan. Kontrollera origo, skala och att filerna är samma karta.",
    );
  } else if (extent && headBounds && !bboxContains(headBounds, extent)) {
    warnings.push("Delkartan sticker utanför den stora kartans gräns — kontrollera läget på kartan.");
  }

  const headUsed = usedSymbols(input.head.objects);
  const partialUsed = usedSymbols(input.partial.objects);

  const matched: ImportSymbolRow[] = [];
  const onlyInPartial: ImportSymbolRow[] = [];

  for (const [number, usage] of partialUsed) {
    const inHeadTable = headSymbolNums.has(number) || headUsed.has(number);
    const headName = headUsed.get(number)?.name ?? "";
    const row: ImportSymbolRow = {
      number,
      nameHead: headName || (inHeadTable ? `Symbol ${number}` : ""),
      namePartial: usage.name,
      countPartial: usage.count,
    };
    if (inHeadTable) {
      matched.push(row);
      if (headName && usage.name && headName !== usage.name) {
        warnings.push(`Symbol ${number} har olika namn: «${headName}» mot «${usage.name}».`);
      }
    } else {
      onlyInPartial.push(row);
    }
  }

  if (onlyInPartial.length > 0) {
    const preview = onlyInPartial
      .slice(0, 8)
      .map((row) => `${row.number} ${row.namePartial}`.trim())
      .join(", ");
    blockers.push(
      `Delkartan använder symboler som saknas i den stora kartan (${onlyInPartial.length} st): ${preview}. Importera inte förrän symboluppsättningen stämmer.`,
    );
  }

  const extentForHead = extent ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const headInArea = extent
    ? input.head.objects.filter((object) => objectIntersectsBbox(object, extentForHead))
    : [];

  const onlyInHeadUsedByPartialArea: ImportSymbolRow[] = [];
  const partialNums = new Set(partialUsed.keys());
  const headAreaUsed = usedSymbols(headInArea);
  for (const [number, usage] of headAreaUsed) {
    if (partialNums.has(number)) continue;
    onlyInHeadUsedByPartialArea.push({
      number,
      nameHead: usage.name,
      namePartial: "",
      countPartial: 0,
    });
  }

  const edgeSource = input.partial.objects;
  const edgeObjects: ImportEdgeObject[] = [];
  let interiorCount = 0;
  let likelyClippedCount = 0;

  if (extent) {
    for (const object of edgeSource) {
      const crosses = objectCrossesBbox(object, extent);
      const clipped = isLikelyClipped(object, extent);
      if (objectFullyInsideBbox(object, extent) && !crosses) {
        interiorCount += 1;
      }
      if (crosses || clipped) {
        if (clipped) likelyClippedCount += 1;
        if (edgeObjects.length < MAX_EDGE_SAMPLES) {
          edgeObjects.push({
            objectIndex: object.objectIndex,
            symbolNumber: object.symbolNumber,
            symbolName: object.symbolName,
            type: object.type,
            centroid: object.centroid,
            bbox: object.bbox,
            likelyClipped: clipped,
          });
        }
      }
    }
  }

  if (likelyClippedCount > 0) {
    warnings.push(
      `${likelyClippedCount} objekt ser ut att sluta vid randen — de kan vara klippta i OCAD och ska inte ersätta originalet utanför området.`,
    );
  }

  const baseline = extent
    ? input.head.objects.filter((object) => objectIntersectsBbox(object, extent))
    : [];
  const diff = compareOcadObjects(
    baseline,
    input.partial.objects,
    { fileNameA: input.head.fileName, fileNameB: input.partial.fileName },
    { toleranceMeters: DIFF_TOLERANCE_M, matchByObjectIndex: false },
  );

  const protectedRemovals = new Set(
    baseline.filter((object) => extent && objectCrossesBbox(object, extent)).map((o) => o.objectIndex),
  );

  const appliedChanges = diff.changes.filter((change) => {
    if (change.changeType === "added") return true;
    if (protectedRemovals.has(change.objectIndex)) return false;
    return true;
  });

  const skippedEdge = diff.changes.length - appliedChanges.length;
  if (skippedEdge > 0) {
    warnings.push(
      `${skippedEdge} kantöverskridande objekt i den stora kartan tas inte bort automatiskt (de går utanför delkartans ram).`,
    );
  }

  const added = appliedChanges.filter((c) => c.changeType === "added").length;
  const removed = appliedChanges.filter((c) => c.changeType === "removed").length;
  const modified = appliedChanges.filter((c) => c.changeType === "modified").length;

  matched.sort((a, b) => b.countPartial - a.countPartial);
  onlyInPartial.sort((a, b) => b.countPartial - a.countPartial);
  onlyInHeadUsedByPartialArea.sort((a, b) => a.number - b.number);

  return {
    extent: extent ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    extentInsideHead,
    headBounds,
    symbols: {
      matched: matched.slice(0, MAX_SYMBOL_ROWS),
      onlyInPartial: onlyInPartial.slice(0, MAX_SYMBOL_ROWS),
      onlyInHeadUsedByPartialArea: onlyInHeadUsedByPartialArea.slice(0, MAX_SYMBOL_ROWS),
    },
    interiorCount,
    edgeCount: edgeObjects.length,
    likelyClippedCount,
    edgeObjects,
    diff: {
      added,
      removed,
      modified,
      unchanged: diff.unchanged,
      samples: appliedChanges.slice(0, MAX_DIFF_SAMPLES).map((change) => ({
        changeType: change.changeType,
        objectIndex: change.objectIndex,
        symbolNumber: change.symbolNumber,
        symbolName: change.symbolName,
        type: change.type,
        centroid: change.centroid,
      })),
    },
    blockers,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

export function selectionBboxFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return padBbox(analysis.extent);
}

export function checkoutGeometryFromAnalysis(analysis: ImportPartialAnalysis) {
  const bbox = selectionBboxFromAnalysis(analysis);
  return {
    type: CheckoutSelectionType.BBOX,
    bbox,
  } as const;
}

export function importExtentFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return analysis.extent;
}

export { bboxFromGeometry };
