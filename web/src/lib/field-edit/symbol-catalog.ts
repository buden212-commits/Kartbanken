import {
  OCAD_AREA_SYMBOL,
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
} from "@/lib/ocad/ocad-object-create";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { ocadIconBitsToPngDataUrl } from "@/lib/ocad/symbol-icon";
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

type OcadCatalogSymbol = {
  symNum: number;
  number?: string;
  description?: string;
  otp?: number;
  type?: number;
  iconBits?: number[];
  isHidden?: () => boolean;
};

type OcadCatalogFile = {
  symbols: OcadCatalogSymbol[];
};

export function geometryKindForSymbolType(type: number): FieldEditGeometryKind | null {
  if (type === OCAD_POINT_SYMBOL) return "point";
  if (type === OCAD_LINE_SYMBOL || type === OCAD_LINE_TEXT_SYMBOL) return "line";
  if (type === OCAD_AREA_SYMBOL || type === OCAD_RECTANGLE_SYMBOL) return "area";
  return null;
}

function symbolType(symbol: OcadCatalogSymbol): number | null {
  const value = symbol.otp ?? symbol.type;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function symbolLabel(symbol: OcadCatalogSymbol): string {
  const formatted = formatOcadSymbolNumber(symbol.symNum);
  const desc = (symbol.description ?? "").trim();
  return desc ? `${formatted} ${desc}` : formatted;
}

/** Build symbol catalogue (with OCAD tree icons) from a parsed OCD file. */
export async function buildFieldEditSymbolCatalog(
  ocadFile: OcadCatalogFile,
): Promise<FieldEditSymbolCatalogEntry[]> {
  const bySym = new Map<number, FieldEditSymbolCatalogEntry>();

  for (const symbol of ocadFile.symbols) {
    if (typeof symbol.symNum !== "number" || !Number.isFinite(symbol.symNum)) continue;
    if (symbol.isHidden?.()) continue;
    const type = symbolType(symbol);
    if (type == null || geometryKindForSymbolType(type) == null) continue;
    if (bySym.has(symbol.symNum)) continue;

    const iconUrl = await ocadIconBitsToPngDataUrl(symbol.iconBits);
    bySym.set(symbol.symNum, {
      symNum: symbol.symNum,
      label: symbolLabel(symbol),
      type,
      iconUrl,
    });
  }

  return [...bySym.values()].sort((a, b) => a.label.localeCompare(b.label, "sv"));
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
