export function distance2d(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function distancePointToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const projected = projectPointOnSegment(p, a, b);
  return distance2d(p, projected.point);
}

export function projectPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { point: [number, number]; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) {
    return { point: [a[0], a[1]], t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return { point: [a[0] + t * dx, a[1] + t * dy], t };
}

export type NearestPolylinePoint = {
  point: [number, number];
  distance: number;
  segmentIndex: number;
};

/** Nearest point on an open polyline (segment indices 0..n-2). */
export function nearestPointOnPolyline(
  p: [number, number],
  vertices: [number, number][],
): NearestPolylinePoint | null {
  if (vertices.length === 0) return null;
  if (vertices.length === 1) {
    const distance = distance2d(p, vertices[0]!);
    return { point: vertices[0]!, distance, segmentIndex: 0 };
  }

  let best: NearestPolylinePoint | null = null;
  for (let i = 0; i < vertices.length - 1; i++) {
    const projected = projectPointOnSegment(p, vertices[i]!, vertices[i + 1]!);
    const distance = distance2d(p, projected.point);
    if (!best || distance < best.distance) {
      best = { point: projected.point, distance, segmentIndex: i };
    }
  }
  return best;
}
