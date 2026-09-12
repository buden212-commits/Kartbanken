import { pointInPolygon } from "@/lib/checkout/overlap";
import { closedRing } from "@/lib/field-edit/vertices";
import type { FieldEditObjectEntry } from "./object-index";

function distance2d(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distancePointToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return distance2d(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return distance2d(p, [a[0] + t * dx, a[1] + t * dy]);
}

function minDistanceToPolyline(p: [number, number], vertices: [number, number][]): number {
  if (vertices.length === 0) return Infinity;
  if (vertices.length === 1) return distance2d(p, vertices[0]!);
  let best = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    best = Math.min(best, distancePointToSegment(p, vertices[i]!, vertices[i + 1]!));
  }
  return best;
}

function ringForAreaHit(vertices: [number, number][]): [number, number][] {
  return closedRing(vertices);
}

function hitDistance(entry: FieldEditObjectEntry, point: [number, number]): number {
  const verts = entry.v;
  if (entry.t === "point" || entry.t === "text") {
    return distance2d(point, entry.c);
  }
  if (entry.t === "line") {
    return minDistanceToPolyline(point, verts);
  }
  if (entry.t === "area") {
    const ring = ringForAreaHit(verts);
    if (ring.length >= 3 && pointInPolygon(point[0], point[1], ring)) {
      return 0;
    }
    return minDistanceToPolyline(point, ring.length >= 3 ? ring : verts);
  }
  return distance2d(point, entry.c);
}

function typePriority(type: FieldEditObjectEntry["t"]): number {
  switch (type) {
    case "area":
      return 3;
    case "line":
      return 2;
    case "point":
    case "text":
      return 1;
    default:
      return 0;
  }
}

export function hitTestFieldEditObject(
  index: FieldEditObjectEntry[],
  point: [number, number],
  maxDistance: number,
): FieldEditObjectEntry | null {
  return hitTestFieldEditObjects(index, point, maxDistance)[0] ?? null;
}

/** All hits within tolerance, nearest first; same distance prefers area > line > point. */
export function hitTestFieldEditObjects(
  index: FieldEditObjectEntry[],
  point: [number, number],
  maxDistance: number,
): FieldEditObjectEntry[] {
  const scored: { entry: FieldEditObjectEntry; dist: number; priority: number }[] = [];
  for (const entry of index) {
    const dist = hitDistance(entry, point);
    if (dist > maxDistance) continue;
    scored.push({ entry, dist, priority: typePriority(entry.t) });
  }
  scored.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return b.priority - a.priority;
  });
  return scored.map((row) => row.entry);
}

export function hitTestFieldEditVertex(
  coordinates: [number, number][],
  point: [number, number],
  maxDistance: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDist = maxDistance;
  for (let i = 0; i < coordinates.length; i++) {
    const dist = distance2d(point, coordinates[i]!);
    if (dist <= bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function geometryKindFromType(type: FieldEditObjectEntry["t"]): "point" | "line" | "area" {
  if (type === "line") return "line";
  if (type === "area") return "area";
  return "point";
}
