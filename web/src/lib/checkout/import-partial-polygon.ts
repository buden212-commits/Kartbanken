import { pointInPolygon } from "./overlap";
import type { Bbox, PolygonRing } from "./types";
import type { NormalizedOcadObject } from "@/lib/ocad/types";

const EPS = 1e-9;

function dist(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

function cross(
  o: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain. Returns CCW ring without repeating first point. */
export function convexHull(points: [number, number][]): PolygonRing {
  const unique = new Map<string, [number, number]>();
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    unique.set(`${point[0]},${point[1]}`, point);
  }
  const sorted = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted.map((p) => [p[0], p[1]] as [number, number]);

  const lower: [number, number][] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function pointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  epsilon = 1e-6,
): boolean {
  const crossVal = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(crossVal) > epsilon) return false;
  const dot = (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]);
  return dot <= epsilon;
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < EPS && pointOnSegment(p1, p3, p4)) return true;
  if (Math.abs(d2) < EPS && pointOnSegment(p2, p3, p4)) return true;
  if (Math.abs(d3) < EPS && pointOnSegment(p3, p1, p2)) return true;
  if (Math.abs(d4) < EPS && pointOnSegment(p4, p1, p2)) return true;
  return false;
}

function ringSelfIntersects(ring: PolygonRing): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * k-NN concave hull (Moreira & Santos). Falls back to convex hull if it fails.
 */
export function concaveHull(points: [number, number][], kStart = 3): PolygonRing {
  const unique = new Map<string, [number, number]>();
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    unique.set(`${point[0]},${point[1]}`, [point[0], point[1]]);
  }
  const dataset = [...unique.values()];
  if (dataset.length < 3) return dataset;
  if (dataset.length === 3) return dataset;

  const convex = convexHull(dataset);
  if (convex.length < 3) return convex;

  const maxK = Math.min(dataset.length - 1, Math.max(kStart, 30));

  for (let k = Math.min(kStart, dataset.length - 1); k <= maxK; k++) {
    const hull = tryConcaveHull(dataset, k);
    if (hull && hull.length >= 3 && !ringSelfIntersects(hull)) {
      return hull;
    }
  }

  return convex;
}

function tryConcaveHull(dataset: [number, number][], k: number): PolygonRing | null {
  // Start at the point with lowest Y (then leftmost).
  let current = dataset[0]!;
  for (const point of dataset) {
    if (point[1] < current[1] || (point[1] === current[1] && point[0] < current[0])) {
      current = point;
    }
  }

  const hull: PolygonRing = [current];
  const remaining = new Set(dataset.map((_, i) => i));
  const startIndex = dataset.findIndex((p) => p[0] === current[0] && p[1] === current[1]);
  if (startIndex < 0) return null;
  remaining.delete(startIndex);

  let previousAngle = Math.PI;
  const maxSteps = dataset.length * 2;

  for (let step = 0; step < maxSteps; step++) {
    const candidates = nearestIndices(dataset, current, remaining, k);
    if (candidates.length === 0) break;

    candidates.sort((ia, ib) => {
      const angleA = normalizeAngle(Math.atan2(
        dataset[ia]![1] - current[1],
        dataset[ia]![0] - current[0],
      ) - previousAngle);
      const angleB = normalizeAngle(Math.atan2(
        dataset[ib]![1] - current[1],
        dataset[ib]![0] - current[0],
      ) - previousAngle);
      return angleB - angleA;
    });

    let nextIndex: number | null = null;
    for (const candidate of candidates) {
      const candidatePoint = dataset[candidate]!;
      const intersects = hullEdgeIntersects(hull, current, candidatePoint);
      if (!intersects) {
        nextIndex = candidate;
        break;
      }
    }
    if (nextIndex == null) return null;

    const next = dataset[nextIndex]!;
    previousAngle = Math.atan2(current[1] - next[1], current[0] - next[0]);
    current = next;
    hull.push(current);
    remaining.delete(nextIndex);

    // Re-add start point when hull is long enough so we can close.
    if (hull.length >= 3) {
      remaining.add(startIndex);
    }

    if (current[0] === hull[0]![0] && current[1] === hull[0]![1] && hull.length > 3) {
      hull.pop();
      return hull;
    }
  }

  return null;
}

function normalizeAngle(angle: number): number {
  let value = angle;
  while (value < 0) value += Math.PI * 2;
  while (value >= Math.PI * 2) value -= Math.PI * 2;
  return value;
}

function nearestIndices(
  dataset: [number, number][],
  current: [number, number],
  remaining: Set<number>,
  k: number,
): number[] {
  const scored: { index: number; d: number }[] = [];
  for (const index of remaining) {
    const point = dataset[index]!;
    if (point[0] === current[0] && point[1] === current[1]) continue;
    scored.push({ index, d: dist(current, point) });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, k).map((entry) => entry.index);
}

function hullEdgeIntersects(
  hull: PolygonRing,
  from: [number, number],
  to: [number, number],
): boolean {
  if (hull.length < 2) return false;
  for (let i = 0; i < hull.length - 1; i++) {
    // Skip adjacent edge ending at `from`.
    if (i === hull.length - 2) continue;
    if (segmentsIntersect(hull[i]!, hull[i + 1]!, from, to)) return true;
  }
  return false;
}

