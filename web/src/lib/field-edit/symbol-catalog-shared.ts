import {
  OCAD_AREA_SYMBOL,
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
} from "@/lib/ocad/ocad-object-create";
import type { FieldEditGeometryKind } from "@/lib/field-edit/types";

export type FieldEditSymbolCatalogEntry = {
  symNum: number;
  label: string;
  type: number;
  iconUrl: string | null;
};

export type FieldEditSymbolCatalogGroups = Record<
  FieldEditGeometryKind,
  FieldEditSymbolCatalogEntry[]
>;

export function geometryKindForSymbolType(type: number): FieldEditGeometryKind | null {
  if (type === OCAD_POINT_SYMBOL) return "point";
  if (type === OCAD_LINE_SYMBOL || type === OCAD_LINE_TEXT_SYMBOL) return "line";
  if (type === OCAD_AREA_SYMBOL || type === OCAD_RECTANGLE_SYMBOL) return "area";
  return null;
}

export function groupFieldEditSymbolCatalog(
  entries: FieldEditSymbolCatalogEntry[],
): FieldEditSymbolCatalogGroups {
  const groups: FieldEditSymbolCatalogGroups = { point: [], line: [], area: [] };
  for (const entry of entries) {
    const kind = geometryKindForSymbolType(entry.type);
    if (!kind) continue;
    groups[kind].push(entry);
  }
  return groups;
}
