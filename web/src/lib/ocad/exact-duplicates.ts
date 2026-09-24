import type { OcadObjectChange } from "./diff-types";
import type { NormalizedOcadObject, OcadObjectType } from "./types";

/** Fingerprint for exact object identity (symbol + geometry + text). */
export function objectContentKey(
  object: Pick<NormalizedOcadObject, "symbolNumber" | "geometryHash" | "text">,
): string {
  return `${object.symbolNumber}\t${object.geometryHash}\t${object.text ?? ""}`;
}

export type ExactDuplicateGroup = {
  key: string;
  symbolNumber: number;
  symbolName: string;
  geometryHash: string;
  text?: string;
  type: OcadObjectType;
  count: number;
  objectIndices: number[];
  centroid: [number, number];
};

/**
 * Groups objects that are exact clones (same symbol, geometry hash and text)
 * but different objectIndex. Count ≥ 2 ⇒ duplicate cluster.
 */
export function findExactDuplicateGroups(
  objects: NormalizedOcadObject[],
): ExactDuplicateGroup[] {
  const buckets = new Map<string, NormalizedOcadObject[]>();

  for (const object of objects) {
    const key = objectContentKey(object);
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  }

  const groups: ExactDuplicateGroup[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const first = bucket[0]!;
    groups.push({
      key,
      symbolNumber: first.symbolNumber,
      symbolName: first.symbolName,
      geometryHash: first.geometryHash,
      text: first.text,
      type: first.type,
      count: bucket.length,
      objectIndices: bucket.map((object) => object.objectIndex).sort((a, b) => a - b),
      centroid: first.centroid,
    });
  }

  return groups.sort(
    (a, b) => b.count - a.count || a.symbolNumber - b.symbolNumber,
  );
}

function formatIndices(indices: number[], max = 8): string {
  if (indices.length <= max) return indices.join(", ");
  return `${indices.slice(0, max).join(", ")} … (+${indices.length - max})`;
}

/**
 * Validation messages for check-in review:
 * - exact clones inside the checked-in file
 * - added objects that are exact copies of something already in the baseline
 */
export function buildCheckinDuplicateValidationWarnings(
  checkinObjects: NormalizedOcadObject[],
  baselineObjects: NormalizedOcadObject[],
  addedChanges: OcadObjectChange[],
): string[] {
  const warnings: string[] = [];

  const internal = findExactDuplicateGroups(checkinObjects);
  if (internal.length > 0) {
    const extraCopies = internal.reduce((sum, group) => sum + (group.count - 1), 0);
    const samples = internal.slice(0, 5).map((group) => {
      const textPart = group.text ? `, text «${group.text}»` : "";
      return `${group.symbolNumber} ${group.symbolName} ×${group.count} (index ${formatIndices(group.objectIndices)})${textPart}`;
    });
    const more =
      internal.length > 5 ? ` — plus ${internal.length - 5} ytterligare grupper` : "";
    warnings.push(
      `Incheckningen innehåller ${extraCopies} exakt${extraCopies === 1 ? "" : "a"} dubblett${extraCopies === 1 ? "" : "er"} ` +
        `(${internal.length} grupp${internal.length === 1 ? "" : "er"} med identisk geometri): ${samples.join("; ")}${more}.`,
    );
  }

  if (addedChanges.length === 0 || baselineObjects.length === 0) {
    return warnings;
  }

  const baselineKeys = new Map<string, NormalizedOcadObject>();
  for (const object of baselineObjects) {
    const key = objectContentKey(object);
    if (!baselineKeys.has(key)) baselineKeys.set(key, object);
  }

  const copyAdds: OcadObjectChange[] = [];
  for (const change of addedChanges) {
    if (!change.geometryHash) continue;
    const key = objectContentKey({
      symbolNumber: change.symbolNumber,
      geometryHash: change.geometryHash,
      text: change.text,
    });
    if (baselineKeys.has(key)) copyAdds.push(change);
  }

  if (copyAdds.length > 0) {
    const samples = copyAdds.slice(0, 5).map((change) => {
      const textPart = change.text ? `, text «${change.text}»` : "";
      return `${change.symbolNumber} ${change.symbolName} (index ${change.objectIndex})${textPart}`;
    });
    const more =
      copyAdds.length > 5 ? ` — plus ${copyAdds.length - 5} till` : "";
    warnings.push(
      `${copyAdds.length} tillagd${copyAdds.length === 1 ? "" : "a"} objekt är exakta kopior av objekt som redan finns i utcheckningsfilen ` +
        `(samma symbol och geometri) — risk för dubbletter vid integration: ${samples.join("; ")}${more}.`,
    );
  }

  return warnings;
}
