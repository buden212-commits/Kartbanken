import { metersToMapUnits } from "@/lib/ocad/crs";
import { douglasPeucker } from "@/lib/suggestion/gps-track";
import { distance2d } from "./polyline-geometry";

export type GeometryToolResult = {
  coordinates: [number, number][];
  beforeCount: number;
  afterCount: number;
};

function cubicBezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

/** Douglas–Peucker simplification; tolerance in meters on the ground. */
export function simplifyPolyline(
  coordinates: [number, number][],
  toleranceM: number,
  mapScale: number,
  minPoints: number,
): GeometryToolResult {
  const beforeCount = coordinates.length;
  if (coordinates.length <= minPoints) {
    return { coordinates: coordinates.slice(), beforeCount, afterCount: beforeCount };
  }
  const toleranceMapUnits = metersToMapUnits(Math.max(0.1, toleranceM), mapScale);
  let simplified = douglasPeucker(coordinates, toleranceMapUnits);
  if (simplified.length < minPoints) {
    simplified = coordinates.slice(0, minPoints);
  }
  return {
    coordinates: simplified,
    beforeCount,
    afterCount: simplified.length,
  };
}

/** Chaikin corner-cutting smooth (open polyline). */
export function smoothPolylineChaikin(
  coordinates: [number, number][],
  iterations: number,
  minPoints: number,
): GeometryToolResult {
  const beforeCount = coordinates.length;
  if (coordinates.length < 3 || iterations <= 0) {
    return { coordinates: coordinates.slice(), beforeCount, afterCount: beforeCount };
  }

  let current = coordinates.slice();
  for (let pass = 0; pass < iterations; pass++) {
    if (current.length < 3) break;
    const next: [number, number][] = [current[0]!];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i]!;
      const b = current[i + 1]!;
      next.push(
        [0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
        [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]],
      );
    }
    next.push(current[current.length - 1]!);
    current = next;
  }

  if (current.length < minPoints) {
    current = coordinates.slice();
  }

  return { coordinates: current, beforeCount, afterCount: current.length };
}

/** Catmull–Rom spline sampled as a dense polyline (Bézier-lik kurva). */
export function bezierSmoothPolyline(
  coordinates: [number, number][],
  samplesPerSegment: number,
  minPoints: number,
): GeometryToolResult {
  const beforeCount = coordinates.length;
  if (coordinates.length < 3) {
    return { coordinates: coordinates.slice(), beforeCount, afterCount: beforeCount };
  }

  const samples = Math.max(4, Math.min(24, Math.round(samplesPerSegment)));
  const result: [number, number][] = [];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p0 = coordinates[Math.max(0, i - 1)]!;
    const p1 = coordinates[i]!;
    const p2 = coordinates[i + 1]!;
    const p3 = coordinates[Math.min(coordinates.length - 1, i + 2)]!;

    const cp1: [number, number] = [
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
    ];
    const cp2: [number, number] = [
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
    ];

    const startStep = i === 0 ? 0 : 1;
    for (let step = startStep; step <= samples; step++) {
      const t = step / samples;
      result.push(cubicBezierPoint(p1, cp1, cp2, p2, t));
    }
  }

  const deduped: [number, number][] = [];
  for (const point of result) {
    const last = deduped[deduped.length - 1];
    if (!last || distance2d(last, point) > 0.01) {
      deduped.push(point);
    }
  }

  const output =
    deduped.length >= minPoints ? deduped : coordinates.slice();

  return {
    coordinates: output,
    beforeCount,
    afterCount: output.length,
  };
}
