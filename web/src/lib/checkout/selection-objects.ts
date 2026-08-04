import { bboxFromGeometry, pointInPolygon } from "./overlap";
import type { Bbox, CheckoutSelection, CheckoutSelectionGeometry } from "./types";
import { CheckoutSelectionType } from "./types";
import type { NormalizedOcadObject } from "@/lib/ocad/types";

function bboxToRing(bbox: Bbox): [number, number][] {
  return [
    [bbox.minX, bbox.minY],
    [bbox.maxX, bbox.minY],
    [bbox.maxX, bbox.maxY],
    [bbox.minX, bbox.maxY],
  ];
}

function objectIntersectsGeometry(
  object: NormalizedOcadObject,
  geometry: CheckoutSelectionGeometry,
): boolean {
  const [minX, minY, maxX, maxY] = object.bbox;
  const selectionBbox = bboxFromGeometry(geometry);

  if (
    maxX < selectionBbox.minX ||
    minX > selectionBbox.maxX ||
    maxY < selectionBbox.minY ||
    minY > selectionBbox.maxY
  ) {
    return false;
  }

  const ring =
    geometry.type === CheckoutSelectionType.POLYGON
      ? geometry.ring
      : bboxToRing(geometry.bbox);

  if (pointInPolygon(object.centroid[0], object.centroid[1], ring)) {
    return true;
  }

  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];

  return corners.some(([x, y]) => pointInPolygon(x, y, ring));
}

export function filterObjectsInSelection(
  objects: NormalizedOcadObject[],
  selection: CheckoutSelectionGeometry,
): NormalizedOcadObject[] {
  return objects.filter((object) => objectIntersectsGeometry(object, selection));
}

export function objectIdsFromSelection(
  objects: NormalizedOcadObject[],
  selection: CheckoutSelectionGeometry,
): string[] {
  return filterObjectsInSelection(objects, selection).map((object) =>
    String(object.objectIndex),
  );
}

export function selectionToCropBbox(selection: CheckoutSelectionGeometry): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const bbox = bboxFromGeometry(selection);
  return {
    x: bbox.minX,
    y: bbox.minY,
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
  };
}
