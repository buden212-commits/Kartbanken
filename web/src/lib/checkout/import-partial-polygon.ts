import { pointInPolygon } from "./overlap";
import type { Bbox, PolygonRing } from "./types";
import type { NormalizedOcadObject } from "@/lib/ocad/types";

const EPS = 1e-9;

function dist(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

function cross(
  o: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain. Returns CCW ring without repeating first point. */
export function convexHull(points: [number, number][]): PolygonRing {
  const unique = new Map<string, [number, number]>();
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    unique.set(`${point[0]},${point[1]}`, point);
  }
  const sorted = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted.map((p) => [p[0], p[1]] as [number, number]);

  const lower: [number, number][] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function pointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  epsilon = 1e-6,
): boolean {
  const crossVal = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(crossVal) > epsilon) return false;
  const dot = (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]);
  return dot <= epsilon;
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < EPS && pointOnSegment(p1, p3, p4)) return true;
  if (Math.abs(d2) < EPS && pointOnSegment(p2, p3, p4)) return true;
  if (Math.abs(d3) < EPS && pointOnSegment(p3, p1, p2)) return true;
  if (Math.abs(d4) < EPS && pointOnSegment(p4, p1, p2)) return true;
  return false;
}

function ringSelfIntersects(ring: PolygonRing): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * k-NN concave hull (Moreira & Santos). Falls back to convex hull if it fails.
 */
export function concaveHull(points: [number, number][], kStart = 3): PolygonRing {
  const unique = new Map<string, [number, number]>();
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    unique.set(`${point[0]},${point[1]}`, [point[0], point[1]]);
  }
  const dataset = [...unique.values()];
  if (dataset.length < 3) return dataset;
  if (dataset.length === 3) return dataset;

  const convex = convexHull(dataset);
  if (convex.length < 3) return convex;

  const maxK = Math.min(dataset.length - 1, Math.max(kStart, 30));

  for (let k = Math.min(kStart, dataset.length - 1); k <= maxK; k++) {
    const hull = tryConcaveHull(dataset, k);
    if (hull && hull.length >= 3 && !ringSelfIntersects(hull)) {
      return hull;
    }
  }

  return convex;
}

function tryConcaveHull(dataset: [number, number][], k: number): PolygonRing | null {
  // Start at the point with lowest Y (then leftmost).
  let current = dataset[0]!;
  for (const point of dataset) {
    if (point[1] < current[1] || (point[1] === current[1] && point[0] < current[0])) {
      current = point;
    }
  }

  const hull: PolygonRing = [current];
  const remaining = new Set(dataset.map((_, i) => i));
  const startIndex = dataset.findIndex((p) => p[0] === current[0] && p[1] === current[1]);
  if (startIndex < 0) return null;
  remaining.delete(startIndex);

  let previousAngle = Math.PI;
  const maxSteps = dataset.length * 2;

  for (let step = 0; step < maxSteps; step++) {
    const candidates = nearestIndices(dataset, current, remaining, k);
    if (candidates.length === 0) break;

    candidates.sort((ia, ib) => {
      const angleA = normalizeAngle(Math.atan2(
        dataset[ia]![1] - current[1],
        dataset[ia]![0] - current[0],
      ) - previousAngle);
      const angleB = normalizeAngle(Math.atan2(
        dataset[ib]![1] - current[1],
        dataset[ib]![0] - current[0],
      ) - previousAngle);
      return angleB - angleA;
    });

    let nextIndex: number | null = null;
    for (const candidate of candidates) {
      const candidatePoint = dataset[candidate]!;
      const intersects = hullEdgeIntersects(hull, current, candidatePoint);
      if (!intersects) {
        nextIndex = candidate;
        break;
      }
    }
    if (nextIndex == null) return null;

    const next = dataset[nextIndex]!;
    previousAngle = Math.atan2(current[1] - next[1], current[0] - next[0]);
    current = next;
    hull.push(current);
    remaining.delete(nextIndex);

    // Re-add start point when hull is long enough so we can close.
    if (hull.length >= 3) {
      remaining.add(startIndex);
    }

    if (current[0] === hull[0]![0] && current[1] === hull[0]![1] && hull.length > 3) {
      hull.pop();
      return hull;
    }
  }

  return null;
}

