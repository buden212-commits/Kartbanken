import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import {
  countFieldEditChanges,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";

export type FieldEditReviewChange = {
  kind: "delete" | "add" | "modify";
  label: string;
  objectIndex?: number;
  symbolNumber?: number;
};

export type FieldEditReviewSummary = {
  deletes: number;
  adds: number;
  modifies: number;
  changes: FieldEditReviewChange[];
};

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
