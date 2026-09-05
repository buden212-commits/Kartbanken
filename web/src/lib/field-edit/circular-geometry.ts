/**
 * OCAD Circle / Ellipse drawing modes — outlines as cubic Bézier curves.
 * Circle: diameter from edge to opposite edge.
 * Ellipse: major axis, then minor axis (perpendicular through center).
 */

import {
  sampleBezierPolyline,
  type BezierSegmentControls,
} from "@/lib/field-edit/geometry-tools";

/** Standard cubic approximation of a quarter circle. */
export const BEZIER_CIRCLE_KAPPA = (4 * (Math.SQRT2 - 1)) / 3;

export function axisLength(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function unitAndPerp(
  a: [number, number],
  b: [number, number],
): { ux: number; uy: number; nx: number; ny: number; len: number } | null {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return null;
  const ux = vx / len;
  const uy = vy / len;
  return { ux, uy, nx: -uy, ny: ux, len };
}

/**
 * Four cardinal anchors + four cubic segments for a circle defined by diameter a→b.
 * Oriented so a and b are opposite points on the circle.
 */
export function circleBezierFromDiameter(
  a: [number, number],
  b: [number, number],
): { anchors: [number, number][]; controls: BezierSegmentControls[] } | null {
  const basis = unitAndPerp(a, b);
  if (!basis) return null;
  const { ux, uy, nx, ny, len } = basis;
  const r = len / 2;
  if (r < 1e-9) return null;
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const k = BEZIER_CIRCLE_KAPPA * r;

  // Anchors at diameter ends and perpendicular extremes (CCW from a).
  const anchors: [number, number][] = [
    [a[0], a[1]],
    [cx + nx * r, cy + ny * r],
    [b[0], b[1]],
    [cx - nx * r, cy - ny * r],
  ];
  // Unit tangents CCW at each anchor (perpendicular to outward radius).
  const tangents: [number, number][] = [
    [nx, ny],
    [-ux, -uy],
    [-nx, -ny],
    [ux, uy],
  ];

  const controls: BezierSegmentControls[] = [];
  for (let i = 0; i < 4; i++) {
    const cur = anchors[i]!;
    const next = anchors[(i + 1) % 4]!;
    const t0 = tangents[i]!;
    const t1 = tangents[(i + 1) % 4]!;
    controls.push({
      p1: [cur[0] + t0[0] * k, cur[1] + t0[1] * k],
      p2: [next[0] - t1[0] * k, next[1] - t1[1] * k],
    });
  }
  return { anchors, controls };
}

/**
 * Ellipse from major-axis endpoints and a point that sets the half-width
 * (perpendicular distance from center). Minor axis is forced through center.
 */
export function ellipseBezierFromAxes(
  majorA: [number, number],
  majorB: [number, number],
  widthPoint: [number, number],
): { anchors: [number, number][]; controls: BezierSegmentControls[] } | null {
  const basis = unitAndPerp(majorA, majorB);
  if (!basis) return null;
  const { ux, uy, nx, ny, len } = basis;
  const rx = len / 2;
  const cx = (majorA[0] + majorB[0]) / 2;
  const cy = (majorA[1] + majorB[1]) / 2;
  const ry = Math.abs((widthPoint[0] - cx) * nx + (widthPoint[1] - cy) * ny);
  if (rx < 1e-9 || ry < 1e-9) return null;

  const kx = BEZIER_CIRCLE_KAPPA * rx;
  const ky = BEZIER_CIRCLE_KAPPA * ry;

  // Anchors: major ends + minor extremes (CCW from majorA).
  const anchors: [number, number][] = [
    [majorA[0], majorA[1]],
    [cx + nx * ry, cy + ny * ry],
    [majorB[0], majorB[1]],
    [cx - nx * ry, cy - ny * ry],
  ];
  // Tangent scaled by axis radii (ellipse parametric derivative at 0, π/2, …).
  const tangents: [number, number][] = [
    [nx * ky, ny * ky],
    [-ux * kx, -uy * kx],
    [-nx * ky, -ny * ky],
    [ux * kx, uy * kx],
  ];

  const controls: BezierSegmentControls[] = [];
  for (let i = 0; i < 4; i++) {
    const cur = anchors[i]!;
    const next = anchors[(i + 1) % 4]!;
    const t0 = tangents[i]!;
    const t1 = tangents[(i + 1) % 4]!;
    controls.push({
      p1: [cur[0] + t0[0], cur[1] + t0[1]],
      p2: [next[0] - t1[0], next[1] - t1[1]],
    });
  }
  return { anchors, controls };
}

/** Dense polyline for map storage / preview (closed). */
export function sampleClosedBezierRing(
  anchors: [number, number][],
  controls: BezierSegmentControls[],
  samplesPerSegment = 12,
): [number, number][] {
  return sampleBezierPolyline(anchors, controls, true, samplesPerSegment);
}

export function circleRingFromDiameter(
  a: [number, number],
  b: [number, number],
  samplesPerSegment = 12,
): [number, number][] | null {
  const curve = circleBezierFromDiameter(a, b);
  if (!curve) return null;
  return sampleClosedBezierRing(curve.anchors, curve.controls, samplesPerSegment);
}

export function ellipseRingFromAxes(
  majorA: [number, number],
  majorB: [number, number],
  widthPoint: [number, number],
  samplesPerSegment = 12,
): [number, number][] | null {
  const curve = ellipseBezierFromAxes(majorA, majorB, widthPoint);
  if (!curve) return null;
  return sampleClosedBezierRing(curve.anchors, curve.controls, samplesPerSegment);
}

/** Minor-axis endpoints for overlay help line (through center, length 2·ry). */
export function ellipseMinorAxisEnds(
  majorA: [number, number],
  majorB: [number, number],
  widthPoint: [number, number],
): [[number, number], [number, number]] | null {
  const basis = unitAndPerp(majorA, majorB);
  if (!basis) return null;
  const { nx, ny } = basis;
  const cx = (majorA[0] + majorB[0]) / 2;
  const cy = (majorA[1] + majorB[1]) / 2;
  const ry = Math.abs((widthPoint[0] - cx) * nx + (widthPoint[1] - cy) * ny);
  if (ry < 1e-9) return null;
  return [
    [cx + nx * ry, cy + ny * ry],
    [cx - nx * ry, cy - ny * ry],
  ];
}
