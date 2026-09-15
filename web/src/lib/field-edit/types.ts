export type FieldEditGeometryKind = "point" | "line" | "area";

/** OCAD vertex kinds — maps to TdPoly yFlags (corner=0x01, dash=0x08). */
export type FieldEditVertexKind = "normal" | "corner" | "dash";

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
  /** Parallel to coordinates; defaults to normal when omitted. */
  vertexKinds?: FieldEditVertexKind[];
};

export type FieldEditAddArea = {
  kind: "area";
  ring: [number, number][];
  symbolNumber: number;
  vertexKinds?: FieldEditVertexKind[];
  /** Inner rings (holes); each should be a closed ring. */
  holes?: [number, number][][];
};

export type FieldEditAdd = FieldEditAddPoint | FieldEditAddLine | FieldEditAddArea;

export type FieldEditModify = {
  objectIndex: number;
  symbolNumber: number;
  geometryKind: FieldEditGeometryKind;
  coordinates: [number, number][];
  vertexKinds?: FieldEditVertexKind[];
  /** Inner rings (holes) for area objects. */
  holes?: [number, number][][];
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

function parseVertexKind(value: unknown): FieldEditVertexKind | null {
  if (value === "normal" || value === "corner" || value === "dash") return value;
  return null;
}

function parseVertexKinds(
  value: unknown,
  expectedLength: number,
): FieldEditVertexKind[] | undefined {
  if (!Array.isArray(value) || expectedLength <= 0) return undefined;
  const kinds = value.map(parseVertexKind);
  if (kinds.length !== expectedLength || kinds.some((k) => k == null)) return undefined;
  return kinds as FieldEditVertexKind[];
}

function parseHoleRings(value: unknown): [number, number][][] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const holes: [number, number][][] = [];
  for (const entry of value) {
    const ring = parseCoordinateList(entry);
    if (ring.length < 3) return undefined;
    holes.push(ring);
  }
  return holes;
}

export function defaultVertexKinds(count: number): FieldEditVertexKind[] {
  return Array.from({ length: Math.max(0, count) }, () => "normal" as const);
}

export function cycleVertexKind(kind: FieldEditVertexKind): FieldEditVertexKind {
  if (kind === "normal") return "dash";
  if (kind === "dash") return "corner";
  return "normal";
}

function parseLegacyAdd(raw: Record<string, unknown>): FieldEditAdd | null {
  const symbolNumber = Number(raw.symbolNumber);
  if (!Number.isFinite(symbolNumber)) return null;
  if (raw.kind === "line") {
    const coordinates = parseCoordinateList(raw.coordinates);
    if (coordinates.length < 2) return null;
    const vertexKinds = parseVertexKinds(raw.vertexKinds, coordinates.length);
    return { kind: "line", coordinates, symbolNumber, ...(vertexKinds ? { vertexKinds } : {}) };
  }
  if (raw.kind === "area") {
    const ring = parseCoordinateList(raw.ring);
    if (ring.length < 3) return null;
    const vertexKinds = parseVertexKinds(raw.vertexKinds, ring.length);
    const holes = parseHoleRings(raw.holes);
    return {
      kind: "area",
      ring,
      symbolNumber,
      ...(vertexKinds ? { vertexKinds } : {}),
      ...(holes ? { holes } : {}),
    };
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
  const vertexKinds = parseVertexKinds(row.vertexKinds, coordinates.length);
  const holes =
    geometryKind === "area" ? parseHoleRings(row.holes) : undefined;
  return {
    objectIndex,
    symbolNumber,
    geometryKind,
    coordinates,
    ...(vertexKinds ? { vertexKinds } : {}),
    ...(holes ? { holes } : {}),
  };
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

export function resolveObjectHoles(
  objectIndex: number,
  ops: FieldEditOps,
): [number, number][][] {
  const mod = ops.modifies.find((m) => m.objectIndex === objectIndex);
  return mod?.holes?.map((ring) => ring.map(([x, y]) => [x, y] as [number, number])) ?? [];
}

/**
 * Resolve vertex kinds for UI handles (`coordinateCount` = handle count,
 * i.e. area without duplicate closing corner).
 */
export function resolveObjectVertexKinds(
  objectIndex: number,
  coordinateCount: number,
  ops: FieldEditOps,
): FieldEditVertexKind[] {
  const mod = ops.modifies.find((m) => m.objectIndex === objectIndex);
  if (!mod?.vertexKinds?.length) return defaultVertexKinds(coordinateCount);
  const kinds = mod.vertexKinds;
  if (kinds.length === coordinateCount) return kinds.slice();
  // Stored closed ring: N+1 kinds for N handles
  if (kinds.length === coordinateCount + 1) return kinds.slice(0, coordinateCount);
  if (kinds.length === mod.coordinates.length) {
    return Array.from({ length: coordinateCount }, (_, i) => kinds[i] ?? "normal");
  }
  return defaultVertexKinds(coordinateCount);
}

/** Expand handle-aligned kinds to match stored coordinates (closed area ring). */
export function vertexKindsForStoredCoordinates(
  coordinates: [number, number][],
  handleKinds: FieldEditVertexKind[],
  geometryKind: FieldEditGeometryKind,
): FieldEditVertexKind[] {
  if (geometryKind === "point" || coordinates.length === 0) return [];
  if (geometryKind === "line") {
    const out = handleKinds.slice(0, coordinates.length);
    while (out.length < coordinates.length) out.push("normal");
    return out;
  }
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;
  const closed =
    coordinates.length >= 2 && first[0] === last[0] && first[1] === last[1];
  if (closed) {
    const n = coordinates.length - 1;
    const out: FieldEditVertexKind[] = [];
    for (let i = 0; i < n; i++) out.push(handleKinds[i] ?? "normal");
    out.push(out[0] ?? "normal");
    return out;
  }
  const out = handleKinds.slice(0, coordinates.length);
  while (out.length < coordinates.length) out.push("normal");
  return out;
}
