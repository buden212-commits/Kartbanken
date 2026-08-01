import type { NormalizedOcadObject } from "./types";
import type {
  ChangeType,
  OcadDiffOptions,
  OcadDiffResult,
  OcadObjectChange,
  SymbolDiffSummary,
} from "./diff-types";

const DEFAULT_TOLERANCE_METERS = 2;
const DEFAULT_MAX_CHANGES = 500;

type IndexedObject = NormalizedOcadObject & { id: number };

function distance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

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

function matchSymbolGroup(
  groupA: IndexedObject[],
  groupB: IndexedObject[],
  tolerance: number,
): {
  matched: Array<{ a: IndexedObject; b: IndexedObject; modified: boolean }>;
  unmatchedA: IndexedObject[];
  unmatchedB: IndexedObject[];
} {
  const availableA = new Set(groupA.map((o) => o.id));
  const byIdA = new Map(groupA.map((o) => [o.id, o]));
  const matched: Array<{ a: IndexedObject; b: IndexedObject; modified: boolean }> = [];
  const unmatchedB: IndexedObject[] = [];

  const hashBuckets = new Map<string, number[]>();
  for (const obj of groupA) {
    const bucket = hashBuckets.get(obj.geometryHash) ?? [];
    bucket.push(obj.id);
    hashBuckets.set(obj.geometryHash, bucket);
  }

  const index = buildSpatialIndex(
    groupA.filter((o) => availableA.has(o.id)),
    tolerance,
  );

  for (const objB of groupB) {
    let bestId: number | null = null;
    let bestDist = tolerance;

    // Exakt geometri-match först (viktigt vid identiska filer)
    const hashCandidates = (hashBuckets.get(objB.geometryHash) ?? []).filter((id) =>
      availableA.has(id),
    );
    for (const candidateId of hashCandidates) {
      const objA = byIdA.get(candidateId);
      if (!objA) continue;
      const dist = distance(objA.centroid, objB.centroid);
      if (dist <= bestDist) {
        bestDist = dist;
        bestId = candidateId;
      }
    }

    // Spatial fallback
    if (bestId === null) {
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
    }

    if (bestId === null) {
      unmatchedB.push(objB);
      continue;
    }

    const objA = byIdA.get(bestId)!;
    availableA.delete(bestId);
    const modified =
      objA.geometryHash !== objB.geometryHash || (objA.text ?? "") !== (objB.text ?? "");
    matched.push({ a: objA, b: objB, modified });
  }

  return {
    matched,
    unmatchedA: groupA.filter((o) => availableA.has(o.id)),
    unmatchedB,
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
  const maxChanges = options.maxChanges ?? DEFAULT_MAX_CHANGES;

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
    const { matched, unmatchedA, unmatchedB } = matchSymbolGroup(groupA, groupB, tolerance);

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
    changes: allChanges.slice(0, maxChanges),
  };
}
