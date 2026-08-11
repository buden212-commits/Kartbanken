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

/** Symmetriskt Hausdorff-avstånd mellan två punktmängder (OCAD-koordinater ≈ meter). */
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
  const unchanged = pairs.filter((pair) => !pair.modified);
  if (unchanged.length < 2) return;

  for (let i = 0; i < unchanged.length; i++) {
    for (let j = i + 1; j < unchanged.length; j++) {
      const left = unchanged[i]!;
      const right = unchanged[j]!;
      if (
        left.a.geometryHash === right.b.geometryHash &&
        right.a.geometryHash === left.b.geometryHash &&
        left.a.geometryHash !== left.b.geometryHash
      ) {
        left.modified = true;
        right.modified = true;
      }
    }
  }
}
