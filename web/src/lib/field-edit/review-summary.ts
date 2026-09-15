import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import {
  countFieldEditChanges,
  type FieldEditAdd,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import {
  syntheticAddObjectId,
  type FieldEditObjectEntry,
} from "@/lib/field-edit/object-index";

export type FieldEditReviewChange = {
  kind: "delete" | "add" | "modify";
  label: string;
  objectIndex?: number;
  /** For adds: index in ops.adds (0-based). */
  addIndex?: number;
  symbolNumber?: number;
};

export type FieldEditReviewSummary = {
  deletes: number;
  adds: number;
  modifies: number;
  changes: FieldEditReviewChange[];
};

function bboxFromCoords(coords: [number, number][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

function centroidFromCoords(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of coords) {
    sx += x;
    sy += y;
  }
  return [sx / coords.length, sy / coords.length];
}

function coordsFromAdd(add: FieldEditAdd): [number, number][] {
  if (add.kind === "point") return [[add.x, add.y]];
  if (add.kind === "line") return add.coordinates;
  return add.ring;
}

export function buildFieldEditReviewSummary(
  ops: FieldEditOps,
  objects: FieldEditObjectEntry[] = [],
): FieldEditReviewSummary {
  const byIndex = new Map(objects.map((o) => [o.i, o]));
  const counts = countFieldEditChanges(ops);
  const changes: FieldEditReviewChange[] = [];

  for (const objectIndex of ops.deletes) {
    const obj = byIndex.get(objectIndex);
    changes.push({
      kind: "delete",
      objectIndex,
      symbolNumber: obj?.s,
      label: obj
        ? `Radera ${obj.t} ${formatOcadSymbolNumber(obj.s)} (#${objectIndex})`
        : `Radera objekt #${objectIndex}`,
    });
  }

  for (const modify of ops.modifies) {
    const obj = byIndex.get(modify.objectIndex);
    const symChanged = obj && obj.s !== modify.symbolNumber;
    changes.push({
      kind: "modify",
      objectIndex: modify.objectIndex,
      symbolNumber: modify.symbolNumber,
      label: symChanged
        ? `Ändra #${modify.objectIndex}: ${formatOcadSymbolNumber(obj.s)} → ${formatOcadSymbolNumber(modify.symbolNumber)}`
        : `Ändra ${modify.geometryKind} #${modify.objectIndex} (${formatOcadSymbolNumber(modify.symbolNumber)})`,
    });
  }

  for (const [index, add] of ops.adds.entries()) {
    changes.push({
      kind: "add",
      addIndex: index,
      objectIndex: syntheticAddObjectId(index),
      symbolNumber: add.symbolNumber,
      label: `Ny ${add.kind} ${formatOcadSymbolNumber(add.symbolNumber)} (${index + 1})`,
    });
  }

  return {
    deletes: counts.deletes,
    adds: counts.adds,
    modifies: counts.modifies,
    changes,
  };
}

/** Map-clickable / focusable changes for the admin review map. */
export function buildFieldEditReviewMapChanges(
  ops: FieldEditOps,
  objects: FieldEditObjectEntry[],
  summary: FieldEditReviewSummary,
): OcadObjectChange[] {
  const byIndex = new Map(objects.map((o) => [o.i, o]));
  const result: OcadObjectChange[] = [];

  for (const change of summary.changes) {
    if (change.kind === "delete" && change.objectIndex != null) {
      const obj = byIndex.get(change.objectIndex);
      if (!obj) continue;
      result.push({
        changeType: "removed",
        objectIndex: obj.i,
        symbolNumber: obj.s,
        symbolName: change.label,
        type: obj.t,
        centroid: obj.c,
        bbox: obj.b,
      });
      continue;
    }

    if (change.kind === "modify" && change.objectIndex != null) {
      const modify = ops.modifies.find((m) => m.objectIndex === change.objectIndex);
      const obj = byIndex.get(change.objectIndex);
      if (!modify || !obj) continue;
      const coords = modify.coordinates.length > 0 ? modify.coordinates : obj.v;
      result.push({
        changeType: "modified",
        objectIndex: modify.objectIndex,
        symbolNumber: modify.symbolNumber,
        symbolName: change.label,
        type: modify.geometryKind === "point" ? "point" : modify.geometryKind === "line" ? "line" : "area",
        centroid: centroidFromCoords(coords),
        bbox: bboxFromCoords(coords),
      });
      continue;
    }

    if (change.kind === "add" && change.addIndex != null) {
      const add = ops.adds[change.addIndex];
      if (!add) continue;
      const coords = coordsFromAdd(add);
      if (coords.length === 0) continue;
      result.push({
        changeType: "added",
        objectIndex: syntheticAddObjectId(change.addIndex),
        symbolNumber: add.symbolNumber,
        symbolName: change.label,
        type: add.kind === "point" ? "point" : add.kind === "line" ? "line" : "area",
        centroid: centroidFromCoords(coords),
        bbox: bboxFromCoords(coords),
      });
    }
  }

  return result;
}