function normalizeAngle(angle: number): number {
  let value = angle;
  while (value < 0) value += Math.PI * 2;
  while (value >= Math.PI * 2) value -= Math.PI * 2;
  return value;
}

function nearestIndices(
  dataset: [number, number][],
  current: [number, number],
  remaining: Set<number>,
  k: number,
): number[] {
  const scored: { index: number; d: number }[] = [];
  for (const index of remaining) {
    const point = dataset[index]!;
    if (point[0] === current[0] && point[1] === current[1]) continue;
    scored.push({ index, d: dist(current, point) });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, k).map((entry) => entry.index);
}

function hullEdgeIntersects(
  hull: PolygonRing,
  from: [number, number],
  to: [number, number],
): boolean {
  if (hull.length < 2) return false;
  for (let i = 0; i < hull.length - 1; i++) {
    // Skip adjacent edge ending at `from`.
    if (i === hull.length - 2) continue;
    if (segmentsIntersect(hull[i]!, hull[i + 1]!, from, to)) return true;
  }
  return false;
}

export function collectObjectSamplePoints(object: NormalizedOcadObject): [number, number][] {
  const points: [number, number][] = [object.centroid];
  if (object.vertices && object.vertices.length > 0) {
    for (const vertex of object.vertices) {
      points.push(vertex);
    }
    return points;
  }

  const [minX, minY, maxX, maxY] = object.bbox;
  points.push([minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]);
  return points;
}

/** Målstorlek för rutnätscell (meter). Anpassas uppåt för mycket stora utsnitt. */
export const IMPORT_GRID_CELL_METERS = 15;
const IMPORT_GRID_MAX_CELLS_PER_SIDE = 320;

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function parseCellKey(key: string): [number, number] {
  const [i, j] = key.split(",").map(Number);
  return [i!, j!];
}

function chooseGridCellSize(width: number, height: number): number {
  const span = Math.max(width, height, 1);
  return Math.max(IMPORT_GRID_CELL_METERS, span / IMPORT_GRID_MAX_CELLS_PER_SIDE);
}

function dilateOccupancyOrtho(occupied: Set<string>): Set<string> {
  const next = new Set(occupied);
  for (const key of occupied) {
    const [i, j] = parseCellKey(key);
    next.add(cellKey(i - 1, j));
    next.add(cellKey(i + 1, j));
    next.add(cellKey(i, j - 1));
    next.add(cellKey(i, j + 1));
  }
  return next;
}

/** Fyll enstaka hål (cell med ≥3 ortogonala grannar) utan att fylla stora vikar. */
function closeSingleCellGaps(occupied: Set<string>): Set<string> {
  const next = new Set(occupied);
  const candidates = new Set<string>();
  for (const key of occupied) {
    const [i, j] = parseCellKey(key);
    for (const [di, dj] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      candidates.add(cellKey(i + di, j + dj));
    }
  }
  for (const key of candidates) {
    if (occupied.has(key)) continue;
    const [i, j] = parseCellKey(key);
    let n = 0;
    if (occupied.has(cellKey(i - 1, j))) n += 1;
    if (occupied.has(cellKey(i + 1, j))) n += 1;
    if (occupied.has(cellKey(i, j - 1))) n += 1;
    if (occupied.has(cellKey(i, j + 1))) n += 1;
    if (n >= 3) next.add(key);
  }
  return next;
}

