"use client";

import { useMemo, useState } from "react";
import {
  flattenOcadLayers,
  formatOcadSymbolNumber,
  type OcadMapLayer,
} from "@/lib/ocad/layers";
import type { OcdSuggestionSymbolMapping } from "@/lib/ocad/ocad-suggestion-export";
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
  open: boolean;
  onCancel: () => void;
  onConfirm: (mapping: OcdSuggestionSymbolMapping) => void;
};

type SymbolChoice = {
  symNum: number;
  label: string;
};

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

function SymbolSelect({
  label,
  hint,
  value,
  choices,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | "";
  choices: SymbolChoice[];
  onChange: (symNum: number) => void;
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
        <option value="" disabled>
          Välj symbol…
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

export function OcdSuggestionSymbolDialog({ layers, open, onCancel, onConfirm }: Props) {
  const pointChoices = useMemo(
    () => symbolChoices(layers, [OCAD_POINT_SYMBOL]),
    [layers],
  );
  const lineChoices = useMemo(
    () => symbolChoices(layers, [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL]),
    [layers],
  );
  const areaChoices = useMemo(
    () => symbolChoices(layers, [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL]),
    [layers],
  );

  const [point, setPoint] = useState<number | "">("");
  const [line, setLine] = useState<number | "">("");
  const [area, setArea] = useState<number | "">("");

  if (!open) return null;

  const canConfirm =
    typeof point === "number" && typeof line === "number" && typeof area === "number";

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
            hint="För kartförslag ritade som linje."
            value={line}
            choices={lineChoices}
            onChange={setLine}
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
              onConfirm({ point, line, area });
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
