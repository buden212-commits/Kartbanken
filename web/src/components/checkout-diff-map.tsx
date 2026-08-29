"use client";

import { useMemo, useRef, useState } from "react";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { ChangeType } from "@/lib/ocad/diff-types";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { DiffChangesList } from "@/components/diff-changes-list";
import { getChangeCentroid } from "@/lib/ocad/change-utils";

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

const CHANGE_TAB: Record<ChangeType, MapTab> = {
  added: "added",
  removed: "removed",
  modified: "modified",
};

type MapTab = "full" | "added" | "removed" | "modified";
type ChangeFilter = "all" | ChangeType;

type LayerPaths = {
  added: string;
  removed: string;
  modified: string;
};

type Props = {
  mapSlug: string;
  checkoutId: string;
  headVersionId: string;
  changes: OcadObjectChange[];
  layerPaths: LayerPaths | null;
};

const MAP_TABS: { id: MapTab; label: string; description: string; legendClass: string }[] = [
  {
    id: "full",
    label: "Aktuell version",
    description: "Aktuell version (oförändrad bas)",
    legendClass: "text-slate-600",
  },
  {
    id: "added",
    label: "Nya objekt",
    description: "Tillagda objekt i incheckningen",
    legendClass: "text-emerald-600",
  },
  {
    id: "removed",
    label: "Raderade objekt",
    description: "Borttagna objekt från urvalet",
    legendClass: "text-red-600",
  },
  {
    id: "modified",
    label: "Ändrade objekt",
    description: "Ändrade objekt i urvalet",
    legendClass: "text-amber-600",
  },
];

const FILTER_OPTIONS: { id: ChangeFilter; label: string }[] = [
  { id: "all", label: "Alla" },
  { id: "added", label: "Tillagda" },
  { id: "removed", label: "Borttagna" },
  { id: "modified", label: "Ändrade" },
];

export function CheckoutDiffMap({
  mapSlug,
  checkoutId,
  headVersionId,
  changes,
  layerPaths,
}: Props) {
  const [activeTab, setActiveTab] = useState<MapTab>("full");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const focusRequestIdRef = useRef(0);

  const selectedChange = selectedIndex !== null ? changes[selectedIndex] : null;
  const selectedCentroid = useMemo(
    () => (selectedChange ? getChangeCentroid(selectedChange) : null),
    [selectedChange],
  );

  const focusTarget = useMemo(() => {
    if (!selectedChange || !selectedCentroid) return null;
    return {
      bbox: getChangeBbox(selectedChange),
      centroid: selectedCentroid,
      objectType: selectedChange.type,
    };
  }, [selectedChange, selectedCentroid]);

  const previewUrls = useMemo(
    () => ({
      full: `/api/maps/${mapSlug}/versions/${headVersionId}/preview`,
      added: `/api/maps/${mapSlug}/checkouts/${checkoutId}/diff/layer?layer=added`,
      removed: `/api/maps/${mapSlug}/checkouts/${checkoutId}/diff/layer?layer=removed`,
      modified: `/api/maps/${mapSlug}/checkouts/${checkoutId}/diff/layer?layer=modified`,
    }),
    [mapSlug, checkoutId, headVersionId],
  );

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
    focusRequestIdRef.current += 1;
    setFocusRequestId(focusRequestIdRef.current);
    setSelectedIndex(index);
    setActiveTab(CHANGE_TAB[change.changeType]);
  }

  function handleClearSelection() {
    setSelectedIndex(null);
  }

  const activeTabInfo = MAP_TABS.find((t) => t.id === activeTab)!;
  const hasChanges = changes.length > 0;

  return (
    <section className="card">
      <h2 className="text-lg font-medium text-slate-900">Kartvy — utcheckningsdiff</h2>
      <p className="mt-1 text-sm text-slate-600">
        Granska ändringar på kartan. Tryck på kartan eller i listan för objektinfo. Dra för att
        panorera, nyp eller använd +/− för att zooma.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {MAP_TABS.filter((tab) => tab.id !== "full" || hasChanges).map((tab) => (
          <span key={tab.id} className={`flex items-center gap-1.5 ${tab.legendClass}`}>
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                tab.id === "added"
                  ? "bg-emerald-500"
                  : tab.id === "removed"
                    ? "bg-red-500"
                    : tab.id === "modified"
                      ? "bg-amber-500"
                      : "bg-slate-400"
              }`}
              aria-hidden
            />
            {tab.label}
          </span>
        ))}
      </div>

      {!layerPaths && hasChanges && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Diff-lager saknas för denna utcheckning. Klicka &quot;Försök beräkna diff igen&quot; ovan
          för att generera kartlager.
        </p>
      )}

      {hasChanges && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {MAP_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-2 text-sm transition sm:px-4 ${
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
              mapSlug={mapSlug}
              versionId={headVersionId}
              exportEnabled={false}
              focusTarget={focusTarget}
              focusRequestId={focusRequestId}
              selectedChange={selectedChange}
              clickableItems={clickableItems}
              onClearFocus={handleClearSelection}
              onObjectClick={handleSelectChange}
            />
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-medium text-slate-900">Ändrade objekt</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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

            <DiffChangesList
              items={filteredChanges}
              selectedIndex={selectedIndex}
              onSelect={handleSelectChange}
              listLength={changes.length}
            />
          </div>
        </>
      )}

      {!hasChanges && (
        <div className="mt-4">
          <DiffMapPanel
            previewUrl={previewUrls.full}
            title="Aktuell version"
            mapSlug={mapSlug}
            versionId={headVersionId}
            exportEnabled={false}
          />
          <p className="mt-3 rounded-lg border border-ifk-blue/20 bg-ifk-blue-pale px-3 py-2 text-sm text-ifk-blue">
            Inga skillnader i utcheckningsurvalet — kartan visar aktuell version.
          </p>
        </div>
      )}
    </section>
  );
}
