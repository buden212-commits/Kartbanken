import {
  CheckoutSelectionType,
  type Bbox,
  type CheckoutOverlapConflict,
  type CheckoutSelection,
  type CheckoutSelectionGeometry,
  type ExistingCheckoutForOverlap,
  type PolygonRing,
} from "./types";

function normalizeBbox(bbox: Bbox): Bbox {
  return {
    minX: Math.min(bbox.minX, bbox.maxX),
    minY: Math.min(bbox.minY, bbox.maxY),
    maxX: Math.max(bbox.minX, bbox.maxX),
    maxY: Math.max(bbox.minY, bbox.maxY),
  };
}

export function bboxFromGeometry(geometry: CheckoutSelectionGeometry): Bbox {
  if (geometry.type === CheckoutSelectionType.BBOX) {
    return normalizeBbox(geometry.bbox);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of geometry.ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

export function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  const boxA = normalizeBbox(a);
  const boxB = normalizeBbox(b);
  return !(
    boxA.maxX < boxB.minX ||
    boxA.minX > boxB.maxX ||
    boxA.maxY < boxB.minY ||
    boxA.minY > boxB.maxY
  );
}

export function sharedObjectIds(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  const setB = new Set(b);
  return [...new Set(a.filter((id) => setB.has(id)))];
}

function pointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  epsilon = 1e-9,
): boolean {
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= epsilon;
}

export function pointInPolygon(x: number, y: number, ring: PolygonRing): boolean {
  if (ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;

    if (pointOnSegment(x, y, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function orientation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (
    Math.min(ax, bx) - 1e-9 <= cx &&
    cx <= Math.max(ax, bx) + 1e-9 &&
    Math.min(ay, by) - 1e-9 <= cy &&
    cy <= Math.max(ay, by) + 1e-9
  );
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const o1 = orientation(x1, y1, x2, y2, x3, y3);
  const o2 = orientation(x1, y1, x2, y2, x4, y4);
  const o3 = orientation(x3, y3, x4, y4, x1, y1);
  const o4 = orientation(x3, y3, x4, y4, x2, y2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(x1, y1, x2, y2, x3, y3)) return true;
  if (o2 === 0 && onSegment(x1, y1, x2, y2, x4, y4)) return true;
  if (o3 === 0 && onSegment(x3, y3, x4, y4, x1, y1)) return true;
  if (o4 === 0 && onSegment(x3, y3, x4, y4, x2, y2)) return true;
  return false;
}

function ringEdges(ring: PolygonRing): [[number, number], [number, number]][] {
  const edges: [[number, number], [number, number]][] = [];
  for (let i = 0; i < ring.length; i++) {
    edges.push([ring[i]!, ring[(i + 1) % ring.length]!]);
  }
  return edges;
}

function bboxToRing(bbox: Bbox): PolygonRing {
  const box = normalizeBbox(bbox);
  return [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ];
}

function polygonRingOverlap(a: PolygonRing, b: PolygonRing): boolean {
  for (const [x, y] of a) {
    if (pointInPolygon(x, y, b)) return true;
  }
  for (const [x, y] of b) {
    if (pointInPolygon(x, y, a)) return true;
  }

  const edgesA = ringEdges(a);
  const edgesB = ringEdges(b);
  for (const [p1, p2] of edgesA) {
    for (const [p3, p4] of edgesB) {
      if (segmentsIntersect(p1, p2, p3, p4)) return true;
    }
  }

  return false;
}

export function geometriesOverlap(a: CheckoutSelectionGeometry, b: CheckoutSelectionGeometry): boolean {
  if (!bboxesOverlap(bboxFromGeometry(a), bboxFromGeometry(b))) {
    return false;
  }

  const ringA = a.type === CheckoutSelectionType.POLYGON ? a.ring : bboxToRing(a.bbox);
  const ringB = b.type === CheckoutSelectionType.POLYGON ? b.ring : bboxToRing(b.bbox);
  return polygonRingOverlap(ringA, ringB);
}

export function selectionsOverlap(a: CheckoutSelection, b: CheckoutSelection): boolean {
  return geometriesOverlap(a.geometry, b.geometry);
}

function formatUserLabel(checkout: ExistingCheckoutForOverlap): string {
  return checkout.userName?.trim() || checkout.userEmail;
}

function buildConflictMessage(
  checkout: ExistingCheckoutForOverlap,
  reason: CheckoutOverlapConflict["reason"],
  overlappingObjectIds: string[],
): string {
  const userLabel = formatUserLabel(checkout);
  if (reason === "objectIds") {
    const count = overlappingObjectIds.length;
    return `Området delar ${count} kartobjekt med en aktiv checkout av ${userLabel}.`;
  }
  if (reason === "both") {
    return `Området överlappar och delar kartobjekt med en aktiv checkout av ${userLabel}.`;
  }
  return `Området överlappar en aktiv checkout av ${userLabel}.`;
}

export function detectCheckoutConflicts(
  selection: CheckoutSelection,
  activeCheckouts: ExistingCheckoutForOverlap[],
): CheckoutOverlapConflict[] {
  const conflicts: CheckoutOverlapConflict[] = [];

  for (const checkout of activeCheckouts) {
    const geometryOverlap = selectionsOverlap(selection, checkout.selection);
    const overlappingObjectIds = sharedObjectIds(selection.objectIds, checkout.selection.objectIds);

    if (!geometryOverlap && overlappingObjectIds.length === 0) {
      continue;
    }

    const reason: CheckoutOverlapConflict["reason"] =
      geometryOverlap && overlappingObjectIds.length > 0
        ? "both"
        : geometryOverlap
          ? "geometry"
          : "objectIds";

    conflicts.push({
      checkoutId: checkout.id,
      userId: checkout.userId,
      userLabel: formatUserLabel(checkout),
      reason,
      overlappingObjectIds,
      message: buildConflictMessage(checkout, reason, overlappingObjectIds),
    });
  }

  return conflicts;
}

export function hasCheckoutConflict(
  selection: CheckoutSelection,
  activeCheckouts: ExistingCheckoutForOverlap[],
): boolean {
  return detectCheckoutConflicts(selection, activeCheckouts).length > 0;
}
