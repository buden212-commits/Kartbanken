"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { FieldEditFavoriteSymbols } from "@/lib/field-edit/favorites";
import type { FieldEditGeometryKind } from "@/lib/field-edit/types";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import type { FieldEditSymbolCatalogEntry } from "@/lib/field-edit/symbol-catalog";
import { geometryKindForSymbolType } from "@/lib/field-edit/symbol-catalog";

export type SymbolChoice = {
  symNum: number;
  label: string;
  /** OCAD symbol-tree icon as PNG data URL (when available). */
  iconUrl?: string | null;
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

export function buildSymbolGroupsFromCatalog(
  entries: FieldEditSymbolCatalogEntry[],
): SymbolGroups {
  const groups: SymbolGroups = { point: [], line: [], area: [] };
  for (const entry of entries) {
    const kind = geometryKindForSymbolType(entry.type);
    if (!kind) continue;
    groups[kind].push({
      symNum: entry.symNum,
      label: entry.label,
      iconUrl: entry.iconUrl,
    });
  }
  return groups;
}

const GROUP_LABELS: Record<FieldEditGeometryKind, string> = {
  point: "Punkt",
  line: "Linje",
  area: "Yta",
};

function SymbolIcon({
  choice,
  size = 22,
}: {
  choice: SymbolChoice;
  size?: number;
}) {
  if (choice.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={choice.iconUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-sm border border-slate-200 bg-white object-contain"
        style={{ width: size, height: size, imageRendering: "pixelated" }}
        draggable={false}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm border border-dashed border-slate-300 bg-slate-50 text-[9px] font-medium text-slate-400"
      style={{ width: size, height: size }}
      aria-hidden
    >
      ?
    </span>
  );
}

type Props = {
  groups: SymbolGroups;
  kind: FieldEditGeometryKind;
  value: number | "";
  onChange: (symNum: number) => void;
  favorites?: FieldEditFavoriteSymbols;
  onToggleFavorite?: (symNum: number) => void;
};

export function FieldEditSymbolPicker({
  groups,
  kind,
  value,
  onChange,
  favorites,
  onToggleFavorite,
}: Props) {
  const choices = groups[kind];
  const favoriteNums = favorites?.[kind] ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = typeof value === "number" ? choices.find((c) => c.symNum === value) : null;
  const isFavorite = typeof value === "number" && favoriteNums.includes(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter((c) => c.label.toLowerCase().includes(q));
  }, [choices, query]);

  const favoriteChoices = useMemo(
    () =>
      favoriteNums
        .map((symNum) => filtered.find((c) => c.symNum === symNum))
        .filter((c): c is SymbolChoice => c != null),
    [favoriteNums, filtered],
  );
  const otherChoices = useMemo(
    () => filtered.filter((c) => !favoriteNums.includes(c.symNum)),
    [favoriteNums, filtered],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  function pick(symNum: number) {
    onChange(symNum);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex w-full flex-col gap-1 sm:w-auto sm:min-w-[260px]">
      <span className="text-sm text-slate-600">{GROUP_LABELS[kind]}-symbol</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="form-select flex min-h-11 w-full items-center gap-2 text-left sm:min-h-9"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <SymbolIcon choice={selected} />
            <span className="min-w-0 flex-1 truncate">{selected.label}</span>
          </>
        ) : (
          <span className="text-slate-400">
            {choices.length === 0 ? "Inga symboler" : "Välj symbol"}
          </span>
        )}
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-[min(100%,20rem)] max-w-[24rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl sm:min-w-[20rem]">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök symbol…"
              className="form-input min-h-9 w-full text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Inga träffar</p>
            ) : (
              <>
                {favoriteChoices.length > 0 && (
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Favoriter
                  </div>
                )}
                {favoriteChoices.map((choice) => (
                  <button
                    key={`fav-${choice.symNum}`}
                    type="button"
                    role="option"
                    aria-selected={choice.symNum === value}
                    onClick={() => pick(choice.symNum)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                      choice.symNum === value ? "bg-sky-50 text-sky-900" : "text-slate-800"
                    }`}
                  >
                    <SymbolIcon choice={choice} />
                    <span className="min-w-0 flex-1 truncate">★ {choice.label}</span>
                  </button>
                ))}
                {favoriteChoices.length > 0 && otherChoices.length > 0 && (
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Alla symboler
                  </div>
                )}
                {otherChoices.map((choice) => (
                  <button
                    key={choice.symNum}
                    type="button"
                    role="option"
                    aria-selected={choice.symNum === value}
                    onClick={() => pick(choice.symNum)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                      choice.symNum === value ? "bg-sky-50 text-sky-900" : "text-slate-800"
                    }`}
                  >
                    <SymbolIcon choice={choice} />
                    <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {onToggleFavorite && typeof value === "number" && (
        <button
          type="button"
          onClick={() => onToggleFavorite(value)}
          className="self-start text-xs font-medium text-ifk-blue hover:underline"
        >
          {isFavorite ? "Ta bort favorit" : "Spara som favorit"}
        </button>
      )}
    </div>
  );
}

export function defaultSymbolForKind(
  groups: SymbolGroups,
  kind: FieldEditGeometryKind,
  favorites?: FieldEditFavoriteSymbols,
): number | "" {
  const favorite = favorites?.[kind]?.[0];
  if (favorite != null && groups[kind].some((c) => c.symNum === favorite)) {
    return favorite;
  }
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
