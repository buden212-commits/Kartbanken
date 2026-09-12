/**
 * Fill Bounded Area (OCAD-style).
 *
 * Enclosure is verified with a viewport-limited flood fill. The result ring is
 * then taken from a planar face walk over barrier polylines so every vertex
 * comes from the bounding objects (plus intersection points where they cross).
 */

import { pointInPolygon } from "@/lib/checkout/overlap";
import { closedRing } from "@/lib/field-edit/vertices";

export type FillBoundedBarrier = {
  symbolNumber: number;
  type: "line" | "area";
  coordinates: [number, number][];
  holes?: [number, number][][];
};

export type FillBoundedViewport = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type FillBoundedAreaResult =
  | { ok: true; ring: [number, number][]; holes: [number, number][][] }
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

type Pt = [number, number];

/** ISOM / ISSprOM majors ignored as boundaries. */
export function isFillBoundedIgnoredSymbol(symbolNumber: number): boolean {
  const major = Math.floor(Math.abs(symbolNumber) / 1000);
  if (major >= 101 && major <= 103) return true;
  if (major === 601) return true;
  if (major >= 700 && major <= 799) return true;
  return false;
}

function ringBbox(ring: Pt[]): [number, number, number, number] {
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

function dist2(a: Pt, b: Pt): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function almostEqualPt(a: Pt, b: Pt, eps2: number): boolean {
  return dist2(a, b) <= eps2;
}

function shoelaceSigned(ring: Pt[]): number {
  const closed = closedRing(ring);
  if (closed.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [x1, y1] = closed[i]!;
    const [x2, y2] = closed[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function shoelaceAbs(ring: Pt[]): number {
  return Math.abs(shoelaceSigned(ring));
}

function centroidOfRing(ring: Pt[]): Pt {
  const closed = closedRing(ring);
  const n = Math.max(1, closed.length - 1);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += closed[i]![0];
    sy += closed[i]![1];
  }
  return [sx / n, sy / n];
}

function segmentIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / den;
  const u = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a1[0] + t * dax, a1[1] + t * day];
}

function pointOnSegment(p: Pt, a: Pt, b: Pt, eps: number): boolean {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) return dist2(p, a) <= eps * eps;
  const cross = abx * apy - aby * apx;
  if (Math.abs(cross) > eps * Math.sqrt(len2)) return false;
  const dot = apx * abx + apy * aby;
  if (dot < -eps * Math.sqrt(len2)) return false;
  if (dot > len2 + eps * Math.sqrt(len2)) return false;
  return true;
}

function paramOnSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) return 0;
  return ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
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
      if (ix0 + 1 < w) grid[iy0 * w + ix0 + 1] = 1;
      if (ix0 > 0) grid[iy0 * w + ix0 - 1] = 1;
      if (iy0 + 1 < h) grid[(iy0 + 1) * w + ix0] = 1;
      if (iy0 > 0) grid[(iy0 - 1) * w + ix0] = 1;
    }
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    const stepX = e2 > -dy;
    const stepY = e2 < dx;
    // Seal diagonal steps so 4-connected flood cannot leak through corners.
    if (stepX && stepY) {
      const nx = ix0 + sx;
      const ny = iy0 + sy;
      if (nx >= 0 && nx < w && iy0 >= 0 && iy0 < h) grid[iy0 * w + nx] = 1;
      if (ix0 >= 0 && ix0 < w && ny >= 0 && ny < h) grid[ny * w + ix0] = 1;
    }
    if (stepX) {
      err -= dy;
      ix0 += sx;
    }
    if (stepY) {
      err += dx;
      iy0 += sy;
    }
  }
}

function rasterizePolyline(
  grid: Uint8Array,
  w: number,
  h: number,
  coords: Pt[],
  toGridX: (x: number) => number,
  toGridY: (y: number) => number,
): void {
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    rasterizeSegment(grid, w, h, toGridX(a[0]), toGridY(a[1]), toGridX(b[0]), toGridY(b[1]));
  }
}

function fillPolygonCells(
  grid: Uint8Array,
  w: number,
  h: number,
  ring: Pt[],
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

function floodEnclosed(
  barrier: Uint8Array,
  gw: number,
  gh: number,
  cx: number,
  cy: number,
):
  | { ok: true; fillCount: number }
  | { ok: false; reason: "click_on_barrier" | "not_enclosed" | "too_small" } {
  if (barrier[cy * gw + cx] === 1) return { ok: false, reason: "click_on_barrier" };
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
    if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) touchedBorder = true;
    stackX.push(x + 1, x - 1, x, x);
    stackY.push(y, y, y + 1, y - 1);
  }
  if (touchedBorder) return { ok: false, reason: "not_enclosed" };
  if (fillCount < 4) return { ok: false, reason: "too_small" };
  return { ok: true, fillCount };
}