function countOccupancyComponents(occupied: Set<string>): number {
  const seen = new Set<string>();
  let count = 0;
  for (const start of occupied) {
    if (seen.has(start)) continue;
    count += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const key = stack.pop()!;
      const [i, j] = parseCellKey(key);
      for (const [di, dj] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const next = cellKey(i + di, j + dj);
        if (occupied.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  }
  return count;
}

/**
 * Binder ihop fragment med minimal ortogonal dilatering (max 2 steg).
 * Stoppar så fort det blir en komponent — undviker att fylla vikar i onödan.
 */
function connectComponentsMinimally(occupied: Set<string>): Set<string> {
  let current = occupied;
  if (countOccupancyComponents(current) <= 1) {
    return closeSingleCellGaps(current);
  }
  for (let step = 0; step < 2; step++) {
    current = dilateOccupancyOrtho(current);
    current = closeSingleCellGaps(current);
    if (countOccupancyComponents(current) <= 1) break;
  }
  return current;
}

function markLineCells(
  occupied: Set<string>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  originX: number,
  originY: number,
  cell: number,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    occupied.add(cellKey(Math.floor((x - originX) / cell), Math.floor((y - originY) / cell)));
  }
}

/**
 * Bygger fotavtryck från objekt via rutnät och plockar ytterkonturen.
 * Följer vikar/inbuktningar bättre än konkav hull.
 */
export function buildGridContourFromObjects(
  objects: NormalizedOcadObject[],
  options?: { cellMeters?: number; dilate?: boolean },
): PolygonRing | null {
  if (objects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const samples: [number, number][] = [];
  for (const object of objects) {
    for (const point of collectObjectSamplePoints(object)) {
      samples.push(point);
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
    minX = Math.min(minX, object.bbox[0], object.centroid[0]);
    minY = Math.min(minY, object.bbox[1], object.centroid[1]);
    maxX = Math.max(maxX, object.bbox[2], object.centroid[0]);
    maxY = Math.max(maxY, object.bbox[3], object.centroid[1]);
  }
  if (!Number.isFinite(minX) || samples.length === 0) return null;

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const cell = options?.cellMeters ?? chooseGridCellSize(width, height);
  const pad = cell;
  const originX = minX - pad;
  const originY = minY - pad;

  let occupied = new Set<string>();
  for (const [x, y] of samples) {
    occupied.add(cellKey(Math.floor((x - originX) / cell), Math.floor((y - originY) / cell)));
  }

  // Linjer/ytor: fyll celler längs vertexkedjor så fotavtrycket inte blir håligt.
  for (const object of objects) {
    const verts = object.vertices;
    if (!verts || verts.length < 2) continue;
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i]!;
      const b = verts[i + 1]!;
      markLineCells(occupied, a[0], a[1], b[0], b[1], originX, originY, cell);
    }
    if (object.type === "area" && verts.length >= 3) {
      const first = verts[0]!;
      const last = verts[verts.length - 1]!;
      markLineCells(occupied, last[0], last[1], first[0], first[1], originX, originY, cell);
    }
  }

  if (occupied.size === 0) return null;
  // Minimal sammankoppling av fragment; undviker att alltid dilatera (fyller annars vikar).
  if (options?.dilate === false) {
    occupied = closeSingleCellGaps(occupied);
  } else {
    occupied = connectComponentsMinimally(occupied);
  }

  const ring = traceOccupancyOuterRing(occupied, originX, originY, cell);
  if (!ring || ring.length < 3) return null;
  return simplifyAxisAlignedRing(ring);
}

/**
 * Kedjar kantsegment mellan upptagna/tomma celler till den största yttre ringen.
 */
export function traceOccupancyOuterRing(
  occupied: Set<string>,
  originX: number,
  originY: number,
  cell: number,
): PolygonRing | null {
  type Edge = { x0: number; y0: number; x1: number; y1: number };
  const edgeMap = new Map<string, Edge>();

  const edgeId = (x0: number, y0: number, x1: number, y1: number) =>
    `${x0},${y0}>${x1},${y1}`;

  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    // World coords at cell corners.
    const wx0 = originX + x0 * cell;
    const wy0 = originY + y0 * cell;
    const wx1 = originX + x1 * cell;
    const wy1 = originY + y1 * cell;
    edgeMap.set(edgeId(x0, y0, x1, y1), { x0: wx0, y0: wy0, x1: wx1, y1: wy1 });
  };

  for (const key of occupied) {
    const [i, j] = parseCellKey(key);
    // Cell corners in grid index space: (i,j), (i+1,j), (i+1,j+1), (i,j+1)
    if (!occupied.has(cellKey(i, j - 1))) addEdge(i, j, i + 1, j); // bottom, left→right
    if (!occupied.has(cellKey(i + 1, j))) addEdge(i + 1, j, i + 1, j + 1); // right, bottom→top
    if (!occupied.has(cellKey(i, j + 1))) addEdge(i + 1, j + 1, i, j + 1); // top, right→left
    if (!occupied.has(cellKey(i - 1, j))) addEdge(i, j + 1, i, j); // left, top→bottom
  }

  if (edgeMap.size < 3) return null;

  // Index outgoing edges by start grid corner.
  const byStart = new Map<string, string[]>();
  for (const id of edgeMap.keys()) {
    const start = id.split(">")[0]!;
    const list = byStart.get(start) ?? [];
    list.push(id);
    byStart.set(start, list);
  }

  const used = new Set<string>();
  let bestRing: PolygonRing | null = null;
  let bestArea = -1;

  for (const startId of edgeMap.keys()) {
    if (used.has(startId)) continue;
    const ring: PolygonRing = [];
    let currentId: string | undefined = startId;
    let guard = 0;
    while (currentId && !used.has(currentId) && guard < edgeMap.size + 2) {
      guard += 1;
      used.add(currentId);
      const edge = edgeMap.get(currentId);
      if (!edge) break;
      ring.push([edge.x0, edge.y0]);
      const endKey: string = currentId.split(">")[1]!;
      const nextList: string[] = byStart.get(endKey) ?? [];
      currentId = nextList.find((id: string) => !used.has(id));
      if (!currentId && endKey === startId.split(">")[0]) break;
    }

    if (ring.length < 3) continue;
    const area = Math.abs(ringSignedArea(ring));
    if (area > bestArea) {
      bestArea = area;
      bestRing = ensureCcw(ring);
    }
  }

  return bestRing;
}

