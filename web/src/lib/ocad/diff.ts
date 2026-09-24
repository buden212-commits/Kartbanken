import {
  euclideanDistance as distance,
  isGeometryModified,
  markSwappedGeometryPairs,
} from "./geometry-compare";
import type { NormalizedOcadObject } from "./types";
import type {
  ChangeType,
  OcadDiffOptions,
  OcadDiffResult,
  OcadObjectChange,
  SymbolDiffSummary,
} from "./diff-types";

const DEFAULT_TOLERANCE_METERS = 2;

type IndexedObject = NormalizedOcadObject & { id: number };

type MatchedPair = {
  a: IndexedObject;
  b: IndexedObject;
  modified: boolean;
};

function cellKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function buildSpatialIndex(objects: IndexedObject[], cellSize: number): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const obj of objects) {
    const key = cellKey(obj.centroid[0], obj.centroid[1], cellSize);
    const bucket = index.get(key) ?? [];
    bucket.push(obj.id);
    index.set(key, bucket);
  }
  return index;
}

function neighborCellKeys(x: number, y: number, cellSize: number): string[] {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      keys.push(`${cx + dx},${cy + dy}`);
    }
  }
  return keys;
}

function pairIsModified(a: IndexedObject, b: IndexedObject, tolerance: number): boolean {
  return isGeometryModified(a, b, tolerance);
}

/**
 * Pair objects with identical geometryHash first (ignores objectIndex).
 * Candidates must also lie within tolerance — identical real geometry shares a
 * centroid; a distance check avoids pairing hash collisions / synthetic mismatches.
 * Prevents remapped OCAD indices from turning unchanged objects into add+remove.
 */
