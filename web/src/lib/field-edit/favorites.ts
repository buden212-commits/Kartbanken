import type { FieldEditGeometryKind } from "@/lib/field-edit/types";

export type FieldEditFavoriteSymbols = {
  point: number[];
  line: number[];
  area: number[];
};

export function emptyFieldEditFavorites(): FieldEditFavoriteSymbols {
  return { point: [], line: [], area: [] };
}

export function parseFieldEditFavorites(raw: string | null | undefined): FieldEditFavoriteSymbols {
  if (!raw) return emptyFieldEditFavorites();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyFieldEditFavorites();
    const record = parsed as Record<string, unknown>;
    return {
      point: normalizeSymList(record.point),
      line: normalizeSymList(record.line),
      area: normalizeSymList(record.area),
    };
  } catch {
    return emptyFieldEditFavorites();
  }
}

function normalizeSymList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function serializeFieldEditFavorites(favorites: FieldEditFavoriteSymbols): string {
  return JSON.stringify({
    point: favorites.point,
    line: favorites.line,
    area: favorites.area,
  });
}

export function toggleFavoriteSymbol(
  favorites: FieldEditFavoriteSymbols,
  kind: FieldEditGeometryKind,
  symNum: number,
): FieldEditFavoriteSymbols {
  const current = favorites[kind];
  const next = current.includes(symNum)
    ? current.filter((n) => n !== symNum)
    : [...current, symNum];
  return { ...favorites, [kind]: next };
}

export function isFavoriteSymbol(
  favorites: FieldEditFavoriteSymbols,
  kind: FieldEditGeometryKind,
  symNum: number,
): boolean {
  return favorites[kind].includes(symNum);
}
