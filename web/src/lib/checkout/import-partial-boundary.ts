import { bboxFromGeometry, pointInPolygon } from "./overlap";
import {
  CheckoutSelectionType,
  type Bbox,
  type CheckoutSelectionGeometry,
  type PolygonRing,
} from "./types";
import type { NormalizedOcadObject } from "@/lib/ocad/types";

/** Kantbuffert där auto-radering skyddas (meter). */
export const IMPORT_RISK_ZONE_M = 40;

/**
 * OCAD-symbol 1104.001 — om den finns som yta i delkartan används den som importgräns.
 * Lagras internt som 1104 * 1000 + 1.
 */
export const IMPORT_BOUNDARY_SYMBOL_NUM = 1104 * 1000 + 1;

export function formatImportBoundarySymbolLabel(): string {
  return "1104.001";
}

function objectIntersectsBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  return (
    object.bbox[0] <= bbox.maxX &&
    object.bbox[2] >= bbox.minX &&
    object.bbox[1] <= bbox.maxY &&
    object.bbox[3] >= bbox.minY
  );
}

function objectCrossesBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  if (!objectIntersectsBbox(object, bbox)) return false;
  return (
    object.bbox[0] < bbox.minX ||
    object.bbox[2] > bbox.maxX ||
    object.bbox[1] < bbox.minY ||
    object.bbox[3] > bbox.maxY
  );
}

function objectFullyInsideBbox(object: NormalizedOcadObject, bbox: Bbox): boolean {
  return (
    object.bbox[0] >= bbox.minX &&
    object.bbox[2] <= bbox.maxX &&
    object.bbox[1] >= bbox.minY &&
    object.bbox[3] <= bbox.maxY
  );
}

export function bboxToRing(bbox: Bbox): PolygonRing {
  return [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];
}

export function boundaryFromBbox(bbox: Bbox): CheckoutSelectionGeometry {
  return { type: CheckoutSelectionType.BBOX, bbox };
}

export function shrinkBbox(bbox: Bbox, meters: number): Bbox | null {
  const minX = bbox.minX + meters;
  const minY = bbox.minY + meters;
  const maxX = bbox.maxX - meters;
  const maxY = bbox.maxY - meters;
  if (!(minX < maxX) || !(minY < maxY)) return null;
  return { minX, minY, maxX, maxY };
}

export function boundaryRing(boundary: CheckoutSelectionGeometry): PolygonRing {
  if (boundary.type === CheckoutSelectionType.POLYGON) return boundary.ring;
  return bboxToRing(boundary.bbox);
}

export function objectIntersectsBoundary(
  object: NormalizedOcadObject,
  boundary: CheckoutSelectionGeometry,
): boolean {
  const outer = bboxFromGeometry(boundary);
  if (!objectIntersectsBbox(object, outer)) return false;
  if (boundary.type === CheckoutSelectionType.BBOX) return true;

  const ring = boundary.ring;
  if (pointInPolygon(object.centroid[0], object.centroid[1], ring)) return true;
  const [minX, minY, maxX, maxY] = object.bbox;
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  return corners.some(([x, y]) => pointInPolygon(x, y, ring));
}

export function objectCrossesBoundary(
  object: NormalizedOcadObject,
  boundary: CheckoutSelectionGeometry,
): boolean {
  const outer = bboxFromGeometry(boundary);
  if (boundary.type === CheckoutSelectionType.BBOX) {
    return objectCrossesBbox(object, outer);
  }
  if (!objectIntersectsBoundary(object, boundary)) return false;
  // Polygon: korsar om någon hörna ligger utanför ringen medan objektet ändå skär området.
  const ring = boundary.ring;
  const [minX, minY, maxX, maxY] = object.bbox;
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const anyOutside = corners.some(([x, y]) => !pointInPolygon(x, y, ring));
  const anyInside = corners.some(([x, y]) => pointInPolygon(x, y, ring));
  return anyOutside && anyInside;
}