type RawSeg = { a: Pt; b: Pt; chain: Pt[] };

type GraphNode = {
  id: number;
  p: Pt;
  out: GraphHalfEdge[];
};

type GraphHalfEdge = {
  id: number;
  from: number;
  to: number;
  /** Chain from `from`→`to`, excluding `from`, including `to`. */
  chain: Pt[];
  twin: number;
  angle: number;
};

function collectRawSegments(barriers: FillBoundedBarrier[]): RawSeg[] {
  const segs: RawSeg[] = [];
  const addPolyline = (coords: Pt[]) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      if (a[0] === b[0] && a[1] === b[1]) continue;
      segs.push({
        a: [a[0], a[1]],
        b: [b[0], b[1]],
        chain: [
          [a[0], a[1]],
          [b[0], b[1]],
        ],
      });
    }
  };
  for (const b of barriers) {
    if (b.type === "line") {
      addPolyline(b.coordinates);
    } else {
      addPolyline(closedRing(b.coordinates));
      for (const hole of b.holes ?? []) addPolyline(closedRing(hole));
    }
  }
  return segs;
}

function splitSegmentsAtIntersections(raw: RawSeg[], snapEps: number): RawSeg[] {
  const n = raw.length;
  const splits: { t: number; p: Pt }[][] = Array.from({ length: n }, () => []);

  const addSplit = (i: number, p: Pt) => {
    const seg = raw[i]!;
    const t = paramOnSegment(p, seg.a, seg.b);
    if (t <= 1e-9 || t >= 1 - 1e-9) return;
    const list = splits[i]!;
    if (list.some((s) => Math.abs(s.t - t) < 1e-9)) return;
    list.push({ t, p: [p[0], p[1]] });
  };

  for (let i = 0; i < n; i++) {
    const A = raw[i]!;
    for (let j = i + 1; j < n; j++) {
      const B = raw[j]!;
      const hit = segmentIntersection(A.a, A.b, B.a, B.b);
      if (hit) {
        addSplit(i, hit);
        addSplit(j, hit);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const A = raw[i]!;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const B = raw[j]!;
      if (pointOnSegment(A.a, B.a, B.b, snapEps)) addSplit(j, A.a);
      if (pointOnSegment(A.b, B.a, B.b, snapEps)) addSplit(j, A.b);
    }
  }

  const out: RawSeg[] = [];
  for (let i = 0; i < n; i++) {
    const seg = raw[i]!;
    const list = splits[i]!.slice().sort((u, v) => u.t - v.t);
    if (list.length === 0) {
      out.push(seg);
      continue;
    }
    const pts: Pt[] = [seg.a, ...list.map((s) => s.p), seg.b];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      if (almostEqualPt(a, b, snapEps * snapEps)) continue;
      const chain: Pt[] = [[a[0], a[1]]];
      const ta = paramOnSegment(a, seg.a, seg.b);
      const tb = paramOnSegment(b, seg.a, seg.b);
      for (const c of seg.chain) {
        const tc = paramOnSegment(c, seg.a, seg.b);
        if (tc > ta + 1e-9 && tc < tb - 1e-9) chain.push([c[0], c[1]]);
      }
      chain.push([b[0], b[1]]);
      out.push({ a, b, chain });
    }
  }
  return out;
}

