/**
 * OCAD Rectangular mode geometry: right angles at every corner.
 * First edge (p0→p1) sets orientation; third input point sets width.
 */

export function rectangularCorners(
  p0: [number, number],
  p1: [number, number],
  q: [number, number],
): [[number, number], [number, number], [number, number], [number, number]] {
  const vx = p1[0] - p0[0];
  const vy = p1[1] - p0[1];
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) {
    return [p0, p1, p1, p0];
  }
  const tx = vx / len;
  const ty = vy / len;
  // Perpendicular (CCW)
  const nx = -ty;
  const ny = tx;
  const wx = q[0] - p1[0];
  const wy = q[1] - p1[1];
  const w = wx * nx + wy * ny;
  const p2: [number, number] = [p1[0] + w * nx, p1[1] + w * ny];
  const p3: [number, number] = [p0[0] + w * nx, p0[1] + w * ny];
  return [p0, p1, p2, p3];
}

export function rectangularEdgeLength(
  a: [number, number],
  b: [number, number],
): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Closed ring for area (5 points including closing duplicate). */
export function rectangularAreaRing(
  corners: [[number, number], [number, number], [number, number], [number, number]],
): [number, number][] {
  const [a, b, c, d] = corners;
  return [a, b, c, d, [a[0], a[1]]];
}

/** Line outline as closed polyline (matches OCAD building outlines). */
export function rectangularLineCoords(
  corners: [[number, number], [number, number], [number, number], [number, number]],
): [number, number][] {
  return rectangularAreaRing(corners);
}
