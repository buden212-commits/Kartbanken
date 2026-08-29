import {
  flattenOcadLayers,
  formatOcadSymbolNumber,
  type OcadMapLayer,
} from "@/lib/ocad/layers";

export type OcadSymbolChoice = {
  symNum: number;
  label: string;
  layerId: string;
};

export function ocadSymbolChoices(
  layers: OcadMapLayer[],
  allowedTypes: number[],
): OcadSymbolChoice[] {
  const seen = new Set<number>();
  const choices: OcadSymbolChoice[] = [];

  for (const layer of flattenOcadLayers(layers)) {
    if (layer.kind !== "symbol" || layer.symbolNum == null) continue;
    if (layer.symbolType != null && !allowedTypes.includes(layer.symbolType)) continue;
    if (seen.has(layer.symbolNum)) continue;
    seen.add(layer.symbolNum);

    const formatted = formatOcadSymbolNumber(layer.symbolNum);
    const desc = layer.name.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
    choices.push({
      symNum: layer.symbolNum,
      layerId: layer.id,
      label: desc ? `${formatted} ${desc}` : formatted,
    });
  }

  choices.sort((a, b) => a.label.localeCompare(b.label, "sv"));
  return choices;
}

export function findOcadSymbolLabel(
  layers: OcadMapLayer[],
  symNum: number,
): string | null {
  for (const layer of flattenOcadLayers(layers)) {
    if (layer.kind === "symbol" && layer.symbolNum === symNum) {
      const formatted = formatOcadSymbolNumber(symNum);
      const desc = layer.name.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
      return desc ? `${formatted} ${desc}` : formatted;
    }
  }
  return null;
}
