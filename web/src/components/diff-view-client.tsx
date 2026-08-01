"use client";

import { useMemo, useState } from "react";
import type { OcadObjectChange, SymbolDiffSummary } from "@/lib/ocad/diff-types";
import type { ChangeType } from "@/lib/ocad/diff-types";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { formatChangeCentroid, getChangeCentroid } from "@/lib/ocad/change-utils";

function getChangeBbox(change: OcadObjectChange): [number, number, number, number] {
  const bbox = change.bbox;
  if (
    Array.isArray(bbox) &&
    bbox.length >= 4 &&
    bbox.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return bbox as [number, number, number, number];
  }
  const centroid = getChangeCentroid(change);
  if (centroid) {
    const [cx, cy] = centroid;
    return [cx, cy, cx, cy];
  }
  return [0, 0, 0, 0];
}

const CHANGE_LABELS: Record<ChangeType, string> = {
  added: "Tillagd",
  removed: "Borttagen",
  modified: "Ändrad",
};

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "text-emerald-600",
  removed: "text-red-600",
  modified: "text-amber-600",
};

const CHANGE_TAB: Record<ChangeType, MapTab> = {
  added: "added",
  removed: "removed",
  modified: "modified",
};

type MapTab = "full" | "added" | "removed" | "modified";
type ChangeFilter = "all" | ChangeType;
type DetailTab = "changes" | "symbols";

type DiffSummary = {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  durationMs: number;
  toleranceMeters: number;
  bySymbol: SymbolDiffSummary[];
  versionA: { fileName: string; objectCount: number };
  versionB: { fileName: string; objectCount: number };
};

type LayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

type PreviewUrls = {
  full: string;
  added: string;
  removed: string;
  modified: string;
};

type Props = {
  diff: DiffSummary;
  changes: OcadObjectChange[];
  versionALabel: string;
  versionBLabel: string;
  mapSlug?: string;
  versionAId?: string;
  versionBId?: string;
  previewUrls?: PreviewUrls;
  layerPaths: LayerPaths | null;
  exportEnabled?: boolean;
};

const MAP_TABS: { id: MapTab; label: string; description: string }[] = [
  { id: "full", label: "Hela kartan", description: "Senaste uppladdade versionen" },
  { id: "added", label: "Nya objekt", description: "Endast tillagda objekt" },
  { id: "removed", label: "Raderade objekt", description: "Endast borttagna objekt" },
  { id: "modified", label: "Ändrade objekt", description: "Endast ändrade objekt" },
];

const FILTER_OPTIONS: { id: ChangeFilter; label: string }[] = [
  { id: "all", label: "Alla" },
  { id: "added", label: "Tillagda" },
  { id: "removed", label: "Borttagna" },
  { id: "modified", label: "Ändrade" },
];

