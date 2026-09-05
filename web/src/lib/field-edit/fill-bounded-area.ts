/**
 * Fill Bounded Area (OCAD-style): flood-fill empty space enclosed by line/area
 * objects within the current map viewport.
 *
 * Orienteering symbol sets: contours, north lines and course-planning symbols
 * are ignored as barriers.
 */

import { pointInPolygon } from "@/lib/checkout/overlap";
import { closedRing } from "@/lib/field-edit/vertices";

export type FillBoundedBarrier = {
  symbolNumber: number;
  type: "line" | "area";
  coordinates: [number, number][];
  /** Existing holes on area objects — also act as barriers. */
  holes?: [number, number][][];
};

export type FillBoundedViewport = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type FillBoundedAreaResult =
  | {
      ok: true;
      ring: [number, number][];
      holes: [number, number][][];
    }
  | {
      ok: false;
      reason:
        | "not_enclosed"
        | "click_on_barrier"
        | "too_small"
        | "invalid_viewport"
        | "no_barriers";
      message: string;
    };

/** ISOM / ISSprOM majors ignored as boundaries (contours, north lines, courses). */
export function isFillBoundedIgnoredSymbol(symbolNumber: number): boolean {
  const major = Math.floor(Math.abs(symbolNumber) / 1000);
  // Contours & form lines
  if (major >= 101 && major <= 103) return true;
  // Magnetic north lines in common OCAD templates (601 is spot height in ISOM 2017 —
  // point objects are skipped as barriers anyway).
  if (major === 601) return true;
  // Course planning / overprint
  if (major >= 700 && major <= 799) return true;
  return false;
}

function ringBbox(ring: [number, number][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function bboxOverlapsViewport(
  viewport: FillBoundedViewport,
  bbox: [number, number, number, number],
  pad: number,
): boolean {
  return !(
    bbox[2] + pad < viewport.minX ||
    bbox[0] - pad > viewport.maxX ||
    bbox[3] + pad < viewport.minY ||
    bbox[1] - pad > viewport.maxY
  );
}

function rasterizeSegment(
  grid: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (ix0 >= 0 && iy0 >= 0 && ix0 < w && iy0 < h) {
      grid[iy0 * w + ix0] = 1;
      // Thin 4-neighbour thicken seals pinholes without eating a full extra cell diagonally.
      if (ix0 + 1 < w) grid[iy0 * w + ix0 + 1] = 1;
      if (ix0 > 0) grid[iy0 * w + ix0 - 1] = 1;
      if (iy0 + 1 < h) grid[(iy0 + 1) * w + ix0] = 1;
      if (iy0 > 0) grid[(iy0 - 1) * w + ix0] = 1;
    }
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

function rasterizePolyline(
  grid: Uint8Array,
  w: number,
  h: number,
  coords: [number, number][],
  toGridX: (x: number) => number,
  toGridY: (y: number) => number,
): void {
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    rasterizeSegment(
      grid,
      w,
      h,
      toGridX(a[0]),
      toGridY(a[1]),
      toGridX(b[0]),
      toGridY(b[1]),
    );
  }
}

function fillPolygonCells(
  grid: Uint8Array,
  w: number,
  h: number,
  ring: [number, number][],
  toGridX: (x: number) => number,
  toGridY: (y: number) => number,
  fromGridX: (ix: number) => number,
  fromGridY: (iy: number) => number,
): void {
  const closed = closedRing(ring);
  if (closed.length < 4) return;
  const [minX, minY, maxX, maxY] = ringBbox(closed);
  const ix0 = Math.max(0, Math.floor(toGridX(minX)) - 1);
  const iy0 = Math.max(0, Math.floor(toGridY(minY)) - 1);
  const ix1 = Math.min(w - 1, Math.ceil(toGridX(maxX)) + 1);
  const iy1 = Math.min(h - 1, Math.ceil(toGridY(maxY)) + 1);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      if (pointInPolygon(fromGridX(ix), fromGridY(iy), closed)) {
        grid[iy * w + ix] = 1;
      }
    }
  }
}


