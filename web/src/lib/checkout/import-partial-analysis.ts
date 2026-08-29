import { bboxFromGeometry } from "./overlap";
import { CheckoutSelectionType, type Bbox, type CheckoutSelectionGeometry } from "./types";
import { compareOcadObjects } from "@/lib/ocad/diff";
import type { NormalizedOcadObject, OcadParseSummary } from "@/lib/ocad/types";
import type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
  ImportRiskRemoval,
  ImportSymbolRow,
} from "./import-partial-types";
import {
  IMPORT_RISK_ZONE_M,
  boundaryFromBbox,
  boundaryFromImportAreaSymbol,
  formatImportBoundarySymbolLabel,
  isImportBoundarySymbolObject,
  objectCrossesBoundary,
  objectFullyInsideBoundary,
  objectInRiskZone,
  objectIntersectsBoundary,
  shrinkBbox,
} from "./import-partial-boundary";

export type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
  ImportRiskRemoval,
  ImportSymbolRow,
} from "./import-partial-types";

export {
  IMPORT_RISK_ZONE_M,
  IMPORT_BOUNDARY_SYMBOL_NUM,
  boundaryFromBbox,
  boundaryFromImportAreaSymbol,
  bboxToRing,
  formatImportBoundarySymbolLabel,
  isImportBoundarySymbolObject,
  objectCrossesBoundary,
  objectFullyInsideBoundary,
  objectInRiskZone,
  objectInSafeZone,
  objectIntersectsBoundary,
  parseImportBoundary,
  shrinkBbox,
} from "./import-partial-boundary";

