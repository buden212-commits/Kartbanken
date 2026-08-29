"use client";

import { useEffect, useMemo, useState } from "react";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import { ocadSymbolChoices } from "@/lib/ocad/ocad-symbol-choices";
import type { OcdSuggestionSymbolMapping } from "@/lib/ocad/ocad-suggestion-export";
import type { SuggestionGeometry } from "@/lib/suggestion/types";
import {
  OCAD_AREA_SYMBOL,
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
} from "@/lib/ocad/ocad-object-create";
import { HelpSectionHeading } from "@/components/help-link-icon";

type Props = {
  layers: OcadMapLayer[];
  geometries?: SuggestionGeometry[];
  open: boolean;
  onCancel: () => void;
  onConfirm: (mapping: OcdSuggestionSymbolMapping) => void;
};

function defaultLineSymbolFromGeometries(
  geometries: SuggestionGeometry[] | undefined,
): number | "" {
  if (!geometries?.length) return "";
  const lineSymbols = geometries
    .filter((g): g is Extract<SuggestionGeometry, { type: "LineString" }> => g.type === "LineString")
    .map((g) => g.symbolNum)
    .filter((sym): sym is number => typeof sym === "number" && sym > 0);
  if (lineSymbols.length === 0) return "";
  const unique = new Set(lineSymbols);
  return unique.size === 1 ? lineSymbols[0]! : "";
}

function SymbolSelect({
  label,
  hint,
  value,
  choices,
  onChange,
  optional = false,
}: {
  label: string;
  hint: string;
  value: number | "";
  choices: ReturnType<typeof ocadSymbolChoices>;
  onChange: (symNum: number) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">{label}</span>
      <span className="mb-2 block text-xs text-slate-500">{hint}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="form-select w-full"
      >
        <option value="" disabled={!optional}>
          {optional ? "Använd symbol från markering…" : "Välj symbol…"}
        </option>
        {choices.map((choice) => (
          <option key={choice.symNum} value={choice.symNum}>
            {choice.label}
          </option>
        ))}
      </select>
      {choices.length === 0 && (
        <p className="mt-1 text-xs text-amber-700">
          Inga passande symboler hittades i kartans lager — välj en symbol som redan används på kartan.
        </p>
      )}
    </label>
  );
}

export function OcdSuggestionSymbolDialog({
  layers,
  geometries,
  open,
  onCancel,
  onConfirm,
}: Props) {
  const pointChoices = useMemo(
    () => ocadSymbolChoices(layers, [OCAD_POINT_SYMBOL]),
    [layers],
  );
  const lineChoices = useMemo(
    () => ocadSymbolChoices(layers, [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL]),
    [layers],
  );
  const areaChoices = useMemo(
    () => ocadSymbolChoices(layers, [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL]),
    [layers],
  );

  const presetLine = useMemo(
    () => defaultLineSymbolFromGeometries(geometries),
    [geometries],
  );
  const lineSymbolNumsFromGeometries = useMemo(() => {
    if (!geometries?.length) return [];
    return geometries
      .filter((g): g is Extract<SuggestionGeometry, { type: "LineString" }> => g.type === "LineString")
      .map((g) => g.symbolNum)
      .filter((sym): sym is number => typeof sym === "number" && sym > 0);
  }, [geometries]);

  const allLinesHaveSymbol = useMemo(() => {
    if (!geometries?.length) return false;
    const lines = geometries.filter((g) => g.type === "LineString");
    return lines.length > 0 && lines.every((g) => g.type === "LineString" && g.symbolNum != null && g.symbolNum > 0);
  }, [geometries]);

  const [point, setPoint] = useState<number | "">("");
  const [line, setLine] = useState<number | "">("");
  const [area, setArea] = useState<number | "">("");

  useEffect(() => {
    if (!open) return;
    setPoint("");
    setArea("");
    setLine(presetLine);
  }, [open, presetLine]);

  if (!open) return null;

  const effectiveLine = typeof line === "number" ? line : presetLine;
  const canConfirm =
    typeof point === "number" &&
    typeof area === "number" &&
    (typeof effectiveLine === "number" || allLinesHaveSymbol);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocd-suggestion-symbol-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <HelpSectionHeading section="kartvy" id="ocd-suggestion-symbol-title">
          Symboler för kartförslag
        </HelpSectionHeading>
        <p className="mt-2 text-sm text-slate-600">
          Välj vilka befintliga OCAD-symboler nya objekt ska få. Exportfilen innehåller bara
          kartförslagens markeringar — inte grundkartan. Symboltabellen från källkartan behålls
          (OCAD 12 / 2018).
        </p>

        <div className="mt-4 space-y-4">
          <SymbolSelect
            label="Punkt"
            hint="För kartförslag med enstaka markering."
            value={point}
            choices={pointChoices}
            onChange={setPoint}
          />
          <SymbolSelect
            label="Linje"
            hint={
              allLinesHaveSymbol
                ? "GPS-linjer har redan valt linjelager — detta gäller övriga linjer utan eget lager."
                : "För kartförslag ritade som linje."
            }
            value={line}
            choices={lineChoices}
            onChange={setLine}
            optional={allLinesHaveSymbol}
          />
          <SymbolSelect
            label="Yta / rektangel"
            hint="För polygoner och rektanglar."
            value={area}
            choices={areaChoices}
            onChange={setArea}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              const resolvedLine =
                typeof effectiveLine === "number"
                  ? effectiveLine
                  : lineSymbolNumsFromGeometries[0] ?? 0;
              onConfirm({ point, area, line: resolvedLine });
            }}
            className="btn-primary px-3 py-1.5 disabled:opacity-50"
          >
            Exportera OCD
          </button>
        </div>
      </div>
    </div>
  );
}
