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

/** Douglas–Peucker simplification; tolerance in meters on the ground.
 * Uses a corridor/buffer model (Reumann–Witkam): points within ±tolerance of the
 * current line direction are dropped; a new breakpoint is kept when the path
 * leaves the buffer (touches the edge).
 */
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
  let simplified = corridorSimplify(coordinates, toleranceMapUnits);
  // Second pass: Douglas–Peucker catches remaining near-collinear stretches
  // that the directional corridor may leave.
  simplified = douglasPeucker(simplified, toleranceMapUnits);
  if (simplified.length < minPoints) {
    simplified = coordinates.slice(0, minPoints);
  }
  return {
    coordinates: simplified,
    beforeCount,
    afterCount: simplified.length,
  };
}

/** Perpendicular distance from point to the infinite line through a→b. */
function perpendicularDistanceToLine(
  point: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return distance2d(point, a);
  return Math.abs(dy * point[0] - dx * point[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/**
 * Corridor / buffer simplification.
 * Half-width `tolerance` on each side of the chord between kept breakpoints —
 * intermediate points inside the strip are removed. Extends the chord as far as
 * possible until some intermediate point would leave the buffer (touch the edge);
 * that end becomes the next breakpoint.
 */
export function corridorSimplify(
  coordinates: [number, number][],
  tolerance: number,
): [number, number][] {
  if (coordinates.length <= 2 || !(tolerance > 0)) {
    return coordinates.map(([x, y]) => [x, y] as [number, number]);
  }

  const pts = coordinates.map(([x, y]) => [x, y] as [number, number]);
  const result: [number, number][] = [[pts[0]![0], pts[0]![1]]];
  let i = 0;

  while (i < pts.length - 1) {
    let best = i + 1;
    for (let end = i + 2; end < pts.length; end++) {
      let withinBuffer = true;
      for (let k = i + 1; k < end; k++) {
        if (perpendicularDistanceToLine(pts[k]!, pts[i]!, pts[end]!) > tolerance) {
          withinBuffer = false;
          break;
        }
      }
      if (withinBuffer) {
        best = end;
      } else {
        break;
      }
    }

    const next = pts[best]!;
    if (distance2d(result[result.length - 1]!, next) > 1e-9) {
      result.push([next[0], next[1]]);
    }
    if (best <= i) {
      break;
    }
    i = best;
  }

  const last = pts[pts.length - 1]!;
  if (distance2d(result[result.length - 1]!, last) > 1e-9) {
    result.push([last[0], last[1]]);
  }

  return result;
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

/** Control points P1/P2 for one cubic Bézier segment (anchors are P0/P3). */
export type BezierSegmentControls = {
  p1: [number, number];
  p2: [number, number];
};

/** Default P1/P2 on the straight segment (1/3 and 2/3) — drag to bend the curve. */
export function defaultBezierControlsForPolyline(
  anchors: [number, number][],
  closed: boolean,
): BezierSegmentControls[] {
  const n = anchors.length;
  const segmentCount = closed ? n : Math.max(0, n - 1);
  const controls: BezierSegmentControls[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const a = anchors[i]!;
    const b = anchors[(i + 1) % n]!;
    controls.push({
      p1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
      p2: [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3],
    });
  }
  return controls;
}

/** Sample cubic Bézier segments into a polyline (for OCAD storage). */
export function sampleBezierPolyline(
  anchors: [number, number][],
  controls: BezierSegmentControls[],
  closed: boolean,
  samplesPerSegment: number,
): [number, number][] {
  const n = anchors.length;
  if (n < 2 || controls.length === 0) return anchors.map(([x, y]) => [x, y] as [number, number]);

  const samples = Math.max(4, Math.min(24, Math.round(samplesPerSegment)));
  const result: [number, number][] = [];

  for (let i = 0; i < controls.length; i++) {
    const p0 = anchors[i]!;
    const p3 = anchors[(i + 1) % n]!;
    const { p1, p2 } = controls[i]!;
    const startStep = i === 0 ? 0 : 1;
    for (let step = startStep; step <= samples; step++) {
      const t = step / samples;
      result.push(cubicBezierPoint(p0, p1, p2, p3, t));
    }
  }

  if (closed && result.length > 0) {
    const first = result[0]!;
    const last = result[result.length - 1]!;
    if (distance2d(first, last) > 0.01) {
      result.push([first[0], first[1]]);
    }
  }

  const deduped: [number, number][] = [];
  for (const point of result) {
    const last = deduped[deduped.length - 1];
    if (!last || distance2d(last, point) > 0.01) {
      deduped.push(point);
    }
  }
  return deduped;
}

/** Catmull–Rom spline sampled as a dense polyline (legacy one-shot smooth). */
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

export function hitTestBezierControl(
  anchors: [number, number][],
  controls: BezierSegmentControls[],
  closed: boolean,
  point: [number, number],
  maxDistance: number,
): { segmentIndex: number; which: "p1" | "p2" } | null {
  let best: { segmentIndex: number; which: "p1" | "p2" } | null = null;
  let bestDist = maxDistance;
  const n = anchors.length;
  for (let i = 0; i < controls.length; i++) {
    if (!closed && i >= n - 1) break;
    const seg = controls[i]!;
    for (const which of ["p1", "p2"] as const) {
      const dist = distance2d(point, seg[which]);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { segmentIndex: i, which };
      }
    }
  }
  return best;
}