function ringSignedArea(ring: PolygonRing): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function ensureCcw(ring: PolygonRing): PolygonRing {
  return ringSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}

/** Tar bort kollinjära mellanpunkter på axelparallell kontur. */
export function simplifyAxisAlignedRing(ring: PolygonRing): PolygonRing {
  if (ring.length < 3) return ring;
  const out: PolygonRing = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const curr = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const crossVal = cross(prev, curr, next);
    if (Math.abs(crossVal) > 1e-6) {
      out.push(curr);
    }
  }
  return out.length >= 3 ? out : ring;
}

export function buildImportPolygonFromObjects(objects: NormalizedOcadObject[]): PolygonRing | null {
  if (objects.length === 0) return null;
  const points: [number, number][] = [];
  for (const object of objects) {
    for (const point of collectObjectSamplePoints(object)) {
      points.push(point);
    }
  }
  if (points.length === 0) return null;
  if (points.length === 1) {
    const [x, y] = points[0]!;
    const pad = 5;
    return [
      [x - pad, y - pad],
      [x + pad, y - pad],
      [x + pad, y + pad],
      [x - pad, y + pad],
    ];
  }
  if (points.length === 2) {
    const [a, b] = points;
    const pad = Math.max(5, dist(a!, b!) * 0.05);
    return [
      [a![0] - pad, a![1] - pad],
      [b![0] + pad, a![1] - pad],
      [b![0] + pad, b![1] + pad],
      [a![0] - pad, b![1] + pad],
    ];
  }

  // Primärt: rutnätskontur (följer vikar). Fallback: konkav/konvex hull.
  const gridRing = buildGridContourFromObjects(objects);
  if (gridRing && gridRing.length >= 3 && !ringSelfIntersects(gridRing)) {
    return gridRing;
  }

  const MAX_HULL_POINTS = 2500;
  let hullInput = points;
  if (points.length > MAX_HULL_POINTS) {
    const stride = Math.ceil(points.length / MAX_HULL_POINTS);
    hullInput = points.filter((_, index) => index % stride === 0);
    hullInput.push(points[0]!, points[points.length - 1]!);
  }

  const hull = concaveHull(hullInput, 3);
  return hull.length >= 3 ? hull : convexHull(hullInput);
}

