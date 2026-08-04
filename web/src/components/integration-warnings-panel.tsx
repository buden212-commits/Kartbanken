"use client";

import { useMemo, useState } from "react";
import { DiffMapPanel } from "@/components/diff-map-panel";
import type { IntegrationWarning } from "@/lib/checkout/integration-warnings";
import { warningObjectsToChanges } from "@/lib/checkout/integration-warnings";

type Props = {
  warnings: IntegrationWarning[];
  versionNumber?: number;
  mapSlug?: string;
  checkoutId?: string;
  headVersionId?: string;
};

export function IntegrationWarningsPanel({
  warnings,
  versionNumber,
  mapSlug,
  checkoutId,
  headVersionId,
}: Props) {
  const [showMap, setShowMap] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const mapChanges = useMemo(() => warningObjectsToChanges(warnings), [warnings]);
  const objectCount = useMemo(
    () => warnings.reduce((sum, warning) => sum + warning.objects.length, 0),
    [warnings],
  );

  const selectedChange = selectedIndex !== null ? mapChanges[selectedIndex] ?? null : null;
  const focusTarget =
    selectedChange != null
      ? {
          bbox: selectedChange.bbox,
          centroid: selectedChange.centroid,
          objectType: selectedChange.type,
        }
      : null;

  const clickableItems = useMemo(
    () => mapChanges.map((change, index) => ({ change, index })),
    [mapChanges],
  );

  const canExport = !!(mapSlug && checkoutId && objectCount > 0);
  const canShowMap = !!(mapSlug && headVersionId && mapChanges.length > 0);
  const exportUrl =
    canExport
      ? `/api/maps/${mapSlug}/checkouts/${checkoutId}/warnings/export`
      : null;

  if (warnings.length === 0) return null;

  return (
    <section className="card border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-amber-950">
            {versionNumber != null
              ? `Integrerad som v${versionNumber} — manuell uppföljning krävs`
              : "Manuell uppföljning krävs efter integration"}
          </h2>
          <p className="mt-2 text-sm text-amber-900">
            Följande ändringar kunde inte appliceras automatiskt i aktuella versionen. Granska dem i
            OCAD Desktop.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canShowMap && (
            <button
              type="button"
              onClick={() => setShowMap((value) => !value)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-50"
            >
              {showMap ? "Dölj karta" : "Visa på karta"}
            </button>
          )}
          {exportUrl && (
            <a
              href={exportUrl}
              className="rounded-lg bg-ifk-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-ifk-blue/90"
            >
              Ladda ner felobjekt .ocd
            </a>
          )}
        </div>
      </div>

      {showMap && canShowMap && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-amber-900">
            Markörer visar felobjekt på aktuell karta. Klicka i listan eller på kartan för att zooma.
          </p>
          <DiffMapPanel
            previewUrl={`/api/maps/${mapSlug}/versions/${headVersionId}/preview`}
            title="Felobjekt"
            mapSlug={mapSlug!}
            versionId={headVersionId!}
            exportEnabled={false}
            focusTarget={focusTarget}
            selectedChange={selectedChange}
            clickableItems={clickableItems}
            onClearFocus={() => setSelectedIndex(null)}
            onObjectClick={setSelectedIndex}
          />
        </div>
      )}

      <div className="mt-4 space-y-4">
        {warnings.map((warning, index) => (
          <article
            key={`${warning.code}-${index}`}
            className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm"
          >
            <h3 className="font-medium text-slate-900">{warning.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{warning.reason}</p>

            {warning.objects.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {warning.objects.map((obj) => {
                  const changeIndex = mapChanges.findIndex(
                    (change) => change.objectIndex === obj.objectIndex,
                  );
                  const isSelected = changeIndex >= 0 && selectedIndex === changeIndex;
                  return (
                    <li key={`${warning.code}-${obj.objectIndex}-${obj.symbolNumber}`}>
                      <button
                        type="button"
                        disabled={changeIndex < 0 || !canShowMap}
                        onClick={() => {
                          if (changeIndex < 0) return;
                          setShowMap(true);
                          setSelectedIndex(changeIndex);
                        }}
                        className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-left transition disabled:cursor-default ${
                          isSelected
                            ? "bg-amber-50"
                            : canShowMap && changeIndex >= 0
                              ? "hover:bg-slate-50"
                              : ""
                        }`}
                      >
                        <span className="font-medium text-slate-900">
                          {obj.symbolNumber} {obj.symbolName}
                        </span>
                        <span className="text-slate-500">
                          {obj.typeLabel} · {obj.location}
                        </span>
                        <span className="text-xs text-slate-400">index {obj.objectIndex}</span>
                        {obj.text && (
                          <span className="w-full text-slate-600">Text: «{obj.text}»</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