function matchByExactGeometryHash(
  groupA: IndexedObject[],
  groupB: IndexedObject[],
  tolerance: number,
): {
  matched: MatchedPair[];
  remainingA: IndexedObject[];
  remainingB: IndexedObject[];
} {
  const hashBuckets = new Map<string, IndexedObject[]>();
  for (const obj of groupA) {
    const bucket = hashBuckets.get(obj.geometryHash) ?? [];
    bucket.push(obj);
    hashBuckets.set(obj.geometryHash, bucket);
  }

  const matched: MatchedPair[] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();

  for (const objB of groupB) {
    const candidates = (hashBuckets.get(objB.geometryHash) ?? []).filter(
      (candidate) => !usedA.has(candidate.id),
    );
    if (candidates.length === 0) continue;

    let best: IndexedObject | null = null;
    let bestDist = tolerance;
    for (const candidate of candidates) {
      const dist = distance(candidate.centroid, objB.centroid);
      if (dist <= bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    if (!best) continue;

    usedA.add(best.id);
    usedB.add(objB.id);
    matched.push({
      a: best,
      b: objB,
      // Identical hash ⇒ unchanged unless text somehow diverged (already in hash).
      modified: pairIsModified(best, objB, tolerance),
    });
  }

  return {
    matched,
    remainingA: groupA.filter((obj) => !usedA.has(obj.id)),
    remainingB: groupB.filter((obj) => !usedB.has(obj.id)),
  };
}

/**
 * Pair remaining objects that share the same OCAD objectIndex.
 * Used after exact-geometry matching so remapped clones are not stolen by index.
 * Catches real edits that moved far but kept the same index.
 */
function matchByObjectIndex(
  groupA: IndexedObject[],
  groupB: IndexedObject[],
  tolerance: number,
): {
  matched: MatchedPair[];
  remainingA: IndexedObject[];
  remainingB: IndexedObject[];
} {
  const byIndexA = new Map<number, IndexedObject[]>();
  for (const obj of groupA) {
    if (obj.objectIndex < 0) continue;
    const bucket = byIndexA.get(obj.objectIndex) ?? [];
    bucket.push(obj);
    byIndexA.set(obj.objectIndex, bucket);
  }

  const matched: MatchedPair[] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();

  for (const objB of groupB) {
    if (objB.objectIndex < 0) continue;
    const candidates = byIndexA.get(objB.objectIndex);
    if (!candidates?.length) continue;
    const objA = candidates.find((candidate) => !usedA.has(candidate.id));
    if (!objA) continue;

    usedA.add(objA.id);
    usedB.add(objB.id);
    matched.push({
      a: objA,
      b: objB,
      modified: pairIsModified(objA, objB, tolerance),
    });
  }

  return {
    matched,
    remainingA: groupA.filter((obj) => !usedA.has(obj.id)),
    remainingB: groupB.filter((obj) => !usedB.has(obj.id)),
  };
}

function matchSpatially(
  groupA: IndexedObject[],
  groupB: IndexedObject[],
  tolerance: number,
): {
  matched: MatchedPair[];
  unmatchedA: IndexedObject[];
  unmatchedB: IndexedObject[];
} {
  const availableA = new Set(groupA.map((o) => o.id));
  const byIdA = new Map(groupA.map((o) => [o.id, o]));
  const matched: MatchedPair[] = [];
  const unmatchedB: IndexedObject[] = [];
  const index = buildSpatialIndex(groupA, tolerance);

  for (const objB of groupB) {
    let bestId: number | null = null;
    let bestDist = tolerance;

    for (const key of neighborCellKeys(objB.centroid[0], objB.centroid[1], tolerance)) {
      for (const candidateId of index.get(key) ?? []) {
        if (!availableA.has(candidateId)) continue;
        const objA = byIdA.get(candidateId);
        if (!objA) continue;
        const dist = distance(objA.centroid, objB.centroid);
        if (dist <= bestDist) {
          bestDist = dist;
          bestId = candidateId;
        }
      }
    }

    if (bestId === null) {
      unmatchedB.push(objB);
      continue;
    }

    const objA = byIdA.get(bestId)!;
    availableA.delete(bestId);
    matched.push({
      a: objA,
      b: objB,
      modified: pairIsModified(objA, objB, tolerance),
    });
  }

  return {
    matched,
    unmatchedA: groupA.filter((o) => availableA.has(o.id)),
    unmatchedB,
  };
}

/**
 * Match order within a symbol group:
 * 1. Exact geometryHash (stable across OCAD reindex)
 * 2. Same objectIndex (far moves / real edits that kept the index)
 * 3. Spatial nearest centroid within tolerance
 */
function matchSymbolGroup(
  groupA: IndexedObject[],
  groupB: IndexedObject[],
  tolerance: number,
  preferObjectIndex: boolean,
): {
  matched: MatchedPair[];
  unmatchedA: IndexedObject[];
  unmatchedB: IndexedObject[];
} {
  const byHash = matchByExactGeometryHash(groupA, groupB, tolerance);
  let workA = byHash.remainingA;
  let workB = byHash.remainingB;
  const matched: MatchedPair[] = [...byHash.matched];

  if (preferObjectIndex) {
    const byIndex = matchByObjectIndex(workA, workB, tolerance);
    matched.push(...byIndex.matched);
    workA = byIndex.remainingA;
    workB = byIndex.remainingB;
  }

  const spatial = matchSpatially(workA, workB, tolerance);
  matched.push(...spatial.matched);

  markSwappedGeometryPairs(matched);

  return {
    matched,
    unmatchedA: spatial.unmatchedA,
    unmatchedB: spatial.unmatchedB,
  };
}

function toChange(
  changeType: ChangeType,
  object: NormalizedOcadObject,
  previous?: NormalizedOcadObject,
): OcadObjectChange {
  return {
    changeType,
    objectIndex: object.objectIndex,
    symbolNumber: object.symbolNumber,
    symbolName: object.symbolName,
    type: object.type,
    centroid: object.centroid,
    bbox: object.bbox,
    text: object.text,
    geometryHash: object.geometryHash,
    previousGeometryHash: previous?.geometryHash,
  };
}

function buildSymbolSummaries(changes: OcadObjectChange[]): SymbolDiffSummary[] {
  const map = new Map<number, SymbolDiffSummary>();

  for (const change of changes) {
    const current = map.get(change.symbolNumber) ?? {
      symbolNumber: change.symbolNumber,
      symbolName: change.symbolName,
      added: 0,
      removed: 0,
      modified: 0,
    };
    current[change.changeType] += 1;
    map.set(change.symbolNumber, current);
  }

  return [...map.values()].sort(
    (a, b) => b.added + b.removed + b.modified - (a.added + a.removed + a.modified),
  );
}

function groupBySymbol(objects: IndexedObject[]): Map<number, IndexedObject[]> {
  const groups = new Map<number, IndexedObject[]>();
  for (const obj of objects) {
    const group = groups.get(obj.symbolNumber) ?? [];
    group.push(obj);
    groups.set(obj.symbolNumber, group);
  }
  return groups;
}

export function compareOcadObjects(
  objectsA: NormalizedOcadObject[],
  objectsB: NormalizedOcadObject[],
  meta: { fileNameA: string; fileNameB: string },
  options: OcadDiffOptions = {},
): OcadDiffResult {
  const started = Date.now();
  const tolerance = options.toleranceMeters ?? DEFAULT_TOLERANCE_METERS;
  const preferObjectIndex = options.matchByObjectIndex ?? true;

  const indexedA = objectsA.map((o, id) => ({ ...o, id }));
  const indexedB = objectsB.map((o, id) => ({ ...o, id }));

  const groupsA = groupBySymbol(indexedA);
  const groupsB = groupBySymbol(indexedB);
  const allSymbols = new Set([...groupsA.keys(), ...groupsB.keys()]);

  const allChanges: OcadObjectChange[] = [];
  let unchanged = 0;
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const symbolNumber of allSymbols) {
    const groupA = groupsA.get(symbolNumber) ?? [];
    const groupB = groupsB.get(symbolNumber) ?? [];
    const { matched, unmatchedA, unmatchedB } = matchSymbolGroup(
      groupA,
      groupB,
      tolerance,
      preferObjectIndex,
    );

    for (const { a, b, modified: isModified } of matched) {
      if (isModified) {
        modified += 1;
        allChanges.push(toChange("modified", b, a));
      } else {
        unchanged += 1;
      }
    }

    for (const obj of unmatchedA) {
      removed += 1;
      allChanges.push(toChange("removed", obj));
    }
    for (const obj of unmatchedB) {
      added += 1;
      allChanges.push(toChange("added", obj));
    }
  }

  return {
    versionA: { fileName: meta.fileNameA, objectCount: objectsA.length },
    versionB: { fileName: meta.fileNameB, objectCount: objectsB.length },
    durationMs: Date.now() - started,
    toleranceMeters: tolerance,
    added,
    removed,
    modified,
    unchanged,
    bySymbol: buildSymbolSummaries(allChanges),
    changes: allChanges,
    totalChanges: allChanges.length,
    changesTruncated: false,
    maxChangesApplied: null,
  };
}

export { isGeometryModified, markSwappedGeometryPairs, symmetricHausdorff } from "./geometry-compare";
