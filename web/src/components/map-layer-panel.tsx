"use client";

import { useMemo, useState } from "react";
import type { OcadMapLayer } from "@/lib/ocad/svg-utils";
import { flattenOcadLayers, formatOcadSymbolNumber } from "@/lib/ocad/layers";

type Props = {
  layers: OcadMapLayer[];
  visibility: Record<string, boolean>;
  onToggle: (layerId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
};

function layerMatchesQuery(layer: OcadMapLayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (layer.name.toLowerCase().includes(q)) return true;
  if (layer.symbolNum != null) {
    if (String(layer.symbolNum).includes(q)) return true;
    const formatted = formatOcadSymbolNumber(layer.symbolNum);
    if (formatted.toLowerCase().includes(q)) return true;
    // Match "601.002" against stored "601.2" style queries and vice versa
    const normalized = q.replace(/^(\d+)\.0*(\d+)$/, "$1.$2");
    if (formatted.toLowerCase().includes(normalized)) return true;
  }
  return false;
}

function filterLayerTree(layers: OcadMapLayer[], query: string): OcadMapLayer[] {
  if (!query.trim()) return layers;

  return layers
    .map((layer) => {
      const filteredChildren = layer.children
        ? filterLayerTree(layer.children, query)
        : [];
      const selfMatch = layerMatchesQuery(layer, query);
      if (selfMatch || filteredChildren.length > 0) {
        return {
          ...layer,
          children: filteredChildren.length > 0 ? filteredChildren : layer.children,
        };
      }
      return null;
    })
    .filter(Boolean) as OcadMapLayer[];
}

function displayLayerName(layer: OcadMapLayer): string {
  if (layer.kind === "symbol" && layer.symbolNum != null) {
    const formatted = formatOcadSymbolNumber(layer.symbolNum);
    const desc = layer.name.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
    return desc ? `${formatted} ${desc}` : formatted;
  }
  return layer.name;
}

function LayerTreeItem({
  layer,
  visibility,
  onToggle,
  depth,
  forceExpanded,
}: {
  layer: OcadMapLayer;
  visibility: Record<string, boolean>;
  onToggle: (layerId: string) => void;
  depth: number;
  forceExpanded: boolean;
}) {
  const hasChildren = (layer.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(layer.visible || layer.kind === "group");
  const isExpanded = forceExpanded || expanded;
  const checked = visibility[layer.id] !== false;
  const wasHiddenInOcad = !layer.visible;
  const isSymbol = layer.kind === "symbol";

  return (
    <li>
      <div
        className="flex items-start gap-1 rounded px-1 py-0.5 hover:bg-white"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-0.5 w-4 shrink-0 text-[10px] text-slate-400 hover:text-slate-700"
            aria-label={isExpanded ? "Fäll ihop" : "Expandera"}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="mt-0.5 w-4 shrink-0" />
        )}
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(layer.id)}
            className="mt-0.5 accent-ifk-blue"
          />
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate ${checked ? "text-slate-800" : "text-slate-400"} ${isSymbol ? "font-mono text-[11px]" : ""}`}
            >
              {displayLayerName(layer)}
              {!isSymbol && layer.locked && (
                <span className="ml-1 text-[10px] font-sans text-slate-400" title="Låst i OCAD">
                  låst
                </span>
              )}
              {!isSymbol && wasHiddenInOcad && (
                <span className="ml-1 text-[10px] font-sans text-amber-600" title="Dolt i OCAD">
                  (dolt)
                </span>
              )}
              {isSymbol && wasHiddenInOcad && (
                <span className="ml-1 text-[10px] font-sans text-amber-600">(dold symbol)</span>
              )}
              {isSymbol && layer.objectCount === 0 && (
                <span className="ml-1 text-[10px] font-sans text-slate-400">(0 objekt)</span>
              )}
            </span>
            <span className="text-[10px] text-slate-400">
              {layer.objectCount.toLocaleString("sv-SE")} objekt
            </span>
          </span>
        </label>
      </div>
      {hasChildren && isExpanded && (
        <ul className="space-y-0.5">
          {layer.children!.map((child) => (
            <LayerTreeItem
              key={child.id}
              layer={child}
              visibility={visibility}
              onToggle={onToggle}
              depth={depth + 1}
              forceExpanded={forceExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MapLayerPanel({
  layers,
  visibility,
  onToggle,
  onShowAll,
  onHideAll,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLayers = useMemo(
    () => filterLayerTree(layers, searchQuery),
    [layers, searchQuery],
  );

  if (layers.length === 0) return null;

  const flat = flattenOcadLayers(layers);
  const visibleCount = flat.filter((layer) => visibility[layer.id] !== false).length;
  const searching = searchQuery.trim().length > 0;

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-slate-700">
          Lager ({visibleCount}/{flat.length})
        </h4>
        <div className="flex gap-1 text-[11px]">
          <button
            type="button"
            onClick={onShowAll}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            Visa alla
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            Dölj alla
          </button>
        </div>
      </div>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Sök symbol, t.ex. 601.002 eller magnetisk…"
        className="form-input mb-2 w-full py-1 text-xs"
      />
      {filteredLayers.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">Inga lager matchar sökningen.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {filteredLayers.map((layer) => (
            <LayerTreeItem
              key={layer.id}
              layer={layer}
              visibility={visibility}
              onToggle={onToggle}
              depth={0}
              forceExpanded={searching}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
