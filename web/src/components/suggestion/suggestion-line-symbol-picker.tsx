"use client";

import { useMemo, useState } from "react";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import { ocadSymbolChoices, type OcadSymbolChoice } from "@/lib/ocad/ocad-symbol-choices";
import {
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
} from "@/lib/ocad/ocad-object-create";

type Props = {
  layers: OcadMapLayer[];
  value: number | null;
  onChange: (symNum: number) => void;
};

export function SuggestionLineSymbolPicker({ layers, value, onChange }: Props) {
  const [query, setQuery] = useState("");

  const choices = useMemo(
    () => ocadSymbolChoices(layers, [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL]),
    [layers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(
      (choice) =>
        choice.label.toLowerCase().includes(q) ||
        String(choice.symNum).includes(q),
    );
  }, [choices, query]);

  if (choices.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        Inga linjesymboler hittades i kartans lager — kontrollera att kartan har laddats.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-800">
          Linjelager för OCD-export
        </span>
        <span className="mb-2 block text-xs text-slate-500">
          Välj vilket linjelager GPS-spåret ska exporteras till i OCAD-filen.
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök symbol eller namn…"
          className="form-input w-full text-sm"
        />
      </label>
      <ul
        className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1"
        role="listbox"
        aria-label="Linjelager"
      >
        {filtered.map((choice) => (
          <LineSymbolOption
            key={choice.layerId}
            choice={choice}
            selected={value === choice.symNum}
            onSelect={() => onChange(choice.symNum)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-slate-500">Inga träffar</li>
        )}
      </ul>
    </div>
  );
}

function LineSymbolOption({
  choice,
  selected,
  onSelect,
}: {
  choice: OcadSymbolChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
          selected
            ? "bg-ifk-blue/10 font-medium text-ifk-blue ring-1 ring-ifk-blue/30"
            : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
            selected ? "border-ifk-blue bg-ifk-blue" : "border-slate-300 bg-white"
          }`}
          aria-hidden
        />
        <span className="min-w-0 truncate font-mono">{choice.label}</span>
      </button>
    </li>
  );
}
