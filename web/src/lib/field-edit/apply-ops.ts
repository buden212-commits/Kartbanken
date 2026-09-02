import { appendNewObjects } from "@/lib/ocad/ocad-integrate";
import { markObjectsDeletedByIndices } from "@/lib/ocad/ocad-export-server";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { pointInPolygon } from "@/lib/checkout/overlap";
import { parseSelectionJson, CheckoutSelectionType, type CheckoutSelectionGeometry } from "@/lib/checkout/types";
import {
  allRemovedIndices,
  hasFieldEditChanges,
  type FieldEditAdd,
  type FieldEditOps,
} from "./types";
import {
  buildSpecFromAdd,
  buildSpecFromModify,
  readOcadFileData,
} from "./build-object-spec";

function pointInSelectionGeometry(
  x: number,
  y: number,
  geometry: CheckoutSelectionGeometry,
): boolean {
  if (geometry.type === CheckoutSelectionType.BBOX) {
    const bbox = geometry.bbox;
    return x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY;
  }
  return pointInPolygon(x, y, geometry.ring);
}

function geometryTouchesSelection(
  coordinates: [number, number][],
  geometry: CheckoutSelectionGeometry,
): boolean {
  return coordinates.some(([x, y]) => pointInSelectionGeometry(x, y, geometry));
}

function validateAdd(add: FieldEditAdd, geometry: CheckoutSelectionGeometry): string | null {
  switch (add.kind) {
    case "point":
      if (!pointInSelectionGeometry(add.x, add.y, geometry)) {
        return "Ny punkt ligger utanför området";
      }
      return null;
    case "line":
      if (!geometryTouchesSelection(add.coordinates, geometry)) {
        return "Ny linje saknar punkter inom området";
      }
      return null;
    case "area":
      if (!geometryTouchesSelection(add.ring, geometry)) {
        return "Ny yta saknar hörn inom området";
      }
      return null;
  }
}

export type ApplyFieldEditResult = {
  buffer: Buffer;
  deletedCount: number;
  addedCount: number;
  modifiedCount: number;
};

export async function validateFieldEditOps(
  headBuffer: Buffer,
  fileName: string,
  selectionJson: string,
  ops: FieldEditOps,
): Promise<string | null> {
  const selection = parseSelectionJson(selectionJson);
  const parsed = await parseOcadBuffer(headBuffer, fileName);
  const scoped = new Set(
    filterObjectsInSelection(parsed.objects, selection.geometry).map((obj) => obj.objectIndex),
  );

  const removed = allRemovedIndices(ops);
  for (const objectIndex of removed) {
    if (!scoped.has(objectIndex)) {
      return `Objekt ${objectIndex} ligger utanför det utcheckade området`;
    }
  }

  for (const add of ops.adds) {
    const addError = validateAdd(add, selection.geometry);
    if (addError) return addError;
  }

  for (const modify of ops.modifies) {
    if (!scoped.has(modify.objectIndex)) {
      return `Ändrat objekt ${modify.objectIndex} ligger utanför området`;
    }
    if (modify.geometryKind === "line" && modify.coordinates.length < 2) {
      return `Linje ${modify.objectIndex} har för få punkter`;
    }
    if (modify.geometryKind === "area" && modify.coordinates.length < 3) {
      return `Yta ${modify.objectIndex} har för få hörn`;
    }
  }

  if (!hasFieldEditChanges(ops)) {
    return "Inga ändringar att publicera";
  }

  return null;
}

export async function applyFieldEditOps(
  headBuffer: Buffer,
  ops: FieldEditOps,
): Promise<ApplyFieldEditResult> {
  let working = Buffer.from(headBuffer);
  const removed = allRemovedIndices(ops);
  const deleteResult = markObjectsDeletedByIndices(working, removed);

  const specs = [];
  if (ops.adds.length > 0 || ops.modifies.length > 0) {
    const ocadFile = await readOcadFileData(working);
    for (const modify of ops.modifies) {
      specs.push(buildSpecFromModify(ocadFile, modify));
    }
    for (const add of ops.adds) {
      specs.push(buildSpecFromAdd(ocadFile, add));
    }
  }

  if (specs.length === 0) {
    return {
      buffer: working,
      deletedCount: deleteResult.deleted,
      addedCount: 0,
      modifiedCount: 0,
    };
  }

  const appendResult = appendNewObjects(working, specs);
  return {
    buffer: Buffer.from(appendResult.buffer),
    deletedCount: deleteResult.deleted,
    addedCount: ops.adds.length,
    modifiedCount: ops.modifies.length,
  };
}
