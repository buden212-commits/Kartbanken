import type { FieldEditObjectEntry } from "./object-index";
import {
  distance2d,
  nearestPointOnPolyline,
  projectPointOnSegment,
} from "./polyline-geometry";
import { resolveObjectCoordinates, type FieldEditOps } from "./types";
import { closedRing, verticesForHandles } from "./vertices";

export type SnapTargetKind = "vertex" | "segment" | "point";

export type SnapResult = {
  point: [number, number];
  kind: SnapTargetKind;
  objectIndex: number;
  distance: number;
};

type SnapCandidate = SnapResult;

function collectPolylineVertices(
  entry: FieldEditObjectEntry,
  ops: FieldEditOps,
): [number, number][] {
  const coords = resolveObjectCoordinates(entry.i, entry.v, ops);
  if (!coords || coords.length === 0) return [];
  if (entry.t === "area") return verticesForHandles(coords, entry.t);
  if (entry.t === "line") return coords;
  return [];
}

function snapPriority(kind: SnapTargetKind): number {
  switch (kind) {
    case "vertex":
      return 3;
    case "segment":
      return 2;
    case "point":
      return 1;
  }
}

/** Snap a map coordinate to nearby vertices, line segments, or point centroids. */
export function snapGeoPoint(
  point: [number, number],
  options: {
    objects: FieldEditObjectEntry[];
    ops: FieldEditOps;
    toleranceMapUnits: number;
    excludeObjectIndex?: number | null;
  },
): SnapResult | null {
  const { objects, ops, toleranceMapUnits, excludeObjectIndex = null } = options;
  if (!(toleranceMapUnits > 0)) return null;

  let best: SnapCandidate | null = null;

  const consider = (candidate: SnapCandidate) => {
    if (candidate.distance > toleranceMapUnits) return;
    if (
      !best ||
      candidate.distance < best.distance - 1e-6 ||
      (Math.abs(candidate.distance - best.distance) <= 1e-6 &&
        snapPriority(candidate.kind) > snapPriority(best.kind))
    ) {
      best = candidate;
    }
  };

  for (const entry of objects) {
    if (entry.i === excludeObjectIndex) continue;
    if (ops.deletes.includes(entry.i)) continue;

    if (entry.t === "point" || entry.t === "text") {
      const distance = distance2d(point, entry.c);
      consider({
        point: entry.c,
        kind: "point",
        objectIndex: entry.i,
        distance,
      });
      continue;
    }

    const polyline = collectPolylineVertices(entry, ops);
    if (polyline.length === 0) continue;

    for (const vertex of polyline) {
      consider({
        point: vertex,
        kind: "vertex",
        objectIndex: entry.i,
        distance: distance2d(point, vertex),
      });
    }

    const ring =
      entry.t === "area" && polyline.length >= 3
        ? closedRing(polyline)
        : polyline;
    const segmentCount = ring.length >= 2 ? ring.length - 1 : 0;
    for (let i = 0; i < segmentCount; i++) {
      const a = ring[i]!;
      const b = ring[i + 1]!;
      const projected = projectPointOnSegment(point, a, b);
      consider({
        point: projected.point,
        kind: "segment",
        objectIndex: entry.i,
        distance: distance2d(point, projected.point),
      });
    }

    if (entry.t === "line") {
      const nearest = nearestPointOnPolyline(point, polyline);
      if (nearest) {
        consider({
          point: nearest.point,
          kind: "segment",
          objectIndex: entry.i,
          distance: nearest.distance,
        });
      }
    }
  }

  return best;
}
