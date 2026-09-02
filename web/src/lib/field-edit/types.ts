export type FieldEditAddPoint = {
  x: number;
  y: number;
  symbolNumber: number;
};

export type FieldEditOps = {
  deletes: number[];
  adds: FieldEditAddPoint[];
};

export function emptyFieldEditOps(): FieldEditOps {
  return { deletes: [], adds: [] };
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
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const x = Number(row.x);
            const y = Number(row.y);
            const symbolNumber = Number(row.symbolNumber);
            if (![x, y, symbolNumber].every(Number.isFinite)) return null;
            return { x, y, symbolNumber };
          })
          .filter((item): item is FieldEditAddPoint => item != null)
      : [];
    return { deletes, adds };
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
  };
}
