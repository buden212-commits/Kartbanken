import { pointInPolygon } from "@/lib/checkout/overlap";
import {
  distance2d,
  nearestPointOnPolyline,
  projectPointOnSegment,
} from "@/lib/field-edit/polyline-geometry";
import { closedRing, isClosedRing, verticesForHandles } from "@/lib/field-edit/vertices";

function clonePoint(p: [number, number]): [number, number] {
  return [p[0], p[1]];
}

function almostEqual(a: [number, number], b: [number, number], eps = 1e-3): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}

function openRing(ring: [number, number][]): [number, number][] {
  return verticesForHandles(ring, "area").map(clonePoint);
}

/** Absolute area in map units² (shoelace). */
export function polygonAreaAbs(ring: [number, number][]): number {
  const closed = closedRing(openRing(ring));
  if (closed.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [x1, y1] = closed[i]!;
    const [x2, y2] = closed[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Split an open polyline at a point on segment `segmentIndex`.
 * Returns null if either part would have fewer than 2 points.
 */
export function splitLineAtPoint(
  coordinates: [number, number][],
  segmentIndex: number,
  point: [number, number],
): { a: [number, number][]; b: [number, number][] } | null {
  if (coordinates.length < 2) return null;
  if (segmentIndex < 0 || segmentIndex >= coordinates.length - 1) return null;

  const a = coordinates.slice(0, segmentIndex + 1).map(clonePoint);
  const bStart = clonePoint(point);
  if (!almostEqual(a[a.length - 1]!, bStart)) {
    a.push(bStart);
  }
  const b = [bStart, ...coordinates.slice(segmentIndex + 1).map(clonePoint)];
  // Drop duplicate if point coincides with segment end
  if (b.length >= 2 && almostEqual(b[0]!, b[1]!)) {
    b.shift();
  }
  if (a.length < 2 || b.length < 2) return null;
  return { a, b };
}

/**
 * Cut a gap from a polyline between two points on it (ordered along the line).
 * The middle portion is removed; returns the two remaining parts.
 */
export function cutLineGap(
  coordinates: [number, number][],
  startSegment: number,
  startPoint: [number, number],
  endSegment: number,
  endPoint: [number, number],
): { a: [number, number][]; b: [number, number][] } | null {
  if (coordinates.length < 2) return null;

  let sSeg = startSegment;
  let sPt = startPoint;
  let eSeg = endSegment;
  let ePt = endPoint;

  // Order so start is earlier along the polyline
  const startT =
    sSeg + projectPointOnSegment(sPt, coordinates[sSeg]!, coordinates[sSeg + 1]!).t;
  const endT =
    eSeg + projectPointOnSegment(ePt, coordinates[eSeg]!, coordinates[eSeg + 1]!).t;
  if (endT < startT) {
    [sSeg, eSeg] = [eSeg, sSeg];
    [sPt, ePt] = [ePt, sPt];
  }
  if (Math.abs(endT - startT) < 1e-6) return null;

  const left = splitLineAtPoint(coordinates, sSeg, sPt);
  if (!left) return null;
  // Recompute end on the right part of a full split at start, then at end on original
  const rightSplit = splitLineAtPoint(coordinates, eSeg, ePt);
  if (!rightSplit) return null;

  const a = left.a;
  const b = rightSplit.b;
  if (a.length < 2 || b.length < 2) return null;
  return { a, b };
}

/** Insert a boundary point into an open ring; returns expanded ring and vertex index. */
function insertOnRing(
  ring: [number, number][],
  segmentIndex: number,
  point: [number, number],
): { ring: [number, number][]; index: number } {
  const n = ring.length;
  const a = ring[segmentIndex]!;
  const b = ring[(segmentIndex + 1) % n]!;
  if (almostEqual(point, a)) return { ring: ring.map(clonePoint), index: segmentIndex };
  if (almostEqual(point, b)) return { ring: ring.map(clonePoint), index: (segmentIndex + 1) % n };

  const next = ring.map(clonePoint);
  const insertAt = segmentIndex + 1;
  next.splice(insertAt, 0, clonePoint(point));
  return { ring: next, index: insertAt };
}

function walkForwardExclusive(
  ring: [number, number][],
  from: number,
  to: number,
): [number, number][] {
  const n = ring.length;
  if (n === 0 || from === to) return [];
  const out: [number, number][] = [];
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + 1) % n;
    out.push(clonePoint(ring[i]!));
    if (i === to) break;
  }
  return out;
}

/**
 * Split an area by a cut polyline that starts and ends on the border.
 */
export function splitAreaByCutLine(
  areaRing: [number, number][],
  cutLine: [number, number][],
  borderTolerance: number,
): { a: [number, number][]; b: [number, number][] } | null {
  if (cutLine.length < 2) return null;
  let working = openRing(areaRing);
  if (working.length < 3) return null;

  const startNear = nearestPointOnPolyline(cutLine[0]!, closedRing(working));
  const endNear = nearestPointOnPolyline(cutLine[cutLine.length - 1]!, closedRing(working));
  if (!startNear || !endNear) return null;
  if (startNear.distance > borderTolerance || endNear.distance > borderTolerance) {
    return null;
  }

  type Tagged = {
    seg: number;
    t: number;
    point: [number, number];
    tag: "s" | "e";
  };
  const startT = projectPointOnSegment(
    startNear.point,
    working[startNear.segmentIndex]!,
    working[(startNear.segmentIndex + 1) % working.length]!,
  ).t;
  const endT = projectPointOnSegment(
    endNear.point,
    working[endNear.segmentIndex]!,
    working[(endNear.segmentIndex + 1) % working.length]!,
  ).t;

  const tagged: Tagged[] = [
    { seg: startNear.segmentIndex, t: startT, point: startNear.point, tag: "s" },
    { seg: endNear.segmentIndex, t: endT, point: endNear.point, tag: "e" },
  ];
  // Insert later segment / higher t first so earlier indices stay valid.
  tagged.sort((a, b) => b.seg - a.seg || b.t - a.t);

  const indices: { s?: number; e?: number } = {};
  for (const item of tagged) {
    const nearest = nearestPointOnPolyline(item.point, closedRing(working));
    if (!nearest) return null;
    const beforeLen = working.length;
    const inserted = insertOnRing(working, nearest.segmentIndex, nearest.point);
    working = inserted.ring;
    const grew = working.length > beforeLen;
    for (const key of ["s", "e"] as const) {
      const prev = indices[key];
      if (prev != null && grew && inserted.index <= prev) {
        indices[key] = prev + 1;
      }
    }
    indices[item.tag] = inserted.index;
  }

  // Re-pin exact vertex indices after inserts
  function vertexIndexOf(point: [number, number]): number | null {
    for (let i = 0; i < working.length; i++) {
      if (almostEqual(working[i]!, point)) return i;
    }
    const near = nearestPointOnPolyline(point, closedRing(working));
    if (!near) return null;
    return near.segmentIndex; // fallback to segment start — imperfect
  }
  const startIdx = vertexIndexOf(startNear.point);
  const endIdx = vertexIndexOf(endNear.point);
  if (startIdx == null || endIdx == null || startIdx === endIdx) return null;

  const cutInterior = cutLine.slice(1, -1).map(clonePoint);
  const cutForward: [number, number][] = [
    clonePoint(working[startIdx]!),
    ...cutInterior,
    clonePoint(working[endIdx]!),
  ];

  const pathStartToEnd = walkForwardExclusive(working, startIdx, endIdx);
  const pathEndToStart = walkForwardExclusive(working, endIdx, startIdx);

  const partA = [...cutForward, ...pathEndToStart.slice(0, -1)];
  const cutReverse = [...cutForward].reverse();
  const partB = [...cutReverse, ...pathStartToEnd.slice(0, -1)];

  if (openRing(partA).length < 3 || openRing(partB).length < 3) return null;

  return {
    a: closedRing(openRing(partA)),
    b: closedRing(openRing(partB)),
  };
}

/** True if every hole vertex lies inside the outer ring. */
export function holeIsInsideOuter(
  outer: [number, number][],
  hole: [number, number][],
): boolean {
  const outerClosed = closedRing(openRing(outer));
  const holeOpen = openRing(hole.length >= 3 && isClosedRing(hole) ? hole : closedRing(hole));
  if (holeOpen.length < 3) return false;
  return holeOpen.every(([x, y]) => pointInPolygon(x, y, outerClosed));
}

/**
 * Normalize a hole ring (open handles preferred for editing; closed for storage).
 */
export function normalizeHoleRing(hole: [number, number][]): [number, number][] | null {
  const open = openRing(hole.length >= 3 ? hole : []);
  if (open.length < 3) return null;
  return closedRing(open);
}

export function findLineCutHit(
  coordinates: [number, number][],
  point: [number, number],
  maxDistance: number,
): { segmentIndex: number; point: [number, number] } | null {
  const nearest = nearestPointOnPolyline(point, coordinates);
  if (!nearest || nearest.distance > maxDistance) return null;
  return { segmentIndex: nearest.segmentIndex, point: nearest.point };
}

export function isPointNearRingBorder(
  ring: [number, number][],
  point: [number, number],
  maxDistance: number,
): boolean {
  const nearest = nearestPointOnPolyline(point, closedRing(openRing(ring)));
  return nearest != null && nearest.distance <= maxDistance;
}
