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

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14.5v1.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-slate-900">Publicerad karta</h2>
            <a
              href={`/api/maps/${mapSlug}/versions/${versionId}/download`}
              aria-label="Ladda ner publicerad karta"
              title="Ladda ner .ocd"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30"
            >
              <DownloadIcon />
            </a>
          </div>
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
