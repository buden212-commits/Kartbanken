import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { parseSelectionJson, type CheckoutSelectionGeometry } from "@/lib/checkout/types";
import type { FieldEditAdd, FieldEditVertexKind } from "@/lib/field-edit/types";
import { closedRing } from "@/lib/field-edit/vertices";
import type { NormalizedOcadObject, OcadObjectType } from "@/lib/ocad/types";

export type FieldEditObjectEntry = {
  i: number;
  s: number;
  t: OcadObjectType;
  c: [number, number];
  b: [number, number, number, number];
  v: [number, number][];
};

/** Synthetic ids for ops.adds — never collide with OCAD objectIndex (≥ 0). */
export function isSyntheticAddObjectId(objectIndex: number): boolean {
  return objectIndex < 0;
}

export function syntheticAddObjectId(addIndex: number): number {
  return -(addIndex + 1);
}

export function addIndexFromSyntheticObjectId(objectIndex: number): number {
  return -objectIndex - 1;
}

function verticesFromObject(obj: NormalizedOcadObject): [number, number][] {
  if (obj.vertices && obj.vertices.length > 0) {
    const verts = obj.vertices.map(([x, y]) => [x, y] as [number, number]);
    if (obj.type === "area") return closedRing(verts);
    return verts;
  }
  if (obj.type === "point" || obj.type === "text") {
    return [obj.centroid];
  }
  const [minX, minY, maxX, maxY] = obj.bbox;
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

export function buildFieldEditObjectIndex(objects: NormalizedOcadObject[]): FieldEditObjectEntry[] {
  return objects.map((obj) => ({
    i: obj.objectIndex,
    s: obj.symbolNumber,
    t: obj.type,
    c: obj.centroid,
    b: obj.bbox,
    v: verticesFromObject(obj),
  }));
}

function bboxFromVertices(vertices: [number, number][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of vertices) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

function centroidFromVertices(vertices: [number, number][]): [number, number] {
  if (vertices.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of vertices) {
    sx += x;
    sy += y;
  }
  return [sx / vertices.length, sy / vertices.length];
}

/** Build hittable index entries for newly drawn objects (ops.adds). */
export function fieldEditEntriesFromAdds(adds: FieldEditAdd[]): FieldEditObjectEntry[] {
  const entries: FieldEditObjectEntry[] = [];
  for (let index = 0; index < adds.length; index++) {
    const add = adds[index]!;
    if (add.kind === "point") {
      const v: [number, number][] = [[add.x, add.y]];
      entries.push({
        i: syntheticAddObjectId(index),
        s: add.symbolNumber,
        t: "point",
        c: [add.x, add.y],
        b: [add.x, add.y, add.x, add.y],
        v,
      });
      continue;
    }
    if (add.kind === "line") {
      const v = add.coordinates.map(([x, y]) => [x, y] as [number, number]);
      if (v.length < 2) continue;
      entries.push({
        i: syntheticAddObjectId(index),
        s: add.symbolNumber,
        t: "line",
        c: centroidFromVertices(v),
        b: bboxFromVertices(v),
        v,
      });
      continue;
    }
    const v = closedRing(add.ring.map(([x, y]) => [x, y] as [number, number]));
    if (v.length < 3) continue;
    entries.push({
      i: syntheticAddObjectId(index),
      s: add.symbolNumber,
      t: "area",
      c: centroidFromVertices(v),
      b: bboxFromVertices(v),
      v,
    });
  }
  return entries;
}

/** Checkout objects plus newly drawn adds — used for hit-test, snap and selection. */
export function mergeFieldEditObjectsWithAdds(
  objects: FieldEditObjectEntry[],
  adds: FieldEditAdd[],
): FieldEditObjectEntry[] {
  const fromAdds = fieldEditEntriesFromAdds(adds);
  if (fromAdds.length === 0) return objects;
  return [...objects, ...fromAdds];
}

export function loadScopedFieldEditObjects(
  objects: NormalizedOcadObject[],
  selectionJson: string,
): FieldEditObjectEntry[] {
  const selection = parseSelectionJson(selectionJson);
  const scoped = filterObjectsInSelection(objects, selection.geometry);
  return buildFieldEditObjectIndex(scoped);
}

export function objectEntryByIndex(
  index: FieldEditObjectEntry[],
  objectIndex: number,
): FieldEditObjectEntry | null {
  return index.find((entry) => entry.i === objectIndex) ?? null;
}

export function selectionGeometryFromJson(selectionJson: string): CheckoutSelectionGeometry {
  return parseSelectionJson(selectionJson).geometry;
}


export function resolveSyntheticAddVertexKinds(
  objectIndex: number,
  coordinateCount: number,
  adds: FieldEditAdd[],
): FieldEditVertexKind[] | null {
  if (!isSyntheticAddObjectId(objectIndex)) return null;
  const addIndex = addIndexFromSyntheticObjectId(objectIndex);
  const add = adds[addIndex];
  if (!add || add.kind === "point") return [];
  const kinds = add.vertexKinds;
  if (!kinds?.length) return null;
  if (kinds.length === coordinateCount) return kinds.slice();
  if (kinds.length === coordinateCount + 1) return kinds.slice(0, coordinateCount);
  return null;
}