const DIFF_TOLERANCE_M = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
const MAX_EDGE_SAMPLES = 80;
const MAX_DIFF_SAMPLES = 40;
const MAX_DIFF_MAP_SAMPLES = 300;
const MAX_RISK_REMOVALS = 500;
const MAX_SYMBOL_ROWS = 80;

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
  /** Override automatic AABB boundary (e.g. user-drawn polygon). */
  boundary?: CheckoutSelectionGeometry;
}): ImportPartialAnalysis {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const headSymbolNums = new Set(input.head.symbolNums);
  const extent = bboxFromObjects(input.partial.objects);
  const headBounds = bboxFromTuple(input.head.bounds) ?? bboxFromObjects(input.head.objects);

  const symbolBoundary = boundaryFromImportAreaSymbol(input.partial.objects);
  let boundarySource: ImportPartialAnalysis["boundarySource"] = "extent";
  let boundary: CheckoutSelectionGeometry;
  if (input.boundary) {
    boundary = input.boundary;
    boundarySource = "manual";
  } else if (symbolBoundary) {
    boundary = symbolBoundary;
    boundarySource = "symbol-1104.001";
  } else {
    boundary = extent
      ? boundaryFromBbox(extent)
      : boundaryFromBbox({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    boundarySource = "extent";
  }
  const boundaryBbox = bboxFromGeometry(boundary);

  // Områdessymbolen är gräns, inte kartinnehåll som ska läggas till/ersättas.
  const partialMapObjects = input.partial.objects.filter(
    (object) => !isImportBoundarySymbolObject(object),
  );

  if (symbolBoundary) {
    warnings.push(
      `Importgräns från symbol ${formatImportBoundarySymbolLabel()} (områdespolygon i delkartan).`,
    );
  }

  if (!extent || input.partial.objects.length === 0) {
    blockers.push("Delkartan innehåller inga kartobjekt att importera.");
  } else if (partialMapObjects.length === 0) {
    blockers.push(
      `Delkartan innehåller bara områdessymbol ${formatImportBoundarySymbolLabel()} — inga kartobjekt att importera.`,
    );
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
  const partialUsed = usedSymbols(partialMapObjects);

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

  const headInArea = extent
    ? input.head.objects.filter((object) => objectIntersectsBoundary(object, boundary))
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

  const edgeSource = partialMapObjects;
  const edgeObjects: ImportEdgeObject[] = [];
  let interiorCount = 0;
  let likelyClippedCount = 0;

  if (extent) {
    for (const object of edgeSource) {
      const crosses = objectCrossesBoundary(object, boundary);
      const clipped = isLikelyClipped(object, boundaryBbox);
      if (objectFullyInsideBoundary(object, boundary) && !crosses) {
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
    ? input.head.objects.filter((object) => objectIntersectsBoundary(object, boundary))
    : [];
  const diff = compareOcadObjects(
    baseline,
    partialMapObjects,
    { fileNameA: input.head.fileName, fileNameB: input.partial.fileName },
    { toleranceMeters: DIFF_TOLERANCE_M, matchByObjectIndex: false },
  );

  const baselineByIndex = new Map(baseline.map((object) => [object.objectIndex, object]));
  const protectedCrossing = new Set<number>();
  const protectedRisk = new Set<number>();
  const riskRemovals: ImportRiskRemoval[] = [];

  for (const change of diff.changes) {
    if (change.changeType === "added") continue;
    const baselineObject = baselineByIndex.get(change.objectIndex);
    if (!baselineObject) continue;
    if (objectCrossesBoundary(baselineObject, boundary)) {
      protectedCrossing.add(change.objectIndex);
      continue;
    }
    if (change.changeType === "removed" && objectInRiskZone(baselineObject, boundary)) {
      protectedRisk.add(change.objectIndex);
      if (riskRemovals.length < MAX_RISK_REMOVALS) {
        riskRemovals.push({
          objectIndex: baselineObject.objectIndex,
          symbolNumber: baselineObject.symbolNumber,
          symbolName: baselineObject.symbolName,
          type: baselineObject.type,
          centroid: baselineObject.centroid,
          bbox: baselineObject.bbox,
        });
      }
    }
  }

  const appliedChanges = diff.changes.filter((change) => {
    if (change.changeType === "added") return true;
    if (protectedCrossing.has(change.objectIndex)) return false;
    if (change.changeType === "removed" && protectedRisk.has(change.objectIndex)) return false;
    return true;
  });

  if (protectedCrossing.size > 0) {
    warnings.push(
      `${protectedCrossing.size} kantöverskridande objekt i den stora kartan tas inte bort automatiskt (de går utanför importgränsen).`,
    );
  }
  if (riskRemovals.length > 0) {
    warnings.push(
      `${riskRemovals.length} objekt i riskzonen (${IMPORT_RISK_ZONE_M} m från kanten) skyddas från auto-radering — granska listan under Kanter.`,
    );
  }

  const added = appliedChanges.filter((c) => c.changeType === "added").length;
  const removed = appliedChanges.filter((c) => c.changeType === "removed").length;
  const modified = appliedChanges.filter((c) => c.changeType === "modified").length;

  const toDiffSample = (change: (typeof appliedChanges)[number]): ImportDiffSample => ({
    changeType: change.changeType,
    objectIndex: change.objectIndex,
    symbolNumber: change.symbolNumber,
    symbolName: change.symbolName,
    type: change.type,
    centroid: change.centroid,
    bbox: change.bbox,
  });

  matched.sort((a, b) => b.countPartial - a.countPartial);
  onlyInPartial.sort((a, b) => b.countPartial - a.countPartial);
  onlyInHeadUsedByPartialArea.sort((a, b) => a.number - b.number);

  return {
    extent: extent ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    boundary,
    boundarySource,
    riskZoneMeters: IMPORT_RISK_ZONE_M,
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
    riskRemovals,
    diff: {
      added,
      removed,
      modified,
      unchanged: diff.unchanged,
      samples: appliedChanges.slice(0, MAX_DIFF_SAMPLES).map(toDiffSample),
      mapChanges: appliedChanges.slice(0, MAX_DIFF_MAP_SAMPLES).map(toDiffSample),
    },
    blockers,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

export function selectionBboxFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return padBbox(bboxFromGeometry(analysis.boundary));
}

export function checkoutGeometryFromAnalysis(analysis: ImportPartialAnalysis) {
  const bbox = selectionBboxFromAnalysis(analysis);
  return {
    type: CheckoutSelectionType.BBOX,
    bbox,
  } as const;
}

/** Unpadded AABB used for OCD crop / extent storage. */
export function importExtentFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return bboxFromGeometry(analysis.boundary);
}

export function safeZoneBboxFromBoundary(
  boundary: CheckoutSelectionGeometry,
  riskMeters = IMPORT_RISK_ZONE_M,
): Bbox | null {
  return shrinkBbox(bboxFromGeometry(boundary), riskMeters);
}

export { bboxFromGeometry };
