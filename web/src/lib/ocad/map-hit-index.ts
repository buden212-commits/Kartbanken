import type { OcadObjectType } from "./types";

/** Compact map object for client-side hit testing (~40 bytes/obj). */
export type MapHitIndexEntry = {
  c: [number, number];
  b: [number, number, number, number];
  s: number;
  t: OcadObjectType;
  /** OCAD object index — only when index is built for field edit. */
  i?: number;
};

function distance2d(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Nearest index entry to a geo point within maxDistance (0 = no limit). */
export function findNearestMapFeature(
  index: MapHitIndexEntry[],
  point: [number, number],
  maxDistance = 0,
): MapHitIndexEntry | null {
  let best: MapHitIndexEntry | null = null;
  let bestDist = maxDistance > 0 ? maxDistance : Infinity;
  for (const entry of index) {
    const dist = distance2d(point, entry.c);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

/** Nearest feature to a point on a line segment (projection + endpoints). */
export function findNearestMapFeatureNearSegment(
  index: MapHitIndexEntry[],
  a: [number, number],
  b: [number, number],
  maxDistance: number,
): MapHitIndexEntry | null {
  let best: MapHitIndexEntry | null = null;
  let bestDist = maxDistance;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  for (const entry of index) {
    const p = entry.c;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
      );
    }
    const proj: [number, number] = [a[0] + t * dx, a[1] + t * dy];
    const dist = distance2d(p, proj);
    if (dist <= bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

/** Angle from center toward a map feature (for control cutout snap). */
export function angleTowardFeature(
  center: [number, number],
  feature: MapHitIndexEntry,
): number {
  return Math.atan2(feature.c[1] - center[1], feature.c[0] - center[0]);
}

function angularDifference(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  const na = ((a % twoPi) + twoPi) % twoPi;
  const nb = ((b % twoPi) + twoPi) % twoPi;
  let diff = Math.abs(na - nb);
  if (diff > Math.PI) diff = twoPi - diff;
  return diff;
}

/**
 * Snap a control-circle cutout toward a map symbol under the click.
 * Ignores the control-site feature at the circle center (its direction is noise)
 * and symbols whose angle is far from the click.
 */
export function snapCutoutAngleToNearbyFeature(
  index: MapHitIndexEntry[],
  center: [number, number],
  click: [number, number],
  circleRadius: number,
  clickAngle: number,
): number {
  const maxDistFromClick = circleRadius * 0.85;
  const minDistFromCenter = circleRadius * 0.4;
  const maxAngleDiff = Math.PI / 3;

  let bestAngle: number | null = null;
  let bestDist = maxDistFromClick;

  for (const entry of index) {
    const distFromCenter = distance2d(center, entry.c);
    if (distFromCenter < minDistFromCenter) continue;
    const distFromClick = distance2d(click, entry.c);
    if (distFromClick >= bestDist) continue;
    const featureAngle = angleTowardFeature(center, entry);
    if (angularDifference(featureAngle, clickAngle) > maxAngleDiff) continue;
    bestDist = distFromClick;
    bestAngle = featureAngle;
  }

  return bestAngle ?? clickAngle;
}

/** Snap a click along A→B toward a nearby map symbol, otherwise keep the click distance. */
export function snapDistanceAlongSegment(
  index: MapHitIndexEntry[],
  a: [number, number],
  b: [number, number],
  click: [number, number],
  clickDistance: number,
  maxDistFromClick: number,
): number {
  let bestDist = maxDistFromClick;
  let bestDistance = clickDistance;
  const full = distance2d(a, b);

  for (const entry of index) {
    const distFromClick = distance2d(click, entry.c);
    if (distFromClick >= bestDist) continue;
    const along = distanceAlongSegmentTowardFeature(a, b, entry);
    if (along < 0 || along > full) continue;
    if (Math.abs(along - clickDistance) > maxDistFromClick * 2) continue;
    bestDist = distFromClick;
    bestDistance = along;
  }

  return bestDistance;
}

/** Distance from segment start A along A→B to nearest point to feature. */
export function distanceAlongSegmentTowardFeature(
  a: [number, number],
  b: [number, number],
  feature: MapHitIndexEntry,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len <= 0) return 0;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((feature.c[0] - a[0]) * dx + (feature.c[1] - a[1]) * dy) / (len * len),
    ),
  );
  return t * len;
}

/** Distance from B backward along B→A toward feature (for incoming leg gaps). */
export function distanceFromEndTowardFeature(
  a: [number, number],
  b: [number, number],
  feature: MapHitIndexEntry,
): number {
  const full = distance2d(a, b);
  const fromStart = distanceAlongSegmentTowardFeature(a, b, feature);
  return full - fromStart;
}