export function collectObjectSamplePoints(object: NormalizedOcadObject): [number, number][] {
  const points: [number, number][] = [object.centroid];
  if (object.vertices && object.vertices.length > 0) {
    for (const vertex of object.vertices) {
      points.push(vertex);
    }
    return points;
  }

  const [minX, minY, maxX, maxY] = object.bbox;
  points.push([minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]);
  return points;
}

export function buildImportPolygonFromObjects(objects: NormalizedOcadObject[]): PolygonRing | null {
  if (objects.length === 0) return null;
  const points: [number, number][] = [];
  for (const object of objects) {
    for (const point of collectObjectSamplePoints(object)) {
      points.push(point);
    }
  }
  if (points.length === 0) return null;
  if (points.length === 1) {
    const [x, y] = points[0]!;
    const pad = 5;
    return [
      [x - pad, y - pad],
      [x + pad, y - pad],
      [x + pad, y + pad],
      [x - pad, y + pad],
    ];
  }
  if (points.length === 2) {
    const [a, b] = points;
    const pad = Math.max(5, dist(a!, b!) * 0.05);
    return [
      [a![0] - pad, a![1] - pad],
      [b![0] + pad, a![1] - pad],
      [b![0] + pad, b![1] + pad],
      [a![0] - pad, b![1] + pad],
    ];
  }

  const hull = concaveHull(points, 3);
  return hull.length >= 3 ? hull : convexHull(points);
}

export function bboxFromRing(ring: PolygonRing): Bbox | null {
  if (ring.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function expandRing(ring: PolygonRing, fraction = 0.01, minPad = 100): PolygonRing {
  const bbox = bboxFromRing(ring);
  if (!bbox || ring.length === 0) return ring;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const padX = Math.max((bbox.maxX - bbox.minX) * fraction, minPad);
  const padY = Math.max((bbox.maxY - bbox.minY) * fraction, minPad);
  const scaleX = bbox.maxX === bbox.minX ? 1 : 1 + (2 * padX) / (bbox.maxX - bbox.minX);
  const scaleY = bbox.maxY === bbox.minY ? 1 : 1 + (2 * padY) / (bbox.maxY - bbox.minY);
  return ring.map(([x, y]) => [cx + (x - cx) * scaleX, cy + (y - cy) * scaleY]);
}

export function edgeSnapForRing(ring: PolygonRing): number {
  const bbox = bboxFromRing(ring);
  if (!bbox) return 50;
  return Math.max(50, (bbox.maxX - bbox.minX) * 0.005, (bbox.maxY - bbox.minY) * 0.005);
}

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function distancePointToRing(px: number, py: number, ring: PolygonRing): number {
  if (ring.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    best = Math.min(best, distancePointToSegment(px, py, ax, ay, bx, by));
  }
  return best;
}

function objectSamplePointsForContainment(object: NormalizedOcadObject): [number, number][] {
  if (object.vertices && object.vertices.length >= 2) {
    return object.vertices;
  }
  const [minX, minY, maxX, maxY] = object.bbox;
  return [
    object.centroid,
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

export function objectIntersectsPolygon(object: NormalizedOcadObject, ring: PolygonRing): boolean {
  const bbox = bboxFromRing(ring);
  if (!bbox) return false;
  if (
    object.bbox[2] < bbox.minX ||
    object.bbox[0] > bbox.maxX ||
    object.bbox[3] < bbox.minY ||
    object.bbox[1] > bbox.maxY
  ) {
    return false;
  }

  if (pointInPolygon(object.centroid[0], object.centroid[1], ring)) {
    return true;
  }

  for (const [x, y] of objectSamplePointsForContainment(object)) {
    if (pointInPolygon(x, y, ring)) return true;
  }

  // Polygon vertex inside object bbox (covers large objects containing the excerpt).
  for (const [x, y] of ring) {
    if (
      x >= object.bbox[0] &&
      x <= object.bbox[2] &&
      y >= object.bbox[1] &&
      y <= object.bbox[3]
    ) {
      return true;
    }
  }

  return false;
}

export function objectFullyInsidePolygon(object: NormalizedOcadObject, ring: PolygonRing): boolean {
  const points = objectSamplePointsForContainment(object);
  return points.every(([x, y]) => pointInPolygon(x, y, ring));
}

export function objectCrossesPolygon(object: NormalizedOcadObject, ring: PolygonRing): boolean {
  if (!objectIntersectsPolygon(object, ring)) return false;
  return !objectFullyInsidePolygon(object, ring);
}

export function isLikelyClippedByPolygon(
  object: NormalizedOcadObject,
  ring: PolygonRing,
  snap?: number,
): boolean {
  const threshold = snap ?? edgeSnapForRing(ring);
  if (object.type !== "line" && object.type !== "area" && !(object.vertices && object.vertices.length >= 2)) {
    return false;
  }

  const points =
    object.vertices && object.vertices.length >= 2
      ? object.vertices
      : objectSamplePointsForContainment(object);

  const onEdge = points.filter(([x, y]) => distancePointToRing(x, y, ring) <= threshold);
  if (onEdge.length >= 2) return true;

  // Single endpoint glued to boundary is common for cut lines.
  if (object.type === "line" && points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const firstOn = distancePointToRing(first[0], first[1], ring) <= threshold;
    const lastOn = distancePointToRing(last[0], last[1], ring) <= threshold;
    if (firstOn || lastOn) {
      // Only treat as clipped if the object also reaches near the hull (not a short interior line).
      return objectCrossesPolygon(object, ring) || onEdge.length >= 1;
    }
  }

  return false;
}