function buildArrangement(
  segments: RawSeg[],
  snapEps: number,
): { nodes: GraphNode[]; halfEdges: GraphHalfEdge[] } | null {
  if (segments.length === 0) return null;
  const eps2 = snapEps * snapEps;
  const nodes: GraphNode[] = [];

  const findOrAdd = (p: Pt): number => {
    for (const n of nodes) {
      if (almostEqualPt(n.p, p, eps2)) return n.id;
    }
    const id = nodes.length;
    nodes.push({ id, p: [p[0], p[1]], out: [] });
    return id;
  };

  const halfEdges: GraphHalfEdge[] = [];
  const addDirected = (from: number, to: number, chain: Pt[]): number => {
    const a = nodes[from]!.p;
    const b = nodes[to]!.p;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const id = halfEdges.length;
    halfEdges.push({
      id,
      from,
      to,
      chain: chain.map(([x, y]) => [x, y] as Pt),
      twin: -1,
      angle,
    });
    return id;
  };

  for (const seg of segments) {
    const from = findOrAdd(seg.a);
    const to = findOrAdd(seg.b);
    if (from === to) continue;

    const forward = seg.chain.slice(1).map(([x, y]) => [x, y] as Pt);
    if (forward.length === 0) forward.push([nodes[to]!.p[0], nodes[to]!.p[1]]);
    forward[forward.length - 1] = [nodes[to]!.p[0], nodes[to]!.p[1]];

    const reverse = [...seg.chain].reverse().slice(1).map(([x, y]) => [x, y] as Pt);
    if (reverse.length === 0) reverse.push([nodes[from]!.p[0], nodes[from]!.p[1]]);
    reverse[reverse.length - 1] = [nodes[from]!.p[0], nodes[from]!.p[1]];

    const h0 = addDirected(from, to, forward);
    const h1 = addDirected(to, from, reverse);
    halfEdges[h0]!.twin = h1;
    halfEdges[h1]!.twin = h0;
  }

  if (halfEdges.length < 6) return null;

  for (const node of nodes) {
    node.out = halfEdges.filter((h) => h.from === node.id);
    node.out.sort((a, b) => a.angle - b.angle);
  }
  return { nodes, halfEdges };
}

function nextHalfEdge(
  nodes: GraphNode[],
  halfEdges: GraphHalfEdge[],
  h: GraphHalfEdge,
): GraphHalfEdge | null {
  const twin = halfEdges[h.twin];
  if (!twin) return null;
  const node = nodes[h.to]!;
  if (node.out.length === 0) return null;
  const idx = node.out.findIndex((e) => e.id === twin.id);
  if (idx < 0) return null;
  const nextIdx = (idx - 1 + node.out.length) % node.out.length;
  return node.out[nextIdx] ?? null;
}

function walkFace(
  nodes: GraphNode[],
  halfEdges: GraphHalfEdge[],
  startId: number,
  visited: Uint8Array,
): Pt[] | null {
  let h = halfEdges[startId];
  if (!h) return null;
  const ring: Pt[] = [];
  const start = startId;
  let guard = 0;
  const maxGuard = halfEdges.length + 2;
  do {
    if (visited[h.id]) return null;
    visited[h.id] = 1;
    const fromPt = nodes[h.from]!.p;
    if (ring.length === 0) ring.push([fromPt[0], fromPt[1]]);
    for (const p of h.chain) {
      const last = ring[ring.length - 1]!;
      if (!almostEqualPt(last, p, 1e-24)) ring.push([p[0], p[1]]);
    }
    const next = nextHalfEdge(nodes, halfEdges, h);
    if (!next) return null;
    h = next;
    guard++;
    if (guard > maxGuard) return null;
  } while (h.id !== start);

  if (ring.length < 3) return null;
  return closedRing(ring);
}

function extractFaces(nodes: GraphNode[], halfEdges: GraphHalfEdge[]): Pt[][] {
  const visited = new Uint8Array(halfEdges.length);
  const faces: Pt[][] = [];
  for (const h of halfEdges) {
    if (visited[h.id]) continue;
    const face = walkFace(nodes, halfEdges, h.id, visited);
    if (!face || face.length < 4) continue;
    if (shoelaceAbs(face) < 1e-12) continue;
    faces.push(face);
  }
  return faces;
}

function pickFaceContainingClick(faces: Pt[][], click: Pt): Pt[] | null {
  const containing = faces.filter((f) => pointInPolygon(click[0], click[1], f));
  if (containing.length === 0) return null;

  // Smallest face that contains the click (tightest enclosure).
  // A lone cycle yields two opposite walks with equal area — either is fine;
  // prefer CCW (positive shoelace) for stable output.
  let bestArea = Infinity;
  for (const f of containing) {
    const a = shoelaceAbs(f);
    if (a < bestArea) bestArea = a;
  }
  const tied = containing.filter((f) => shoelaceAbs(f) <= bestArea * 1.001);
  if (tied.length === 0) return null;

  // When a clearly larger face also contains the click (e.g. outer + hole
  // components), keep only the smallest band. If several share that area
  // (opposite windings), prefer positive orientation.
  for (const f of tied) {
    if (shoelaceSigned(f) > 0) return f;
  }
  return tied[0] ?? null;
}

