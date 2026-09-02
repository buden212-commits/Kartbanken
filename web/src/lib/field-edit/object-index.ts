import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { parseSelectionJson, type CheckoutSelectionGeometry } from "@/lib/checkout/types";
import type { NormalizedOcadObject, OcadObjectType } from "@/lib/ocad/types";

export type FieldEditObjectEntry = {
  i: number;
  s: number;
  t: OcadObjectType;
  c: [number, number];
  b: [number, number, number, number];
  v: [number, number][];
};

function verticesFromObject(obj: NormalizedOcadObject): [number, number][] {
  if (obj.vertices && obj.vertices.length > 0) {
    return obj.vertices.map(([x, y]) => [x, y] as [number, number]);
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