export function bboxFromRing(ring: PolygonRing): Bbox | null {
  if (ring.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function expandRing(ring: PolygonRing, fraction = 0.01, minPad = 100): PolygonRing {
  const bbox = bboxFromRing(ring);
  if (!bbox || ring.length === 0) return ring;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const padX = Math.max((bbox.maxX - bbox.minX) * fraction, minPad);
  const padY = Math.max((bbox.maxY - bbox.minY) * fraction, minPad);
  const scaleX = bbox.maxX === bbox.minX ? 1 : 1 + (2 * padX) / (bbox.maxX - bbox.minX);
  const scaleY = bbox.maxY === bbox.minY ? 1 : 1 + (2 * padY) / (bbox.maxY - bbox.minY);
  return ring.map(([x, y]) => [cx + (x - cx) * scaleX, cy + (y - cy) * scaleY]);
}

/** Default kantzon: objekt innanför polygonen men inom detta avstånd från kanten skyddas från auto-borttag. */
export const IMPORT_EDGE_BUFFER_METERS = 30;

/**
 * Krymp polygon ungefärligt inåt med `meters` (mot centroid).
 * Returnerar null om utsnittet är för litet för given buffert.
 */
export function shrinkRing(ring: PolygonRing, meters: number): PolygonRing | null {
  const bbox = bboxFromRing(ring);
  if (!bbox || ring.length < 3 || !(meters > 0)) return null;
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;
  let shrink = meters;
  if (width <= 2 * shrink || height <= 2 * shrink) {
    shrink = Math.min(width, height) * 0.2;
    if (shrink < 1) return null;
  }
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const shrunk = ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) return [x, y] as [number, number];
    const factor = Math.max(0, (dist - shrink) / dist);
    return [cx + dx * factor, cy + dy * factor] as [number, number];
  });
  return shrunk.length >= 3 ? shrunk : null;
}

export function padBboxMeters(bbox: Bbox, meters: number): Bbox {
  return {
    minX: bbox.minX - meters,
    minY: bbox.minY - meters,
    maxX: bbox.maxX + meters,
    maxY: bbox.maxY + meters,
  };
}

export function objectIntersectsBboxQuick(
  object: NormalizedOcadObject,
  bbox: Bbox,
): boolean {
  return (
    object.bbox[0] <= bbox.maxX &&
    object.bbox[2] >= bbox.minX &&
    object.bbox[1] <= bbox.maxY &&
    object.bbox[3] >= bbox.minY
  );
}

/**
 * Snabb geografisk sållning: AABB först, därefter polygon.
 * Undviker PIP mot objekt långt från delkartan.
 */
export function filterObjectsIntersectingPolygon(
  objects: NormalizedOcadObject[],
  ring: PolygonRing,
  options?: { padMeters?: number },
): NormalizedOcadObject[] {
  const bbox = bboxFromRing(ring);
  if (!bbox || ring.length < 3) return [];
  const padded = options?.padMeters ? padBboxMeters(bbox, options.padMeters) : bbox;
  const candidates: NormalizedOcadObject[] = [];
  for (const object of objects) {
    if (!objectIntersectsBboxQuick(object, padded)) continue;
    if (objectIntersectsPolygon(object, ring, bbox)) {
      candidates.push(object);
    }
  }
  return candidates;
}

