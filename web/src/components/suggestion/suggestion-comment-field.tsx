"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speechErrorMessage,
} from "@/lib/suggestion/speech-recognition";
import {
  extractOcadSymbolPicks,
  findActiveMarkingIndex,
  findMarkingLineEnd,
  flattenSymbolLabels,
  groupOcadSymbolPicks,
  insertTextAtCursor,
  markingGeometryKind,
  matchSpokenTextToSymbol,
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

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

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
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);

  const symbolPicks = useMemo(() => extractOcadSymbolPicks(ocadLayers), [ocadLayers]);

  const activeMarking = markings[activeMarkingIndex] ?? markings[0] ?? null;
  const activeGeometryKind = activeMarking ? markingGeometryKind(activeMarking) : undefined;

  const groupedSymbols = useMemo(
    () =>
      groupOcadSymbolPicks(symbolPicks, {
        geometryKind: activeGeometryKind,
        query: layerQuery,
      }),
    [symbolPicks, activeGeometryKind, layerQuery],
  );

  const quickLabels = useMemo(() => {
    if (layerQuery.trim()) return [];
    const groups = groupOcadSymbolPicks(symbolPicks, { geometryKind: activeGeometryKind });
    return flattenSymbolLabels(groups).slice(0, SUGGESTION_SYMBOL_QUICK_PICK_COUNT);
  }, [symbolPicks, activeGeometryKind, layerQuery]);

  const matchableLabels = useMemo(() => {
    const groups = groupOcadSymbolPicks(symbolPicks, { geometryKind: activeGeometryKind });
    return flattenSymbolLabels(groups);
  }, [symbolPicks, activeGeometryKind]);

  const totalSymbolCount = useMemo(
    () => groupedSymbols.reduce((sum, group) => sum + group.symbols.length, 0),
    [groupedSymbols],
  );

  const totalUnfilteredCount = useMemo(
    () =>
      flattenSymbolLabels(
        groupOcadSymbolPicks(symbolPicks, { geometryKind: activeGeometryKind }),
      ).length,
    [symbolPicks, activeGeometryKind],
  );

  const hasManySymbols = totalUnfilteredCount > SUGGESTION_SYMBOL_QUICK_PICK_COUNT;
  const showFullList = showAllLayers || Boolean(layerQuery.trim());

  useEffect(() => {
    setSpeechSupported(isSpeechRecognitionSupported());
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

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

  const insertSymbolRef = useRef(insertSymbol);
  const matchableLabelsRef = useRef(matchableLabels);
  insertSymbolRef.current = insertSymbol;
  matchableLabelsRef.current = matchableLabels;

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

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (disabled || listening) return;
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setSpeechStatus("Taligenkänning stöds inte i den här webbläsaren.");
      return;
    }

    recognitionRef.current = recognition;
    setSpeechStatus("Lyssnar… säg t.ex. «Sten»");
    setListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!transcript) {
        setSpeechStatus("Inget tal hördes — försök igen.");
        return;
      }
      const matched = matchSpokenTextToSymbol(transcript, matchableLabelsRef.current);
      const insertion = matched ?? transcript;
      insertSymbolRef.current(insertion);
      setSpeechStatus(
        matched
          ? `Infogade «${matched}»`
          : `Infogade «${transcript}» (ingen symbolmatch)`,
      );
    };

    recognition.onerror = (event) => {
      const message = speechErrorMessage(event.error);
      if (message) setSpeechStatus(message);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setSpeechStatus("Kunde inte starta mikrofonen.");
    }
  }, [disabled, listening]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  }, [listening, startListening, stopListening]);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor={id} className="form-label mb-0">
            Beskrivning
          </label>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || !value}
              onClick={() => {
                if (listening) stopListening();
                onChange("");
                setSpeechStatus(null);
                setActiveMarkingIndex(0);
                requestAnimationFrame(() => {
                  textareaRef.current?.focus();
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Rensa beskrivningen"
            >
              Rensa
            </button>
            {speechSupported && (
              <button
                type="button"
                disabled={disabled}
                onClick={toggleListening}
                className={
                  listening
                    ? "inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"
                    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-ifk-blue hover:bg-ifk-blue-pale hover:text-ifk-blue"
                }
                aria-pressed={listening}
                title={listening ? "Stoppa inspelning" : "Tala in symbolnamn"}
              >
                <MicIcon className="h-4 w-4" />
                {listening ? "Stoppa" : "Tala"}
              </button>
            )}
          </div>
        </div>
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
          En rad per markering. Välj markering och tryck på symbolnamn nedan, eller skriv fritt
          {speechSupported ? " — eller tala in (t.ex. «Sten»)." : "."}
        </p>
        {speechStatus && (
          <p
            className={`mt-1 text-xs ${listening ? "font-medium text-ifk-blue" : "text-slate-600"}`}
            role="status"
            aria-live="polite"
          >
            {speechStatus}
          </p>
        )}
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

          <input
            type="search"
            value={layerQuery}
            onChange={(e) => {
              setLayerQuery(e.target.value);
              if (e.target.value.trim()) setShowAllLayers(true);
            }}
            disabled={disabled}
            placeholder="Sök symbol eller grupp…"
            className="form-input mt-2 py-1.5 text-sm"
            aria-label="Sök symbol"
          />

          {!showFullList && quickLabels.length > 0 && (
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

          {showFullList && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
              {groupedSymbols.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500">
                  Inga symboler matchar{layerQuery.trim() ? " sökningen" : " för denna markeringstyp"}.
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
          )}

          {hasManySymbols && (
            <div className="mt-2">
              {!showAllLayers && !layerQuery.trim() ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setShowAllLayers(true)}
                  className="text-sm font-medium text-ifk-blue hover:underline"
                >
                  Visa alla symboler…
                </button>
              ) : (
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
              )}
            </div>
          )}

          {totalUnfilteredCount === 0 && activeMarking && (
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
