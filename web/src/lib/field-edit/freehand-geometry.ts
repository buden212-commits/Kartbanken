import { metersToMapUnits } from "@/lib/ocad/crs";
import { douglasPeucker } from "@/lib/suggestion/gps-track";
import { distance2d } from "@/lib/field-edit/polyline-geometry";

/** OCAD-style freehand smoothing factor (1 = least, 3 = most). */
export type FreehandSmoothingFactor = 1 | 2 | 3;

export function isFreehandSmoothingFactor(value: unknown): value is FreehandSmoothingFactor {
  return value === 1 || value === 2 || value === 3;
}

/** Minimum spacing between sampled points while tracing (meters on ground). */
export function freehandMinSampleDistanceM(factor: FreehandSmoothingFactor): number {
  switch (factor) {
    case 1:
      return 0.35;
    case 2:
      return 0.7;
    case 3:
      return 1.2;
  }
}

/** Douglas–Peucker tolerance applied when finishing (meters on ground). */
export function freehandSimplifyToleranceM(factor: FreehandSmoothingFactor): number {
  switch (factor) {
    case 1:
      return 0.3;
    case 2:
      return 0.85;
    case 3:
      return 1.7;
  }
}

/**
 * Drop near-duplicate samples while tracing (map units).
 * Returns null when the point is too close to the last kept sample.
 */
export function maybeAppendFreehandPoint(
  points: [number, number][],
  candidate: [number, number],
  minDistanceMapUnits: number,
): [number, number][] | null {
  const last = points[points.length - 1];
  if (!last) return [[candidate[0], candidate[1]]];
  if (distance2d(last, candidate) < minDistanceMapUnits) return null;
  return [...points, [candidate[0], candidate[1]]];
}

/**
 * Smooth a freehand polyline after tracing (OCAD: vertices stay connected by straight segments).
 */
export function smoothFreehandPolyline(
  points: [number, number][],
  factor: FreehandSmoothingFactor,
  mapScale: number,
  minPoints: number,
): [number, number][] {
  if (points.length <= minPoints) {
    return points.map((p) => [p[0], p[1]] as [number, number]);
  }
  const toleranceMapUnits = metersToMapUnits(freehandSimplifyToleranceM(factor), mapScale);
  const simplified = douglasPeucker(points, toleranceMapUnits);
  if (simplified.length >= minPoints) {
    return simplified.map((p) => [p[0], p[1]] as [number, number]);
  }
  return points.map((p) => [p[0], p[1]] as [number, number]);
}