/** True om objektets centroid ligger i kantzonen (inne i polygon, ≤ bufferMeters från randen). */
export function objectInEdgeBufferZone(
  object: NormalizedOcadObject,
  ring: PolygonRing,
  bufferMeters: number = IMPORT_EDGE_BUFFER_METERS,
): boolean {
  if (!(bufferMeters > 0) || ring.length < 3) return false;
  const [x, y] = object.centroid;
  if (!pointInPolygon(x, y, ring)) {
    // Objekt som bara snuddar området via bbox — behandla som kant.
    return objectIntersectsPolygon(object, ring);
  }
  return distancePointToRing(x, y, ring) <= bufferMeters;
}

export function edgeSnapForRing(ring: PolygonRing): number {
  const bbox = bboxFromRing(ring);
  if (!bbox) return 50;
  return Math.max(50, (bbox.maxX - bbox.minX) * 0.005, (bbox.maxY - bbox.minY) * 0.005);
}

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function distancePointToRing(px: number, py: number, ring: PolygonRing): number {
  if (ring.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    best = Math.min(best, distancePointToSegment(px, py, ax, ay, bx, by));
  }
  return best;
}

function objectSamplePointsForContainment(object: NormalizedOcadObject): [number, number][] {
  if (object.vertices && object.vertices.length >= 2) {
    return object.vertices;
  }
  const [minX, minY, maxX, maxY] = object.bbox;
  return [
    object.centroid,
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

export function objectIntersectsPolygon(
  object: NormalizedOcadObject,
  ring: PolygonRing,
  ringBbox?: Bbox | null,
): boolean {
  const bbox = ringBbox ?? bboxFromRing(ring);
  if (!bbox) return false;
  if (
    object.bbox[2] < bbox.minX ||
    object.bbox[0] > bbox.maxX ||
    object.bbox[3] < bbox.minY ||
    object.bbox[1] > bbox.maxY
  ) {
    return false;
  }

  if (pointInPolygon(object.centroid[0], object.centroid[1], ring)) {
    return true;
  }

  for (const [x, y] of objectSamplePointsForContainment(object)) {
    if (pointInPolygon(x, y, ring)) return true;
  }

  // Polygon vertex inside object bbox (covers large objects containing the excerpt).
  for (const [x, y] of ring) {
    if (
      x >= object.bbox[0] &&
      x <= object.bbox[2] &&
      y >= object.bbox[1] &&
      y <= object.bbox[3]
    ) {
      return true;
    }
  }

  return false;
}

export function objectFullyInsidePolygon(object: NormalizedOcadObject, ring: PolygonRing): boolean {
  const points = objectSamplePointsForContainment(object);
  return points.every(([x, y]) => pointInPolygon(x, y, ring));
}

export function objectCrossesPolygon(object: NormalizedOcadObject, ring: PolygonRing): boolean {
  if (!objectIntersectsPolygon(object, ring)) return false;
  return !objectFullyInsidePolygon(object, ring);
}

export function isLikelyClippedByPolygon(
  object: NormalizedOcadObject,
  ring: PolygonRing,
  snap?: number,
): boolean {
  const threshold = snap ?? edgeSnapForRing(ring);
  if (object.type !== "line" && object.type !== "area" && !(object.vertices && object.vertices.length >= 2)) {
    return false;
  }

  const points =
    object.vertices && object.vertices.length >= 2
      ? object.vertices
      : objectSamplePointsForContainment(object);

  const onEdge = points.filter(([x, y]) => distancePointToRing(x, y, ring) <= threshold);
  if (onEdge.length >= 2) return true;

  // Single endpoint glued to boundary is common for cut lines.
  if (object.type === "line" && points.length >= 2) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const firstOn = distancePointToRing(first[0], first[1], ring) <= threshold;
    const lastOn = distancePointToRing(last[0], last[1], ring) <= threshold;
    if (firstOn || lastOn) {
      // Only treat as clipped if the object also reaches near the hull (not a short interior line).
      return objectCrossesPolygon(object, ring) || onEdge.length >= 1;
    }
  }

  return false;
}
