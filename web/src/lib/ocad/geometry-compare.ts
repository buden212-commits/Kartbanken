import type { NormalizedOcadObject } from "./types";

export function euclideanDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function directedHausdorff(
  pointsA: [number, number][],
  pointsB: [number, number][],
): number {
  if (pointsA.length === 0 || pointsB.length === 0) {
    return Infinity;
  }

  let maxMin = 0;
  for (const pointA of pointsA) {
    let minDist = Infinity;
    for (const pointB of pointsB) {
      minDist = Math.min(minDist, euclideanDistance(pointA, pointB));
    }
    maxMin = Math.max(maxMin, minDist);
  }
  return maxMin;
}

/** Symmetriskt Hausdorff-avstånd mellan två punktmängder (samma enhet som koordinaterna). */
export function symmetricHausdorff(
  pointsA: [number, number][],
  pointsB: [number, number][],
): number {
  if (pointsA.length === 0 && pointsB.length === 0) return 0;
  return Math.max(directedHausdorff(pointsA, pointsB), directedHausdorff(pointsB, pointsA));
}

function verticesForCompare(obj: NormalizedOcadObject): [number, number][] | null {
  if (obj.vertices && obj.vertices.length > 0) {
    return obj.vertices;
  }
  if (obj.type === "point") {
    return [obj.centroid];
  }
  return null;
}

/**
 * Avgör om ett par objekt ska räknas som geometriskt ändrat.
 * Linjer: Hausdorff inom tolerans → oförändrade trots hash-skillnad.
 */
export function isGeometryModified(
  objA: NormalizedOcadObject,
  objB: NormalizedOcadObject,
  toleranceMeters: number,
): boolean {
  if ((objA.text ?? "") !== (objB.text ?? "")) {
    return true;
  }

  if (objA.geometryHash === objB.geometryHash) {
    return false;
  }

  const vertsA = verticesForCompare(objA);
  const vertsB = verticesForCompare(objB);

  if (objA.type === "line" && objB.type === "line" && vertsA && vertsB) {
    if (vertsA.length < 2 || vertsB.length < 2) {
      return euclideanDistance(objA.centroid, objB.centroid) > toleranceMeters;
    }
    return symmetricHausdorff(vertsA, vertsB) > toleranceMeters;
  }

  if (objA.type === "point" && objB.type === "point") {
    return euclideanDistance(objA.centroid, objB.centroid) > toleranceMeters;
  }

  return true;
}

type MatchedPair = {
  a: NormalizedOcadObject;
  b: NormalizedOcadObject;
  modified: boolean;
};

/**
 * Upptäck korsvis bytta geometrier som spatial matchning kan missa
 * (A1↔B1 och A2↔B2 oförändrade trots att innehåll bytts: A1↔B2, A2↔B1).
 */
export function markSwappedGeometryPairs(pairs: MatchedPair[]): void {
  // Only "unchanged within tolerance" pairs whose hashes differ can hide a swap;
  // identical-hash pairs (the vast majority) are skipped, keeping this linear.
  const candidates = pairs.filter(
    (pair) => !pair.modified && pair.a.geometryHash !== pair.b.geometryHash,
  );
  if (candidates.length < 2) return;

  const byHashPair = new Map<string, MatchedPair[]>();
  for (const pair of candidates) {
    const key = `${pair.a.geometryHash}\t${pair.b.geometryHash}`;
    const bucket = byHashPair.get(key) ?? [];
    bucket.push(pair);
    byHashPair.set(key, bucket);
  }

  for (const left of candidates) {
    const mirrored = byHashPair.get(`${left.b.geometryHash}\t${left.a.geometryHash}`);
    if (!mirrored?.length) continue;
    left.modified = true;
    for (const right of mirrored) right.modified = true;
  }
}