function centroidOfRing(ring: [number, number][]): [number, number] {
  const closed = closedRing(ring);
  if (closed.length < 2) return [0, 0];
  let sx = 0;
  let sy = 0;
  const n = closed.length - 1; // skip duplicate close
  for (let i = 0; i < n; i++) {
    sx += closed[i]![0];
    sy += closed[i]![1];
  }
  return [sx / Math.max(1, n), sy / Math.max(1, n)];
}

function shoelaceAbs(pts: [number, number][]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Trace exterior + hole contours of a binary fill mask (Moore neighbourhood). */
function traceContours(
  mask: Uint8Array,
  w: number,
  h: number,
  fromGridX: (ix: number) => number,
  fromGridY: (iy: number) => number,
): { ring: [number, number][]; holes: [number, number][][] } | null {
  const visited = new Uint8Array(w * h);
  const N8: [number, number][] = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  function isFilled(ix: number, iy: number): boolean {
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    return mask[iy * w + ix] === 1;
  }

  function traceFrom(startX: number, startY: number): [number, number][] | null {
    const points: [number, number][] = [];
    let cx = startX;
    let cy = startY;
    let startDir = -1;
    for (let d = 0; d < 8; d++) {
      const [dx, dy] = N8[d]!;
      if (!isFilled(cx + dx, cy + dy)) {
        startDir = d;
        break;
      }
    }
    if (startDir < 0) return null;
    let dir = startDir;
    const maxSteps = w * h * 4;
    for (let step = 0; step < maxSteps; step++) {
      points.push([fromGridX(cx), fromGridY(cy)]);
      visited[cy * w + cx] = 1;
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (dir + 6 + k) % 8;
        const [dx, dy] = N8[nd]!;
        const nx = cx + dx;
        const ny = cy + dy;
        if (isFilled(nx, ny)) {
          cx = nx;
          cy = ny;
          dir = nd;
          found = true;
          break;
        }
      }
      if (!found) break;
      if (cx === startX && cy === startY && points.length > 2) break;
    }
    if (points.length < 3) return null;
    const dedup: [number, number][] = [];
    for (const p of points) {
      const last = dedup[dedup.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) dedup.push(p);
    }
    if (dedup.length >= 2) {
      const a = dedup[0]!;
      const b = dedup[dedup.length - 1]!;
      if (a[0] === b[0] && a[1] === b[1]) dedup.pop();
    }
    return dedup.length >= 3 ? dedup : null;
  }

  type Contour = { points: [number, number][]; area: number };
  const contours: Contour[] = [];

  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      if (!isFilled(ix, iy) || visited[iy * w + ix]) continue;
      const edge =
        !isFilled(ix - 1, iy) ||
        !isFilled(ix + 1, iy) ||
        !isFilled(ix, iy - 1) ||
        !isFilled(ix, iy + 1);
      if (!edge) continue;
      const pts = traceFrom(ix, iy);
      if (!pts) continue;
      contours.push({ points: pts, area: shoelaceAbs(pts) });
    }
  }

  if (contours.length === 0) return null;
  contours.sort((a, b) => b.area - a.area);
  const outer = contours[0]!;
  if (outer.area < 1e-6) return null;

  const outerClosed = closedRing(outer.points);
  const holes: [number, number][][] = [];
  for (let i = 1; i < contours.length; i++) {
    const c = contours[i]!;
    if (c.area < outer.area * 0.0001) continue;
    const sample = c.points[0]!;
    if (pointInPolygon(sample[0], sample[1], outerClosed)) {
      holes.push(closedRing(c.points));
    }
  }

  return { ring: outerClosed, holes };
}