export function objectFullyInsideBoundary(
  object: NormalizedOcadObject,
  boundary: CheckoutSelectionGeometry,
): boolean {
  if (boundary.type === CheckoutSelectionType.BBOX) {
    return objectFullyInsideBbox(object, boundary.bbox);
  }
  const ring = boundary.ring;
  const [minX, minY, maxX, maxY] = object.bbox;
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    object.centroid,
  ];
  return corners.every(([x, y]) => pointInPolygon(x, y, ring));
}

/**
 * Riskzon: inne i gränsen men inte i den inre säkra zonen (inset 40 m),
 * och inte kantöverskridande (de hanteras separat).
 */
export function objectInRiskZone(
  object: NormalizedOcadObject,
  boundary: CheckoutSelectionGeometry,
  riskMeters = IMPORT_RISK_ZONE_M,
): boolean {
  if (!objectIntersectsBoundary(object, boundary)) return false;
  if (objectCrossesBoundary(object, boundary)) return false;

  const outer = bboxFromGeometry(boundary);
  const safe = shrinkBbox(outer, riskMeters);
  if (!safe) return true;
  if (objectFullyInsideBbox(object, safe)) {
    if (boundary.type === CheckoutSelectionType.POLYGON) {
      return !pointInPolygon(object.centroid[0], object.centroid[1], boundary.ring);
    }
    return false;
  }
  return objectIntersectsBoundary(object, boundary);
}

export function objectInSafeZone(
  object: NormalizedOcadObject,
  boundary: CheckoutSelectionGeometry,
  riskMeters = IMPORT_RISK_ZONE_M,
): boolean {
  if (objectCrossesBoundary(object, boundary)) return false;
  const outer = bboxFromGeometry(boundary);
  const safe = shrinkBbox(outer, riskMeters);
  if (!safe) return false;
  if (!objectFullyInsideBbox(object, safe)) return false;
  if (boundary.type === CheckoutSelectionType.POLYGON) {
    return pointInPolygon(object.centroid[0], object.centroid[1], boundary.ring);
  }
  return true;
}

export function parseImportBoundary(value: unknown): CheckoutSelectionGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === CheckoutSelectionType.BBOX) {
    const bbox = record.bbox;
    if (!bbox || typeof bbox !== "object") return null;
    const box = bbox as Record<string, unknown>;
    const minX = Number(box.minX);
    const minY = Number(box.minY);
    const maxX = Number(box.maxX);
    const maxY = Number(box.maxY);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return { type: CheckoutSelectionType.BBOX, bbox: { minX, minY, maxX, maxY } };
  }
  if (record.type === CheckoutSelectionType.POLYGON) {
    const ring = record.ring;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const normalized: PolygonRing = [];
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) return null;
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      normalized.push([x, y]);
    }
    return { type: CheckoutSelectionType.POLYGON, ring: normalized };
  }
  return null;
}

function ringSignedArea(ring: PolygonRing): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function closeRing(ring: PolygonRing): PolygonRing {
  if (ring.length < 3) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/**
 * Hitta områdesobjekt med symbol 1104.001 och returnera den största ytan som polygon.
 */
export function boundaryFromImportAreaSymbol(
  objects: NormalizedOcadObject[],
  symbolNum = IMPORT_BOUNDARY_SYMBOL_NUM,
): CheckoutSelectionGeometry | null {
  let best: { ring: PolygonRing; area: number } | null = null;

  for (const object of objects) {
    if (object.symbolNumber !== symbolNum) continue;
    if (object.type !== "area" && object.type !== "line") continue;
    const verts = object.vertices;
    if (!verts || verts.length < 3) continue;
    const ring = closeRing(verts.map(([x, y]) => [x, y] as [number, number]));
    const area = Math.abs(ringSignedArea(ring));
    if (!best || area > best.area) {
      best = { ring, area };
    }
  }

  if (!best || best.area <= 0) return null;
  return { type: CheckoutSelectionType.POLYGON, ring: best.ring };
}

export function isImportBoundarySymbolObject(
  object: NormalizedOcadObject,
  symbolNum = IMPORT_BOUNDARY_SYMBOL_NUM,
): boolean {
  return object.symbolNumber === symbolNum;
}
