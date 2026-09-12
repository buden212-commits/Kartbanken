import type { FieldEditGeometryKind } from "@/lib/field-edit/types";

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function cloneRing(ring: [number, number][]): [number, number][] {
  return ring.map(([x, y]) => [x, y] as [number, number]);
}

function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 3) return cloneRing(ring);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (dist(first, last) < 1e-9) return cloneRing(ring);
  return [...cloneRing(ring), [first[0], first[1]]];
}

function openRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return cloneRing(ring);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (dist(first, last) < 1e-9) return cloneRing(ring).slice(0, -1);
  return cloneRing(ring);
}

function pointInRing(pt: [number, number], ring: [number, number][]): boolean {
  const closed = closeRing(ring);
  let inside = false;
  for (let i = 0, j = closed.length - 1; i < closed.length; j = i++) {
    const xi = closed[i]![0];
    const yi = closed[i]![1];
    const xj = closed[j]![0];
    const yj = closed[j]![1];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): [number, number] | null {
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / den;
  const u = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a1[0] + t * dax, a1[1] + t * day];
}

function ringsOverlapOrTouch(a: [number, number][], b: [number, number][]): boolean {
  const A = openRing(a);
  const B = openRing(b);
  if (A.length < 3 || B.length < 3) return false;
  for (const p of A) {
    if (pointInRing(p, B)) return true;
  }
  for (const p of B) {
    if (pointInRing(p, A)) return true;
  }
  const Ac = closeRing(A);
  const Bc = closeRing(B);
  for (let i = 0; i < Ac.length - 1; i++) {
    for (let j = 0; j < Bc.length - 1; j++) {
      if (segmentsIntersect(Ac[i]!, Ac[i + 1]!, Bc[j]!, Bc[j + 1]!)) return true;
    }
  }
  return false;
}

type EndPair = {
  dist: number;
  orient: "ab" | "a_rev_b" | "a_b_rev" | "a_rev_b_rev";
};

function bestEndJoin(
  a: [number, number][],
  b: [number, number][],
  tolerance: number,
): EndPair | null {
  if (a.length < 2 || b.length < 2) return null;
  const a0 = a[0]!;
  const a1 = a[a.length - 1]!;
  const b0 = b[0]!;
  const b1 = b[b.length - 1]!;
  const candidates: EndPair[] = (
    [
      { dist: dist(a1, b0), orient: "ab" },
      { dist: dist(a1, b1), orient: "a_b_rev" },
      { dist: dist(a0, b1), orient: "a_rev_b" },
      { dist: dist(a0, b0), orient: "a_rev_b_rev" },
    ] as EndPair[]
  ).filter((c) => c.dist <= tolerance);
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.dist - y.dist);
  return candidates[0]!;
}

function joinOriented(
  a: [number, number][],
  b: [number, number][],
  orient: EndPair["orient"],
): [number, number][] {
  const rev = (pts: [number, number][]) => [...pts].reverse() as [number, number][];
  switch (orient) {
    case "ab": // a_end → b_start
      return [...a, ...b.slice(1)];
    case "a_b_rev": // a_end → b_end
      return [...a, ...rev(b).slice(1)];
    case "a_rev_b": // a_start → b_end
      return [...rev(a), ...rev(b).slice(1)];
    case "a_rev_b_rev": // a_start → b_start
      return [...rev(a), ...b.slice(1)];
  }
}

/**
 * Merge line objects whose endpoints are within `tolerance` meters.
 * Prefers identical endpoints (distance 0) first. Returns one or more
 * remaining polylines if not everything connects into a single chain.
 */
export function mergeLineObjects(
  lines: [number, number][][],
  tolerance: number,
): [number, number][][] {
  const parts = lines
    .map((l) => cloneRing(l))
    .filter((l) => l.length >= 2);
  if (parts.length <= 1) return parts;

  let changed = true;
  while (changed) {
    changed = false;
    let bestI = -1;
    let bestJ = -1;
    let best: EndPair | null = null;

    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const join = bestEndJoin(parts[i]!, parts[j]!, tolerance);
        if (!join) continue;
        if (!best || join.dist < best.dist) {
          best = join;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (best && bestI >= 0 && bestJ >= 0) {
      const merged = joinOriented(parts[bestI]!, parts[bestJ]!, best.orient);
      const next = parts.filter((_, idx) => idx !== bestI && idx !== bestJ);
      next.push(merged);
      parts.length = 0;
      parts.push(...next);
      changed = true;
    }
  }

  return parts;
}

function insertIntersections(
  ring: [number, number][],
  other: [number, number][],
): [number, number][] {
  const A = closeRing(ring);
  const B = closeRing(other);
  const out: [number, number][] = [];
  for (let i = 0; i < A.length - 1; i++) {
    const a1 = A[i]!;
    const a2 = A[i + 1]!;
    out.push(a1);
    type Hit = { t: number; p: [number, number] };
    const hits: Hit[] = [];
    for (let j = 0; j < B.length - 1; j++) {
      const p = segmentsIntersect(a1, a2, B[j]!, B[j + 1]!);
      if (!p) continue;
      if (dist(p, a1) < 1e-9 || dist(p, a2) < 1e-9) continue;
      const t = dist(a1, p) / Math.max(dist(a1, a2), 1e-12);
      hits.push({ t, p });
    }
    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) {
      const last = out[out.length - 1]!;
      if (dist(last, h.p) > 1e-9) out.push(h.p);
    }
  }
  return out;
}