function douglasPeucker(
  points: [number, number][],
  epsilon: number,
): [number, number][] {
  if (points.length <= 2) {
    return points.map(([x, y]) => [x, y] as [number, number]);
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    let dist: number;
    if (len < 1e-12) {
      dist = Math.hypot(p[0] - first[0], p[1] - first[1]);
    } else {
      dist =
        Math.abs(dy * p[0] - dx * p[1] + last[0] * first[1] - last[1] * first[0]) /
        len;
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function simplifyClosedRing(
  ring: [number, number][],
  epsilon: number,
): [number, number][] {
  const open =
    ring.length >= 2 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (open.length < 3) return closedRing(ring);
  const simplified = douglasPeucker(open, epsilon);
  if (simplified.length < 3) return closedRing(ring);
  return closedRing(simplified);
}


type BarrierSegment = {
  a: [number, number];
  b: [number, number];
};

function collectBarrierSegments(barriers: FillBoundedBarrier[]): BarrierSegment[] {
  const segments: BarrierSegment[] = [];
  const addPolyline = (coords: [number, number][]) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      if (a[0] === b[0] && a[1] === b[1]) continue;
      segments.push({ a: [a[0], a[1]], b: [b[0], b[1]] });
    }
  };
  for (const barrier of barriers) {
    if (barrier.type === "line") {
      addPolyline(barrier.coordinates);
    } else {
      addPolyline(closedRing(barrier.coordinates));
      for (const hole of barrier.holes ?? []) {
        addPolyline(closedRing(hole));
      }
    }
  }
  return segments;
}

function nearestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; dist2: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) {
    const dx = px - ax;
    const dy = py - ay;
    return { x: ax, y: ay, dist2: dx * dx + dy * dy };
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = ax + t * abx;
  const y = ay + t * aby;
  const dx = px - x;
  const dy = py - y;
  return { x, y, dist2: dx * dx + dy * dy };
}

function nearestOnBarriers(
  px: number,
  py: number,
  segments: BarrierSegment[],
): { x: number; y: number; dist2: number } | null {
  let best: { x: number; y: number; dist2: number } | null = null;
  for (const seg of segments) {
    const hit = nearestPointOnSegment(px, py, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
    if (!best || hit.dist2 < best.dist2) best = hit;
  }
  return best;
}

/** Insert points so consecutive vertices are at most `step` apart. */
function densifyOpenRing(
  ring: [number, number][],
  step: number,
): [number, number][] {
  if (ring.length < 2 || !(step > 0)) {
    return ring.map(([x, y]) => [x, y] as [number, number]);
  }
  const open =
    ring.length >= 2 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (open.length < 2) return open.map(([x, y]) => [x, y] as [number, number]);

  const out: [number, number][] = [];
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!;
    const b = open[(i + 1) % open.length]!;
    out.push([a[0], a[1]]);
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(dist / step);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Pull a raster contour out to the real barrier geometry so the fill meets
 * the bounding objects instead of stopping at cell centres inside them.
 */
function snapRingToBarriers(
  ring: [number, number][],
  segments: BarrierSegment[],
  maxDist: number,
  densifyStep: number,
): [number, number][] {
  if (segments.length === 0 || ring.length < 3) return closedRing(ring);
  const maxDist2 = maxDist * maxDist;
  const dense = densifyOpenRing(ring, densifyStep);
  const snapped: [number, number][] = [];
  for (const p of dense) {
    const hit = nearestOnBarriers(p[0], p[1], segments);
    if (hit && hit.dist2 <= maxDist2) {
      snapped.push([hit.x, hit.y]);
    } else {
      snapped.push([p[0], p[1]]);
    }
  }
  // Drop consecutive duplicates after snap
  const dedup: [number, number][] = [];
  for (const p of snapped) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) {
      dedup.push(p);
    }
  }
  if (dedup.length >= 2) {
    const a = dedup[0]!;
    const b = dedup[dedup.length - 1]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6) dedup.pop();
  }
  return closedRing(dedup.length >= 3 ? dedup : ring);
}

/**
 * Expand the flood-fill mask by one cell into neighbouring barrier cells so
 * contour tracing sits on the barrier raster instead of one cell inside.
 */
function dilateFillIntoBarriers(
  filled: Uint8Array,
  barrier: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const out = filled.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y * w + x] !== 1) continue;
      const neighbors: [number, number][] = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nidx = ny * w + nx;
        if (barrier[nidx] === 1) out[nidx] = 1;
      }
    }
  }
  return out;
}

/**
 * Compute a filled area from a click inside a region bounded by barriers.
 * If the flood reaches the viewport edge the region is not fully enclosed.
 */
