"use client";

import Link from "next/link";
import { DiffMapPanel } from "@/components/diff-map-panel";

type Props = {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  originalFilename?: string | null;
  objectCount?: number | null;
};

/** Compact preview of the published map on the area page. */
export function PublishedMapPreview({
  mapSlug,
  versionId,
  versionNumber,
  originalFilename,
  objectCount,
}: Props) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-slate-900">Publicerad karta</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            v{versionNumber}
            {originalFilename ? ` · ${originalFilename}` : ""}
            {objectCount != null
              ? ` · ${objectCount.toLocaleString("sv-SE")} objekt`
              : ""}
          </p>
        </div>
        <Link
          href={`/maps/${mapSlug}/versions/${versionId}`}
          className="rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-3 py-1.5 text-sm font-medium text-ifk-blue transition hover:border-ifk-blue"
        >
          Öppna kartvy
        </Link>
      </div>
      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
        title="Publicerad karta"
        mapSlug={mapSlug}
        versionId={versionId}
        basemap="tiles"
        exportEnabled={false}
        showLayerPanel={false}
        viewportClassName="h-[min(50svh,420px)] min-h-[220px]"
      />
    </section>
  );
}
