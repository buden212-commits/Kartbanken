"use client";

import {
  flattenOcadLayers,
  formatOcadSymbolNumber,
  type OcadMapLayer,
} from "@/lib/ocad/layers";
import {
  OCAD_AREA_SYMBOL,
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
} from "@/lib/ocad/ocad-object-create";
import type { FieldEditGeometryKind } from "@/lib/field-edit/types";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";

export type SymbolChoice = {
  symNum: number;
  label: string;
};

export type SymbolGroups = Record<FieldEditGeometryKind, SymbolChoice[]>;

function symbolChoices(layers: OcadMapLayer[], allowedTypes: number[]): SymbolChoice[] {
  const seen = new Set<number>();
  const choices: SymbolChoice[] = [];
  for (const layer of flattenOcadLayers(layers)) {
    if (layer.kind !== "symbol" || layer.symbolNum == null) continue;
    if (layer.symbolType != null && !allowedTypes.includes(layer.symbolType)) continue;
    if (seen.has(layer.symbolNum)) continue;
    seen.add(layer.symbolNum);
    const formatted = formatOcadSymbolNumber(layer.symbolNum);
    const desc = layer.name.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
    choices.push({
      symNum: layer.symbolNum,
      label: desc ? `${formatted} ${desc}` : formatted,
    });
  }
  choices.sort((a, b) => a.label.localeCompare(b.label, "sv"));
  return choices;
}

export function buildSymbolGroups(layers: OcadMapLayer[]): SymbolGroups {
  return {
    point: symbolChoices(layers, [OCAD_POINT_SYMBOL]),
    line: symbolChoices(layers, [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL]),
    area: symbolChoices(layers, [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL]),
  };
}

const GROUP_LABELS: Record<FieldEditGeometryKind, string> = {
  point: "Punkt",
  line: "Linje",
  area: "Yta",
};

type Props = {
  groups: SymbolGroups;
  kind: FieldEditGeometryKind;
  value: number | "";
  onChange: (symNum: number) => void;
};

export function FieldEditSymbolPicker({ groups, kind, value, onChange }: Props) {
  const choices = groups[kind];
  return (
    <label className="flex w-full flex-col gap-1 text-sm sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <span className="text-slate-600">{GROUP_LABELS[kind]}-symbol</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="form-select min-h-11 w-full sm:min-w-[200px] sm:min-h-0 sm:w-auto"
      >
        {choices.length === 0 ? (
          <option value="">Inga symboler</option>
        ) : (
          choices.map((choice) => (
            <option key={choice.symNum} value={choice.symNum}>
              {choice.label}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

export function defaultSymbolForKind(groups: SymbolGroups, kind: FieldEditGeometryKind): number | "" {
  return groups[kind][0]?.symNum ?? "";
}

export function objectGeometryKind(
  type: FieldEditObjectEntry["t"],
): FieldEditGeometryKind | null {
  if (type === "line") return "line";
  if (type === "area") return "area";
  if (type === "point" || type === "text") return "point";
  return null;
}

export function symbolFromMapObject(
  obj: FieldEditObjectEntry,
  targetKind: FieldEditGeometryKind,
): number | null {
  const objKind = objectGeometryKind(obj.t);
  if (objKind !== targetKind) return null;
  return obj.s;
}
