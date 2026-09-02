export type FieldEditGeometryKind = "point" | "line" | "area";

export type FieldEditAddPoint = {
  kind: "point";
  x: number;
  y: number;
  symbolNumber: number;
};

export type FieldEditAddLine = {
  kind: "line";
  coordinates: [number, number][];
  symbolNumber: number;
};

export type FieldEditAddArea = {
  kind: "area";
  ring: [number, number][];
  symbolNumber: number;
};

export type FieldEditAdd = FieldEditAddPoint | FieldEditAddLine | FieldEditAddArea;

export type FieldEditModify = {
  objectIndex: number;
  symbolNumber: number;
  geometryKind: FieldEditGeometryKind;
  coordinates: [number, number][];
};

export type FieldEditOps = {
  deletes: number[];
  adds: FieldEditAdd[];
  modifies: FieldEditModify[];
};

export function emptyFieldEditOps(): FieldEditOps {
  return { deletes: [], adds: [], modifies: [] };
}

function parseCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (![x, y].every(Number.isFinite)) return null;
  return [x, y];
}

function parseCoordinateList(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value.map(parseCoordinatePair).filter((p): p is [number, number] => p != null);
}

function parseLegacyAdd(raw: Record<string, unknown>): FieldEditAdd | null {
  const symbolNumber = Number(raw.symbolNumber);
  if (!Number.isFinite(symbolNumber)) return null;
  if (raw.kind === "line") {
    const coordinates = parseCoordinateList(raw.coordinates);
    if (coordinates.length < 2) return null;
    return { kind: "line", coordinates, symbolNumber };
  }
  if (raw.kind === "area") {
    const ring = parseCoordinateList(raw.ring);
    if (ring.length < 3) return null;
    return { kind: "area", ring, symbolNumber };
  }
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (![x, y].every(Number.isFinite)) return null;
  return { kind: "point", x, y, symbolNumber };
}

function parseModify(raw: unknown): FieldEditModify | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const objectIndex = Number(row.objectIndex);
  const symbolNumber = Number(row.symbolNumber);
  const geometryKind = row.geometryKind;
  if (!Number.isFinite(objectIndex) || !Number.isFinite(symbolNumber)) return null;
  if (geometryKind !== "point" && geometryKind !== "line" && geometryKind !== "area") return null;
  const coordinates = parseCoordinateList(row.coordinates);
  if (geometryKind === "point" && coordinates.length < 1) return null;
  if (geometryKind === "line" && coordinates.length < 2) return null;
  if (geometryKind === "area" && coordinates.length < 3) return null;
  return { objectIndex, symbolNumber, geometryKind, coordinates };
}

export function parseFieldEditOps(raw: string | null | undefined): FieldEditOps {
  if (!raw?.trim()) return emptyFieldEditOps();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyFieldEditOps();
    const record = parsed as Record<string, unknown>;
    const deletes = Array.isArray(record.deletes)
      ? record.deletes.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      : [];
    const adds = Array.isArray(record.adds)
      ? record.adds
          .map((item) =>
            item && typeof item === "object" ? parseLegacyAdd(item as Record<string, unknown>) : null,
          )
          .filter((item): item is FieldEditAdd => item != null)
      : [];
    const modifies = Array.isArray(record.modifies)
      ? record.modifies.map(parseModify).filter((item): item is FieldEditModify => item != null)
      : [];
    return { deletes, adds, modifies };
  } catch {
    return emptyFieldEditOps();
  }
}

export function serializeFieldEditOps(ops: FieldEditOps): string {
  return JSON.stringify(ops);
}

export function mergeFieldEditOps(current: FieldEditOps, patch: Partial<FieldEditOps>): FieldEditOps {
  return {
    deletes: patch.deletes ?? current.deletes,
    adds: patch.adds ?? current.adds,
    modifies: patch.modifies ?? current.modifies,
  };
}

export function countFieldEditChanges(ops: FieldEditOps): {
  deletes: number;
  adds: number;
  modifies: number;
} {
  return {
    deletes: ops.deletes.length,
    adds: ops.adds.length,
    modifies: ops.modifies.length,
  };
}

export function hasFieldEditChanges(ops: FieldEditOps): boolean {
  return ops.deletes.length > 0 || ops.adds.length > 0 || ops.modifies.length > 0;
}

/** Indices removed or replaced by modify ops. */
export function allRemovedIndices(ops: FieldEditOps): Set<number> {
  const removed = new Set(ops.deletes);
  for (const mod of ops.modifies) {
    removed.add(mod.objectIndex);
  }
  return removed;
}

export function resolveObjectCoordinates(
  objectIndex: number,
  original: [number, number][],
  ops: FieldEditOps,
): [number, number][] | null {
  if (ops.deletes.includes(objectIndex)) return null;
  const mod = ops.modifies.find((m) => m.objectIndex === objectIndex);
  return mod?.coordinates ?? original;
}
