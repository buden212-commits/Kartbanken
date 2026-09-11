import { bboxFromGeometry } from "./overlap";
import { CheckoutSelectionType, type Bbox, type PolygonRing } from "./types";
import { compareOcadObjects } from "@/lib/ocad/diff";
import type { NormalizedOcadObject, OcadParseSummary } from "@/lib/ocad/types";
import type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
  ImportSymbolRow,
} from "./import-partial-types";
import {
  bboxFromRing,
  buildImportPolygonWithMeta,
  edgeSnapForRing,
  expandRing,
  filterObjectsIntersectingPolygon,
  IMPORT_EDGE_BUFFER_METERS,
  isLikelyClippedByPolygon,
  objectCrossesPolygon,
  objectFullyInsidePolygon,
  objectInEdgeBufferZone,
  shrinkRing,
} from "./import-partial-polygon";

export type {
  ImportDiffSample,
  ImportEdgeObject,
  ImportPartialAnalysis,
  ImportSymbolRow,
} from "./import-partial-types";

export {
  bboxFromRing,
  buildImportPolygonFromObjects,
  buildImportPolygonWithMeta,
  edgeSnapForRing,
  expandRing,
  filterObjectsIntersectingPolygon,
  IMPORT_EDGE_BUFFER_METERS,
  isLikelyClippedByPolygon,
  objectCrossesPolygon,
  objectFullyInsidePolygon,
  objectInEdgeBufferZone,
  objectIntersectsPolygon,
  shrinkRing,
} from "./import-partial-polygon";

const DIFF_TOLERANCE_M = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
const MAX_EDGE_SAMPLES = 80;
const MAX_DIFF_SAMPLES = 40;
const MAX_DIFF_MAP_SAMPLES = 300;
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

/** @deprecated Prefer objectIntersectsPolygon — retained for AABB helpers/tests. */
export function objectIntersectsBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  return (
    object.bbox[0] <= bbox.maxX &&
    object.bbox[2] >= bbox.minX &&
    object.bbox[1] <= bbox.maxY &&
    object.bbox[3] >= bbox.minY
  );
}

/** @deprecated Prefer objectCrossesPolygon. */
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

/** @deprecated Prefer isLikelyClippedByPolygon. */
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
  const polygon = buildImportPolygonWithMeta(input.partial.objects);
  const ring = polygon?.ring ?? null;
  const extent = ring ? bboxFromRing(ring) : bboxFromObjects(input.partial.objects);
  const headBounds = bboxFromTuple(input.head.bounds) ?? bboxFromObjects(input.head.objects);
  const snap = ring ? edgeSnapForRing(ring) : 50;

  if (!extent || !ring || input.partial.objects.length === 0) {
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

  const activeRing: PolygonRing = ring ?? [
    [0, 0],
    [0, 0],
    [0, 0],
  ];

  // AABB → polygon: hoppa över objekt långt från delkartan.
  const headInArea = ring
    ? filterObjectsIntersectingPolygon(input.head.objects, activeRing)
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

  const edgeObjects: ImportEdgeObject[] = [];
  let interiorCount = 0;
  let likelyClippedCount = 0;
  const clippedPartialIndices = new Set<number>();
  // Rutnätskonturen ligger en bit utanför de yttersta objekten (cellkanter +
  // ev. dilatering). Kompensera så att ~IMPORT_EDGE_BUFFER_METERS av verkligt
  // kartinnehåll skyddas, inte tom yta mellan datat och ringen.
  const edgeBufferMeters = Math.round(
    IMPORT_EDGE_BUFFER_METERS + (polygon?.edgeSlackMeters ?? 0),
  );
  const coreRing = ring ? shrinkRing(activeRing, edgeBufferMeters) : null;

  if (ring) {
    for (const object of input.partial.objects) {
      const crosses = objectCrossesPolygon(object, activeRing);
      const clipped = isLikelyClippedByPolygon(object, activeRing, snap);
      const inEdgeBelt = objectInEdgeBufferZone(object, activeRing, edgeBufferMeters);
      if (objectFullyInsidePolygon(object, activeRing) && !crosses && !clipped && !inEdgeBelt) {
        interiorCount += 1;
      }
      if (crosses || clipped || inEdgeBelt) {
        if (clipped) {
          likelyClippedCount += 1;
          clippedPartialIndices.add(object.objectIndex);
        }
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
      `${likelyClippedCount} objekt ser ut att vara klippta mot delkartans kant — de ingår inte i jämförelsen (ersätter inte originalet).`,
    );
  }

  const baseline = headInArea;
  const partialForDiff = input.partial.objects.filter(
    (object) => !clippedPartialIndices.has(object.objectIndex),
  );

  const diff = compareOcadObjects(
    baseline,
    partialForDiff,
    { fileNameA: input.head.fileName, fileNameB: input.partial.fileName },
    { toleranceMeters: DIFF_TOLERANCE_M, matchByObjectIndex: false },
  );

  // Skydda: överskridande + icke-klippta objekt i kantzonen (t.ex. sten nära snittet).
  const protectedRemovals = new Set(
    baseline
      .filter((object) => {
        if (!ring) return false;
        if (objectCrossesPolygon(object, activeRing)) return true;
        return objectInEdgeBufferZone(object, activeRing, edgeBufferMeters);
      })
      .map((o) => o.objectIndex),
  );

  const appliedChanges = diff.changes.filter((change) => {
    if (change.changeType === "added") {
      // Extra safety: never treat clipped stubs as new map content.
      return !clippedPartialIndices.has(change.objectIndex);
    }
    if (protectedRemovals.has(change.objectIndex)) return false;
    return true;
  });

  const skippedEdge = diff.changes.length - appliedChanges.length;
  if (skippedEdge > 0) {
    warnings.push(
      `${skippedEdge} kantnära eller överskridande objekt hoppades över i jämförelsen (skyddszon ca ${edgeBufferMeters} m från polygonkanten).`,
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
    ring: ring ?? [],
    coreRing: coreRing ?? [],
    edgeBufferMeters,
    headObjectsInArea: headInArea.length,
    headObjectsTotal: input.head.objects.length,
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
      samples: appliedChanges.slice(0, MAX_DIFF_SAMPLES).map(toDiffSample),
      mapChanges: appliedChanges.slice(0, MAX_DIFF_MAP_SAMPLES).map(toDiffSample),
    },
    blockers,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

export function selectionBboxFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return padBbox(analysis.extent);
}

export function checkoutGeometryFromAnalysis(analysis: ImportPartialAnalysis) {
  if (analysis.ring.length >= 3) {
    return {
      type: CheckoutSelectionType.POLYGON,
      ring: expandRing(analysis.ring),
    } as const;
  }
  const bbox = selectionBboxFromAnalysis(analysis);
  return {
    type: CheckoutSelectionType.BBOX,
    bbox,
  } as const;
}

export function importExtentFromAnalysis(analysis: ImportPartialAnalysis): Bbox {
  return analysis.extent;
}

export function importRingFromAnalysis(analysis: ImportPartialAnalysis): PolygonRing {
  return analysis.ring;
}

export { bboxFromGeometry };
