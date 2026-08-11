"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  extractOcadSymbolPicks,
  findActiveMarkingIndex,
  findMarkingLineEnd,
  flattenSymbolLabels,
  groupOcadSymbolPicks,
  insertTextAtCursor,
  markingGeometryKind,
  SUGGESTION_SYMBOL_QUICK_PICK_COUNT,
  suggestionMarkingGeometryLabel,
} from "@/lib/suggestion/suggestion-comment-template";
import type { SuggestionGeometry } from "@/lib/suggestion/types";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ocadLayers: OcadMapLayer[];
  markings: SuggestionGeometry[];
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
};

const chipBtn =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-ifk-blue hover:bg-ifk-blue-pale hover:text-ifk-blue active:scale-[0.99]";
const chipBtnActive =
  "w-full rounded-lg border border-ifk-blue bg-ifk-blue-pale px-3 py-2 text-left text-sm font-medium text-ifk-blue";

export function SuggestionCommentField({
  id = "comment",
  value,
  onChange,
  ocadLayers,
  markings,
  disabled = false,
  required = true,
  minLength = 2,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [layerQuery, setLayerQuery] = useState("");
  const [showAllLayers, setShowAllLayers] = useState(false);
  const [activeMarkingIndex, setActiveMarkingIndex] = useState(0);

  const symbolPicks = useMemo(() => extractOcadSymbolPicks(ocadLayers), [ocadLayers]);

  const activeMarking = markings[activeMarkingIndex] ?? markings[0] ?? null;
  const activeGeometryKind = activeMarking ? markingGeometryKind(activeMarking) : undefined;

  const groupedSymbols = useMemo(
    () =>
      groupOcadSymbolPicks(symbolPicks, {
        geometryKind: activeGeometryKind,
        query: showAllLayers ? layerQuery : undefined,
      }),
    [symbolPicks, activeGeometryKind, showAllLayers, layerQuery],
  );

  const quickLabels = useMemo(() => {
    const groups = groupOcadSymbolPicks(symbolPicks, { geometryKind: activeGeometryKind });
    return flattenSymbolLabels(groups).slice(0, SUGGESTION_SYMBOL_QUICK_PICK_COUNT);
  }, [symbolPicks, activeGeometryKind]);

  const totalSymbolCount = useMemo(
    () => groupedSymbols.reduce((sum, group) => sum + group.symbols.length, 0),
    [groupedSymbols],
  );

  const hasManySymbols =
    flattenSymbolLabels(
      groupOcadSymbolPicks(symbolPicks, { geometryKind: activeGeometryKind }),
    ).length > SUGGESTION_SYMBOL_QUICK_PICK_COUNT;

  const syncActiveMarkingFromCursor = useCallback(() => {
    const el = textareaRef.current;
    if (!el || markings.length === 0) return;
    const index = findActiveMarkingIndex(value, el.selectionStart ?? 0, markings.length);
    setActiveMarkingIndex(index);
  }, [markings.length, value]);

  const insertSymbol = useCallback(
    (insertion: string) => {
      const el = textareaRef.current;
      // Alltid i slutet av aktiv markering — knappar blur:ar textarea och selection blir 0 på mobil.
      const lineEnd = findMarkingLineEnd(value, activeMarkingIndex);
      const { next, cursor } = insertTextAtCursor(value, insertion, lineEnd, lineEnd);
      onChange(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(cursor, cursor);
        setActiveMarkingIndex(findActiveMarkingIndex(next, cursor, markings.length));
      });
    },
    [activeMarkingIndex, markings.length, onChange, value],
  );

  const focusMarkingLine = useCallback(
    (index: number) => {
      const el = textareaRef.current;
      if (!el) return;
      setActiveMarkingIndex(index);
      const end = findMarkingLineEnd(value, index);
      el.focus();
      // Markören i slutet så «1. Punkt — » behålls när man infogar symbol.
      el.setSelectionRange(end, end);
    },
    [value],
  );

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="form-label">
          Beskrivning
        </label>
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={syncActiveMarkingFromCursor}
          onKeyUp={syncActiveMarkingFromCursor}
          onSelect={syncActiveMarkingFromCursor}
          required={required}
          minLength={minLength}
          rows={Math.min(Math.max(markings.length + 2, 4), 10)}
          disabled={disabled}
          autoFocus
          className="form-input font-mono text-sm leading-relaxed"
          placeholder="Beskriv vad som är fel, saknas eller bör förklaras (minst 2 tecken)."
        />
        <p className="mt-1 text-xs text-slate-500">
          En rad per markering. Välj markering och tryck på symbolnamn nedan, eller skriv fritt.
        </p>
      </div>

      {markings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600">Aktiv markering</p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {markings.map((marking, index) => (
              <button
                key={index}
                type="button"
                disabled={disabled}
                onClick={() => focusMarkingLine(index)}
                className={index === activeMarkingIndex ? chipBtnActive : chipBtn}
                title={suggestionMarkingGeometryLabel(marking)}
              >
                {index + 1} · {suggestionMarkingGeometryLabel(marking)}
              </button>
            ))}
          </div>
        </div>
      )}

      {symbolPicks.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">
            Infoga symbol
            {activeMarking
              ? ` för markering ${activeMarkingIndex + 1} (${suggestionMarkingGeometryLabel(activeMarking)})`
              : ""}
            {totalSymbolCount > 0 ? ` · ${totalSymbolCount} val` : " · inga matchande symboler"}
          </p>

          {quickLabels.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {quickLabels.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => insertSymbol(label)}
                  className={chipBtn}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {hasManySymbols && (
            <div className="mt-2 space-y-2">
              {!showAllLayers ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setShowAllLayers(true)}
                  className="text-sm font-medium text-ifk-blue hover:underline"
                >
                  Visa alla symboler…
                </button>
              ) : (
                <>
                  <input
                    type="search"
                    value={layerQuery}
                    onChange={(e) => setLayerQuery(e.target.value)}
                    disabled={disabled}
                    placeholder="Sök symbol eller grupp…"
                    className="form-input py-1.5 text-sm"
                    aria-label="Sök symbol"
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                    {groupedSymbols.length === 0 ? (
                      <p className="px-1 py-2 text-sm text-slate-500">
                        Inga symboler matchar för denna markeringstyp.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {groupedSymbols.map((group) => (
                          <div key={group.groupName}>
                            <p className="text-xs font-semibold text-slate-500">{group.groupName}</p>
                            <div className="mt-1 flex flex-col gap-1.5">
                              {group.symbols.map((symbol) => (
                                <button
                                  key={`${group.groupName}-${symbol.label}`}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => insertSymbol(symbol.label)}
                                  className={chipBtn}
                                >
                                  {symbol.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setShowAllLayers(false);
                      setLayerQuery("");
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Dölj listan
                  </button>
                </>
              )}
            </div>
          )}

          {totalSymbolCount === 0 && activeMarking && (
            <p className="mt-2 text-xs text-slate-500">
              Inga {suggestionMarkingGeometryLabel(activeMarking).toLowerCase()}-symboler med objekt på
              kartan. Skriv manuellt eller byt markering.
            </p>
          )}
        </div>
      )}

      {symbolPicks.length === 0 && (
        <p className="text-xs text-slate-500">
          Symboler laddas från kartfilen — om listan är tom, skriv terrängtyp manuellt.
        </p>
      )}
    </div>
  );
}