function holesFromEnclosedObjects(
  usable: FillBoundedBarrier[],
  outer: Pt[],
  click: Pt,
): Pt[][] {
  const holes: Pt[][] = [];
  const outerArea = shoelaceAbs(outer);
  for (const b of usable) {
    if (b.type === "area") {
      const areaRing = closedRing(b.coordinates);
      if (areaRing.length < 4) continue;
      if (pointInPolygon(click[0], click[1], areaRing)) continue;
      const c = centroidOfRing(areaRing);
      if (!pointInPolygon(c[0], c[1], outer)) continue;
      if (shoelaceAbs(areaRing) >= outerArea * 0.95) continue;
      holes.push(areaRing);
    } else {
      const coords = b.coordinates;
      if (coords.length < 4) continue;
      const openDist = Math.hypot(
        coords[0]![0] - coords[coords.length - 1]![0],
        coords[0]![1] - coords[coords.length - 1]![1],
      );
      const [minX, minY, maxX, maxY] = ringBbox(coords);
      const diag = Math.hypot(maxX - minX, maxY - minY);
      if (openDist > Math.max(1e-6, diag * 0.02)) continue;
      const lineRing = closedRing(coords);
      if (pointInPolygon(click[0], click[1], lineRing)) continue;
      const c = centroidOfRing(lineRing);
      if (!pointInPolygon(c[0], c[1], outer)) continue;
      if (shoelaceAbs(lineRing) >= outerArea * 0.9) continue;
      if (shoelaceAbs(lineRing) < 1e-8) continue;
      holes.push(lineRing);
    }
  }
  return holes;
}

/**
 * Fill the enclosed empty region under `click`.
 * Result vertices are taken from the bounding objects (and crossings).
 */
export function fillBoundedArea(input: {
  click: Pt;
  viewport: FillBoundedViewport;
  barriers: FillBoundedBarrier[];
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

  const barrierGrid = new Uint8Array(gw * gh);
  for (const b of usable) {
    if (b.type === "line") {
      rasterizePolyline(barrierGrid, gw, gh, b.coordinates, toGridX, toGridY);
    } else {
      rasterizePolyline(barrierGrid, gw, gh, closedRing(b.coordinates), toGridX, toGridY);
      fillPolygonCells(
        barrierGrid,
        gw,
        gh,
        b.coordinates,
        toGridX,
        toGridY,
        fromGridX,
        fromGridY,
      );
      for (const hole of b.holes ?? []) {
        rasterizePolyline(barrierGrid, gw, gh, closedRing(hole), toGridX, toGridY);
        fillPolygonCells(
          barrierGrid,
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

  const flood = floodEnclosed(barrierGrid, gw, gh, cx, cy);
  if (!flood.ok) {
    if (flood.reason === "click_on_barrier") {
      return {
        ok: false,
        reason: "click_on_barrier",
        message: "Klicka i ett tomt område, inte på en linje eller yta.",
      };
    }
    if (flood.reason === "not_enclosed") {
      return {
        ok: false,
        reason: "not_enclosed",
        message:
          "Området är inte helt omslutet av objekt i den synliga vyn. Zooma in eller stäng luckor.",
      };
    }
    return {
      ok: false,
      reason: "too_small",
      message: "Ytan blev för liten — zooma in och försök igen.",
    };
  }

  const snapEps = Math.max(cellW, cellH) * 0.25;
  const raw = collectRawSegments(usable);
  const split = splitSegmentsAtIntersections(raw, snapEps);
  const graph = buildArrangement(split, snapEps);
  if (!graph) {
    return {
      ok: false,
      reason: "too_small",
      message: "Kunde inte bygga omslutningen — zooma in och försök igen.",
    };
  }

  const faces = extractFaces(graph.nodes, graph.halfEdges);
  const face = pickFaceContainingClick(faces, click);
  if (!face || face.length < 4) {
    return {
      ok: false,
      reason: "not_enclosed",
      message:
        "Området är inte helt omslutet av objekt i den synliga vyn. Zooma in eller stäng luckor.",
    };
  }
  if (shoelaceAbs(face) < 1e-8) {
    return {
      ok: false,
      reason: "too_small",
      message: "Ytan blev för liten — zooma in och försök igen.",
    };
  }

  const holes = holesFromEnclosedObjects(usable, face, click);
  return { ok: true, ring: face, holes };
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
