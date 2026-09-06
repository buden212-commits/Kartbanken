import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { ocadIconBitsToPngDataUrl } from "@/lib/ocad/symbol-icon";
import {
  geometryKindForSymbolType,
  type FieldEditSymbolCatalogEntry,
} from "@/lib/field-edit/symbol-catalog-shared";

export type { FieldEditSymbolCatalogEntry, FieldEditSymbolCatalogGroups } from "@/lib/field-edit/symbol-catalog-shared";
export {
  geometryKindForSymbolType,
  groupFieldEditSymbolCatalog,
} from "@/lib/field-edit/symbol-catalog-shared";

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