export function fillBoundedArea(input: {
  click: [number, number];
  viewport: FillBoundedViewport;
  barriers: FillBoundedBarrier[];
  /** Max grid dimension on the longest side (default 384). */
  maxGridSize?: number;
}): FillBoundedAreaResult {
  const { click, viewport, barriers } = input;
  const maxGrid = Math.max(64, Math.min(512, input.maxGridSize ?? 384));

  const width = viewport.maxX - viewport.minX;
  const height = viewport.maxY - viewport.minY;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return {
      ok: false,
      reason: "invalid_viewport",
      message: "Ogiltig kartvy — zooma in och försök igen.",
    };
  }

  if (
    click[0] < viewport.minX ||
    click[0] > viewport.maxX ||
    click[1] < viewport.minY ||
    click[1] > viewport.maxY
  ) {
    return {
      ok: false,
      reason: "invalid_viewport",
      message: "Klicka inne i den synliga kartvyn.",
    };
  }

  const usable = barriers.filter(
    (b) =>
      (b.type === "line" || b.type === "area") &&
      !isFillBoundedIgnoredSymbol(b.symbolNumber) &&
      b.coordinates.length >= 2 &&
      bboxOverlapsViewport(viewport, ringBbox(b.coordinates), width * 0.02),
  );

  if (usable.length === 0) {
    return {
      ok: false,
      reason: "no_barriers",
      message:
        "Inga omslutande linjer eller ytor i vyn (konturer/nordlinjer/banor ignoreras).",
    };
  }

  const aspect = width / height;
  let gw: number;
  let gh: number;
  if (aspect >= 1) {
    gw = maxGrid;
    gh = Math.max(32, Math.round(maxGrid / aspect));
  } else {
    gh = maxGrid;
    gw = Math.max(32, Math.round(maxGrid * aspect));
  }

  const cellW = width / gw;
  const cellH = height / gh;
  const toGridX = (x: number) => (x - viewport.minX) / cellW;
  const toGridY = (y: number) => (y - viewport.minY) / cellH;
  const fromGridX = (ix: number) => viewport.minX + (ix + 0.5) * cellW;
  const fromGridY = (iy: number) => viewport.minY + (iy + 0.5) * cellH;

  const barrier = new Uint8Array(gw * gh);

  for (const b of usable) {
    if (b.type === "line") {
      rasterizePolyline(barrier, gw, gh, b.coordinates, toGridX, toGridY);
    } else {
      rasterizePolyline(barrier, gw, gh, closedRing(b.coordinates), toGridX, toGridY);
      fillPolygonCells(
        barrier,
        gw,
        gh,
        b.coordinates,
        toGridX,
        toGridY,
        fromGridX,
        fromGridY,
      );
      for (const hole of b.holes ?? []) {
        rasterizePolyline(barrier, gw, gh, closedRing(hole), toGridX, toGridY);
        fillPolygonCells(
          barrier,
          gw,
          gh,
          hole,
          toGridX,
          toGridY,
          fromGridX,
          fromGridY,
        );
      }
    }
  }

  const cx = Math.floor(toGridX(click[0]));
  const cy = Math.floor(toGridY(click[1]));
  if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) {
    return {
      ok: false,
      reason: "invalid_viewport",
      message: "Klicka inne i den synliga kartvyn.",
    };
  }
  if (barrier[cy * gw + cx] === 1) {
    return {
      ok: false,
      reason: "click_on_barrier",
      message: "Klicka i ett tomt område, inte på en linje eller yta.",
    };
  }

  const filled = new Uint8Array(gw * gh);
  const stackX = [cx];
  const stackY = [cy];
  let touchedBorder = false;
  let fillCount = 0;

  while (stackX.length > 0) {
    const x = stackX.pop()!;
    const y = stackY.pop()!;
    if (x < 0 || y < 0 || x >= gw || y >= gh) {
      touchedBorder = true;
      continue;
    }
    const idx = y * gw + x;
    if (filled[idx] || barrier[idx]) continue;
    filled[idx] = 1;
    fillCount++;
    if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) {
      touchedBorder = true;
    }
    stackX.push(x + 1, x - 1, x, x);
    stackY.push(y, y, y + 1, y - 1);
  }

  if (touchedBorder) {
    return {
      ok: false,
      reason: "not_enclosed",
      message:
        "Området är inte helt omslutet av objekt i den synliga vyn. Zooma in eller stäng luckor.",
    };
  }

  if (fillCount < 4) {
    return {
      ok: false,
      reason: "too_small",
      message: "Ytan blev för liten — zooma in och försök igen.",
    };
  }

  // Grow fill onto adjacent barrier cells so the traced contour isn't inset.
  const contourMask = dilateFillIntoBarriers(filled, barrier, gw, gh);
  const contours = traceContours(contourMask, gw, gh, fromGridX, fromGridY);
  if (!contours) {
    return {
      ok: false,
      reason: "too_small",
      message: "Kunde inte skapa ytans kontur — zooma in och försök igen.",
    };
  }

  const segments = collectBarrierSegments(usable);
  const cellSize = Math.max(cellW, cellH);
  // Snap outward to real barrier geometry (raster centres sit inside the wall).
  const snapDist = cellSize * 5;
  const densifyStep = cellSize * 0.5;
  const snappedRing = snapRingToBarriers(
    contours.ring,
    segments,
    snapDist,
    densifyStep,
  );
  const simplifyEps = cellSize * 0.35;
  const ring = simplifyClosedRing(snappedRing, simplifyEps);
  if (ring.length < 4) {
    return {
      ok: false,
      reason: "too_small",
      message: "Ytan blev för liten — zooma in och försök igen.",
    };
  }

  // Prefer real enclosed objects as holes (more accurate than noisy raster holes).
  const holes: [number, number][][] = [];
  for (const b of usable) {
    if (b.type === "area") {
      const areaRing = closedRing(b.coordinates);
      if (areaRing.length < 4) continue;
      // Click is outside the object, but object sits inside the filled outer ring.
      if (pointInPolygon(click[0], click[1], areaRing)) continue;
      const [cx, cy] = centroidOfRing(areaRing);
      if (!pointInPolygon(cx, cy, ring)) continue;
      holes.push(simplifyClosedRing(areaRing, simplifyEps));
      for (const inner of b.holes ?? []) {
        // Existing holes in barrier areas are solid barriers already; skip as fill-holes.
      }
    } else if (b.type === "line") {
      const lineRing = closedRing(b.coordinates);
      if (lineRing.length < 4) continue;
      // Only closed lines (start≈end already handled by closedRing if ≥3 unique).
      const openLen =
        Math.hypot(
          b.coordinates[0]![0] - b.coordinates[b.coordinates.length - 1]![0],
          b.coordinates[0]![1] - b.coordinates[b.coordinates.length - 1]![1],
        );
      if (openLen > cellSize) continue; // not a closed loop
      if (pointInPolygon(click[0], click[1], lineRing)) continue;
      const [cx, cy] = centroidOfRing(lineRing);
      if (!pointInPolygon(cx, cy, ring)) continue;
      // Ignore huge "holes" that are basically the same as outer.
      if (shoelaceAbs(lineRing) >= shoelaceAbs(ring) * 0.9) continue;
      holes.push(simplifyClosedRing(lineRing, simplifyEps));
    }
  }

  return { ok: true, ring, holes };
}

/** Visible geo bounds from the four corners of an SVG element's screen box. */
export function visibleGeoBoundsFromSvg(
  svg: SVGSVGElement,
  screenToSvg: (
    svgEl: SVGSVGElement,
    clientX: number,
    clientY: number,
  ) => [number, number] | null,
  svgToGeo: (pt: [number, number]) => [number, number],
): FillBoundedViewport | null {
  const rect = svg.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const corners: [number, number][] = [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const svgPt = screenToSvg(svg, cx, cy);
    if (!svgPt) return null;
    const [gx, gy] = svgToGeo(svgPt);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
    if (gx < minX) minX = gx;
    if (gy < minY) minY = gy;
    if (gx > maxX) maxX = gx;
    if (gy > maxY) maxY = gy;
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return { minX, minY, maxX, maxY };
}
