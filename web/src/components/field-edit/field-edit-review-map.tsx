"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { fieldEditReviewOverlaySvg } from "@/components/field-edit/field-edit-overlay";
import type { CheckoutSelection } from "@/lib/checkout/types";
import {
  mergeFieldEditObjectsWithAdds,
  type FieldEditObjectEntry,
} from "@/lib/field-edit/object-index";
import {
  buildFieldEditReviewMapChanges,
  buildFieldEditReviewSummary,
  type FieldEditReviewSummary,
} from "@/lib/field-edit/review-summary";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { getChangeCentroid } from "@/lib/ocad/change-utils";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { SvgRootTransform } from "@/lib/ocad/svg-coords";

type Props = {
  mapSlug: string;
  sessionId: string;
  selection: CheckoutSelection;
  ops: FieldEditOps;
  /** Initial counts/labels; map always rebuilds from ops + objects. */
  summary: FieldEditReviewSummary;
};

type ChangeFilter = "all" | "added" | "removed" | "modified";

function changeBbox(change: OcadObjectChange): [number, number, number, number] {
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

export function FieldEditReviewMap({
  mapSlug,
  sessionId,
  selection,
  ops,
  summary,
}: Props) {
  const [objects, setObjects] = useState<FieldEditObjectEntry[]>([]);
  const [symbolPreview, setSymbolPreview] = useState<{
    svgInner: string;
    maskedIndices: number[];
  }>({ svgInner: "", maskedIndices: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<ChangeFilter>("all");

  const liveSummary = useMemo(
    () => buildFieldEditReviewSummary(ops, objects),
    [ops, objects],
  );

  const displaySummary =
    objects.length > 0
      ? liveSummary
      : {
          ...summary,
          // Prefer live labels (with addIndex) even before objects load.
          ...liveSummary,
          deletes: Math.max(summary.deletes, liveSummary.deletes),
          adds: Math.max(summary.adds, liveSummary.adds),
          modifies: Math.max(summary.modifies, liveSummary.modifies),
        };

  const mapChanges = useMemo(
    () => buildFieldEditReviewMapChanges(ops, objects, liveSummary),
    [ops, objects, liveSummary],
  );

  const editableObjects = useMemo(
    () => mergeFieldEditObjectsWithAdds(objects, ops.adds),
    [objects, ops.adds],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingPreview(true);
      setLoadError(null);
      try {
        const [objectsRes, previewRes] = await Promise.all([
          fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/objects`),
          fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/symbol-preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }),
        ]);
        if (cancelled) return;
        if (!objectsRes.ok) {
          const data = await objectsRes.json().catch(() => ({}));
          throw new Error(
            typeof data.error === "string" ? data.error : "Kunde inte ladda kartobjekt",
          );
        }
        const objectsData = await objectsRes.json();
        setObjects(Array.isArray(objectsData.objects) ? objectsData.objects : []);

        if (previewRes.ok) {
          const previewData = await previewRes.json();
          setSymbolPreview({
            svgInner: typeof previewData.svgInner === "string" ? previewData.svgInner : "",
            maskedIndices: Array.isArray(previewData.maskedIndices)
              ? previewData.maskedIndices.filter((v: unknown) => typeof v === "number")
              : [],
          });
        } else {
          setSymbolPreview({ svgInner: "", maskedIndices: [] });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Kunde inte ladda jämförelsekarta");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mapSlug, sessionId]);

  const selectedChange = selectedIndex != null ? (mapChanges[selectedIndex] ?? null) : null;
  const selectedCentroid = selectedChange ? getChangeCentroid(selectedChange) : null;
  const focusTarget =
    selectedChange && selectedCentroid
      ? {
          bbox: changeBbox(selectedChange),
          centroid: selectedCentroid,
          objectType: selectedChange.type,
        }
      : null;

  const filteredChanges = useMemo(() => {
    return mapChanges
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => (filter === "all" ? true : change.changeType === filter));
  }, [mapChanges, filter]);

  const clickableItems = useMemo(
    () => mapChanges.map((change, index) => ({ change, index })),
    [mapChanges],
  );

  const renderSvgOverlay = useCallback(
    (transform: SvgRootTransform) => (
      <g
        dangerouslySetInnerHTML={{
          __html: fieldEditReviewOverlaySvg({
            transform,
            selectionGeometry: selection.geometry,
            objects: editableObjects,
            ops,
            symbolPreviewInner: symbolPreview.svgInner,
            maskedObjectIndices: symbolPreview.maskedIndices,
            highlightObjectIndex: selectedChange?.objectIndex ?? null,
          }),
        }}
      />
    ),
    [selection.geometry, editableObjects, ops, symbolPreview, selectedChange?.objectIndex],
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Jämförelsekarta</h3>
        <p className="mt-1 text-sm text-slate-600">
          Ändringarna visas på kartan:{" "}
          <span className="text-red-700">rött = raderat</span>,{" "}
          <span className="text-amber-800">gult = ändrat</span>,{" "}
          <span className="text-emerald-700">grönt = nytt</span>. Klicka i listan eller på kartan
          för att zooma in.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-red-700">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
          Raderade ({displaySummary.deletes})
        </span>
        <span className="flex items-center gap-1.5 text-amber-800">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
          Ändrade ({displaySummary.modifies})
        </span>
        <span className="flex items-center gap-1.5 text-emerald-700">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
          Nya ({displaySummary.adds})
        </span>
      </div>

      {loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loadError}
        </p>
      )}
      {loadingPreview && !loadError && (
        <p className="text-sm text-slate-500">Laddar ändringar på kartan…</p>
      )}

      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/field-edits/${sessionId}/preview`}
        title="Jämförelse — fältredigering"
        mapSlug={mapSlug}
        versionId={sessionId}
        exportEnabled={false}
        focusTarget={focusTarget}
        selectedChange={selectedChange}
        clickableItems={clickableItems}
        onClearFocus={() => setSelectedIndex(null)}
        onObjectClick={setSelectedIndex}
        renderSvgOverlay={renderSvgOverlay}
        viewportClassName="h-[min(70svh,560px)] min-h-[280px]"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Alla"],
            ["removed", "Raderade"],
            ["modified", "Ändrade"],
            ["added", "Nya"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              filter === id
                ? "bg-ifk-blue-pale text-ifk-blue ring-1 ring-ifk-blue/30"
                : "border border-slate-300 text-slate-600 hover:border-ifk-blue hover:text-ifk-blue"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-sm">
        {filteredChanges.length === 0 ? (
          <li className="text-slate-500">Inga ändringar i filtret.</li>
        ) : (
          filteredChanges.map(({ change, index }) => (
            <li key={`${change.changeType}-${change.objectIndex}-${index}`}>
              <button
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50 ${
                  selectedIndex === index ? "bg-slate-100 ring-1 ring-ifk-blue/40" : ""
                } ${
                  change.changeType === "removed"
                    ? "text-red-700"
                    : change.changeType === "added"
                      ? "text-emerald-700"
                      : "text-amber-800"
                }`}
              >
                {change.symbolName}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