function findStartOutside(
  ring: [number, number][],
  other: [number, number][],
): number {
  for (let i = 0; i < ring.length; i++) {
    if (!pointInRing(ring[i]!, other)) return i;
  }
  return 0;
}

/**
 * Union two overlapping/touching area rings into one outer ring.
 * Returns null if they do not overlap.
 */
export function unionTwoAreaRings(
  a: [number, number][],
  b: [number, number][],
): [number, number][] | null {
  if (!ringsOverlapOrTouch(a, b)) return null;

  const A0 = openRing(a);
  const B0 = openRing(b);
  if (A0.length < 3 || B0.length < 3) return null;

  const aInsideB = A0.every((p) => pointInRing(p, B0));
  if (aInsideB) return closeRing(B0);
  const bInsideA = B0.every((p) => pointInRing(p, A0));
  if (bInsideA) return closeRing(A0);

  const A = insertIntersections(A0, B0);
  const B = insertIntersections(B0, A0);
  if (A.length < 3 || B.length < 3) return closeRing(A0.length >= B0.length ? A0 : B0);

  const start = findStartOutside(A, B0);
  const result: [number, number][] = [];
  let curRing: [number, number][] = A;
  let otherRing: [number, number][] = B;
  let otherPoly = B0;
  let idx = start;
  const maxSteps = (A.length + B.length) * 4;
  let steps = 0;

  const nearIdx = (ring: [number, number][], p: [number, number]): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const d = dist(ring[i]!, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD < 1e-6 ? best : -1;
  };

  while (steps < maxSteps) {
    steps += 1;
    const p = curRing[idx]!;
    const last = result[result.length - 1];
    if (!last || dist(last, p) > 1e-9) {
      result.push([p[0], p[1]]);
    }

    if (result.length > 3 && dist(result[0]!, p) < 1e-6 && steps > 3) {
      break;
    }

    const nextIdx = (idx + 1) % curRing.length;
    const next = curRing[nextIdx]!;
    const mid: [number, number] = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];

    // At an intersection, switch to the other ring if continuing would go inside.
    const switchAt = nearIdx(otherRing, p);
    if (switchAt >= 0 && pointInRing(mid, otherPoly)) {
      const oNext = (switchAt + 1) % otherRing.length;
      const oPrev = (switchAt - 1 + otherRing.length) % otherRing.length;
      const candNext = otherRing[oNext]!;
      const candPrev = otherRing[oPrev]!;
      const midN: [number, number] = [(p[0] + candNext[0]) / 2, (p[1] + candNext[1]) / 2];
      const midP: [number, number] = [(p[0] + candPrev[0]) / 2, (p[1] + candPrev[1]) / 2];
      const useNext = !pointInRing(midN, openRing(curRing === A ? A0 : B0));
      const usePrev = !pointInRing(midP, openRing(curRing === A ? A0 : B0));
      const pick = useNext ? oNext : usePrev ? oPrev : oNext;
      const tmp = curRing;
      curRing = otherRing;
      otherRing = tmp;
      otherPoly = curRing === A ? B0 : A0;
      idx = pick;
      continue;
    }

    if (!pointInRing(mid, otherPoly)) {
      idx = nextIdx;
      continue;
    }

    // Current edge goes inside other — switch rings at this vertex if possible.
    if (switchAt >= 0) {
      const oNext = (switchAt + 1) % otherRing.length;
      const tmp = curRing;
      curRing = otherRing;
      otherRing = tmp;
      otherPoly = curRing === A ? B0 : A0;
      idx = oNext;
      continue;
    }

    idx = nextIdx;
  }

  if (result.length < 3) return closeRing(A0.length >= B0.length ? A0 : B0);
  return closeRing(result);
}

/**
 * Merge overlapping area rings pairwise until stable.
 * Non-overlapping rings are left as separate results (caller should require overlap).
 */
export function mergeAreaObjects(rings: [number, number][][]): [number, number][][] {
  let parts = rings.map((r) => closeRing(openRing(r))).filter((r) => openRing(r).length >= 3);
  if (parts.length <= 1) return parts;

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const u = unionTwoAreaRings(parts[i]!, parts[j]!);
        if (!u) continue;
        const next = parts.filter((_, idx) => idx !== i && idx !== j);
        next.push(u);
        parts = next;
        changed = true;
        break outer;
      }
    }
  }
  return parts;
}

export function areasCanMerge(rings: [number, number][][]): boolean {
  if (rings.length < 2) return false;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      if (ringsOverlapOrTouch(rings[i]!, rings[j]!)) return true;
    }
  }
  return false;
}

export function linesCanMerge(lines: [number, number][][], tolerance: number): boolean {
  if (lines.length < 2) return false;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (bestEndJoin(lines[i]!, lines[j]!, tolerance)) return true;
    }
  }
  return false;
}

export function sameMergeSymbol(
  a: { symbolNumber: number; kind: FieldEditGeometryKind },
  b: { symbolNumber: number; kind: FieldEditGeometryKind },
): boolean {
  return a.symbolNumber === b.symbolNumber && a.kind === b.kind;
}
