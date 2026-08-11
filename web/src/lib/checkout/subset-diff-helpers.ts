import type { NormalizedOcadObject } from "@/lib/ocad/types";
import type { OcadDiffResult } from "@/lib/ocad/diff-types";
import { sha256 } from "@/lib/hash";

export function buffersContentEqual(a: Buffer, b: Buffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return sha256(a) === sha256(b);
}

export function objectIdsFromParsed(objects: NormalizedOcadObject[]): Set<string> {
  const ids = new Set<string>();
  for (const object of objects) {
    if (object.objectIndex < 0) continue;
    ids.add(String(object.objectIndex));
  }
  return ids;
}

export function filterObjectsByIds(
  objects: NormalizedOcadObject[],
  ids: Set<string>,
): NormalizedOcadObject[] {
  return objects.filter((object) => ids.has(String(object.objectIndex)));
}

function objectFingerprint(object: NormalizedOcadObject): string {
  return `${object.symbolNumber}\t${object.geometryHash}\t${object.text ?? ""}`;
}

function objectMultiset(objects: NormalizedOcadObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const key = objectFingerprint(object);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function objectMultisetsEqual(
  objectsA: NormalizedOcadObject[],
  objectsB: NormalizedOcadObject[],
): boolean {
  if (objectsA.length !== objectsB.length) return false;

  const countsA = objectMultiset(objectsA);
  const countsB = objectMultiset(objectsB);

  if (countsA.size !== countsB.size) return false;

  for (const [key, count] of countsA) {
    if (countsB.get(key) !== count) return false;
  }

  return true;
}

/**
 * Objects to compare on the head side: those present in the exported checkout file.
 * Falls back to selection ids intersected with checkin when export is unavailable.
 */
export function resolveCheckoutDiffScopeIds(
  selectionObjectIds: Set<string>,
  exportObjectIds: Set<string> | null,
  checkinObjectIds: Set<string>,
): Set<string> {
  if (exportObjectIds && exportObjectIds.size > 0) {
    return exportObjectIds;
  }

  const scoped = new Set<string>();
  for (const id of selectionObjectIds) {
    if (checkinObjectIds.has(id)) {
      scoped.add(id);
    }
  }
  return scoped;
}

export function buildEmptyOcadDiffResult(
  meta: { fileNameA: string; fileNameB: string; objectCountA: number; objectCountB: number },
  toleranceMeters: number,
): OcadDiffResult {
  return {
    versionA: { fileName: meta.fileNameA, objectCount: meta.objectCountA },
    versionB: { fileName: meta.fileNameB, objectCount: meta.objectCountB },
    durationMs: 0,
    toleranceMeters,
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: meta.objectCountB,
    bySymbol: [],
    changes: [],
    totalChanges: 0,
    changesTruncated: false,
    maxChangesApplied: null,
  };
}