export function DiffViewClient({
  diff,
  changes,
  versionALabel,
  versionBLabel,
  mapSlug,
  versionAId,
  versionBId,
  previewUrls: previewUrlsProp,
  layerPaths,
  exportEnabled = true,
}: Props) {
  const [activeTab, setActiveTab] = useState<MapTab>("full");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("changes");

  const hasChanges = diff.added + diff.removed + diff.modified > 0;

  const selectedChange = selectedIndex !== null ? changes[selectedIndex] : null;

  const selectedCentroid = selectedChange ? getChangeCentroid(selectedChange) : null;

  const focusTarget =
    selectedChange && selectedCentroid
      ? {
          bbox: getChangeBbox(selectedChange),
          centroid: selectedCentroid,
          objectType: selectedChange.type,
        }
      : null;

  const previewUrls = useMemo(() => {
    if (previewUrlsProp) return previewUrlsProp;
    if (!mapSlug || !versionAId || !versionBId) {
      return { full: "", added: "", removed: "", modified: "" };
    }
    return {
      full: `/api/maps/${mapSlug}/versions/${versionBId}/preview`,
      added: `/api/maps/${mapSlug}/compare/layer?v1=${versionAId}&v2=${versionBId}&layer=added`,
      removed: `/api/maps/${mapSlug}/compare/layer?v1=${versionAId}&v2=${versionBId}&layer=removed`,
      modified: `/api/maps/${mapSlug}/compare/layer?v1=${versionAId}&v2=${versionBId}&layer=modified`,
    };
  }, [previewUrlsProp, mapSlug, versionAId, versionBId]);

  const filteredChanges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return changes
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => {
        if (changeFilter !== "all" && change.changeType !== changeFilter) return false;
        if (!q) return true;
        return (
          change.symbolName.toLowerCase().includes(q) ||
          String(change.symbolNumber).includes(q) ||
          (change.text?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [changes, changeFilter, searchQuery]);

  const clickableItems = useMemo(() => {
    return changes
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => {
        if (activeTab === "full") return true;
        if (activeTab === "added") return change.changeType === "added";
        if (activeTab === "removed") return change.changeType === "removed";
        if (activeTab === "modified") return change.changeType === "modified";
        return true;
      });
  }, [changes, activeTab]);

  function handleSelectChange(index: number) {
    const change = changes[index];
    if (!change) return;
    setSelectedIndex(index);
    setActiveTab(CHANGE_TAB[change.changeType]);
    setDetailTab("changes");
  }

  function handleClearSelection() {
    setSelectedIndex(null);
  }

  const activeTabInfo = MAP_TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="space-y-8">
      <section className="card">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Version A (äldre)</dt>
            <dd className="mt-1 font-medium text-slate-900">{versionALabel}</dd>
            <dd className="font-mono text-xs text-slate-600">{diff.versionA.fileName}</dd>
            <dd className="text-slate-600">
              {diff.versionA.objectCount.toLocaleString("sv-SE")} objekt
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Version B (nyare)</dt>
            <dd className="mt-1 font-medium text-slate-900">{versionBLabel}</dd>
            <dd className="font-mono text-xs text-slate-600">{diff.versionB.fileName}</dd>
            <dd className="text-slate-600">
              {diff.versionB.objectCount.toLocaleString("sv-SE")} objekt
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Diff på {(diff.durationMs / 1000).toFixed(2)} s · spatial tolerans {diff.toleranceMeters} m
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["Tillagda", diff.added, "text-emerald-600"],
          ["Borttagna", diff.removed, "text-red-600"],
          ["Ändrade", diff.modified, "text-amber-600"],
          ["Oförändrade", diff.unchanged, "text-slate-600"],
        ].map(([label, value, color]) => (
          <div
            key={label as string}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-600">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${color}`}>
              {(value as number).toLocaleString("sv-SE")}
            </p>
          </div>
        ))}
      </section>

      {hasChanges && (
        <>
          <section className="card">
            <h2 className="text-lg font-medium text-slate-900">Kartvyer</h2>
            <p className="mt-1 text-sm text-slate-600">
              Välj karta nedan. Klicka på kartan eller i ändringslistan för att se objektinfo.
            </p>

            {!layerPaths && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Diff-lager saknas för denna jämförelse. Ladda om sidan efter att diff beräknats.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {MAP_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm transition ${
                    activeTab === tab.id
                      ? "bg-ifk-blue text-white"
                      : "border border-slate-300 text-slate-700 hover:border-ifk-blue hover:text-ifk-blue"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs text-slate-500">{activeTabInfo.description}</p>

            <div className="mt-4">
              <DiffMapPanel
                previewUrl={previewUrls[activeTab]}
                title={activeTabInfo.label}
                mapSlug={mapSlug ?? ""}
                versionId={versionBId ?? ""}
                exportEnabled={exportEnabled}
                focusTarget={focusTarget}
                selectedChange={selectedChange}
                clickableItems={clickableItems}
                onClearFocus={handleClearSelection}
                onObjectClick={handleSelectChange}
              />
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
              <button
                type="button"
                onClick={() => setDetailTab("changes")}
                className={`rounded-lg px-4 py-2 text-sm transition ${
                  detailTab === "changes"
                    ? "bg-ifk-blue text-white"
                    : "border border-slate-300 text-slate-700 hover:border-ifk-blue hover:text-ifk-blue"
                }`}
              >
                Detaljerade ändringar
              </button>
              {diff.bySymbol.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailTab("symbols")}
                  className={`rounded-lg px-4 py-2 text-sm transition ${
                    detailTab === "symbols"
                      ? "bg-ifk-blue text-white"
                      : "border border-slate-300 text-slate-700 hover:border-ifk-blue hover:text-ifk-blue"
                  }`}
                >
                  Ändringar per symbol
                </button>
              )}
            </div>

            {detailTab === "symbols" && diff.bySymbol.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="pb-2 pr-4">Symbol</th>
                      <th className="pb-2 pr-4">Namn</th>
                      <th className="pb-2 pr-4 text-emerald-600">+</th>
                      <th className="pb-2 pr-4 text-red-600">−</th>
                      <th className="pb-2 text-amber-600">~</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.bySymbol.slice(0, 30).map((row) => (
                      <tr key={row.symbolNumber} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-mono">{row.symbolNumber}</td>
                        <td className="py-2 pr-4">{row.symbolName}</td>
                        <td className="py-2 pr-4 font-mono text-emerald-600">
                          {row.added || "—"}
                        </td>
                        <td className="py-2 pr-4 font-mono text-red-600">
                          {row.removed || "—"}
                        </td>
                        <td className="py-2 font-mono text-amber-600">
                          {row.modified || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === "changes" && (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChangeFilter(opt.id)}
                      className={`rounded-lg px-3 py-1.5 text-sm transition ${
                        changeFilter === opt.id
                          ? "bg-ifk-blue-pale text-ifk-blue ring-1 ring-ifk-blue/30"
                          : "border border-slate-300 text-slate-600 hover:border-ifk-blue hover:text-ifk-blue"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <input
                    type="search"
                    placeholder="Sök symbol, namn, text…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input ml-auto min-w-[200px] max-w-xs"
                  />
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  Visar {filteredChanges.length.toLocaleString("sv-SE")} av{" "}
                  {changes.length.toLocaleString("sv-SE")} ändringar
                  {changes.length < diff.added + diff.removed + diff.modified && (
                    <span>
                      {" "}
                      (totalt {(diff.added + diff.removed + diff.modified).toLocaleString("sv-SE")}{" "}
                      i diff)
                    </span>
                  )}
                  . Klicka på en rad för att zooma till objektet (punkter → 3000%).
                </p>

                <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto text-sm">
                  {filteredChanges.length === 0 ? (
                    <li className="py-6 text-center text-slate-500">
                      Inga ändringar matchar filtret.
                    </li>
                  ) : (
                    filteredChanges.map(({ change, index }) => (
                      <li key={`${change.objectIndex}-${change.symbolNumber}-${index}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectChange(index)}
                          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left transition ${
                            selectedIndex === index
                              ? "bg-ifk-blue-pale ring-1 ring-ifk-blue"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <span className={`font-medium ${CHANGE_COLORS[change.changeType]}`}>
                            {CHANGE_LABELS[change.changeType]}
                          </span>
                          <span className="font-mono text-slate-500">{change.symbolNumber}</span>
                          <span>{change.symbolName}</span>
                          {change.type === "point" && (
                            <span className="text-xs text-slate-400">punkt</span>
                          )}
                          <span className="font-mono text-xs text-slate-500">
                            {formatChangeCentroid(change)}
                          </span>
                          {change.text && (
                            <span className="text-slate-600">&quot;{change.text}&quot;</span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {!hasChanges && (
        <section className="rounded-xl border border-ifk-blue/20 bg-ifk-blue-pale p-6">
          <h2 className="text-lg font-medium text-ifk-blue">Inga skillnader</h2>
          <p className="mt-2 text-slate-700">
            Filerna är identiska enligt diff-motorn (inom {diff.toleranceMeters} m tolerans).
          </p>
        </section>
      )}
    </div>
  );
}

export type { DiffSummary, LayerPaths };
