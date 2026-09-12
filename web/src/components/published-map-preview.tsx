"use client";

import Link from "next/link";
import { DiffMapPanel } from "@/components/diff-map-panel";

type Props = {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
};

export function PublishedMapPreview({
  mapSlug,
  versionId,
  versionNumber,
}: Props) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-slate-900">Publicerad karta</h2>
          <p className="mt-1 text-sm text-slate-600">
            Senaste publicerade version (v{versionNumber}). Dra för att panorera, nyp eller använd
            +/− för att zooma.
          </p>
        </div>
        <Link
          href={`/maps/${mapSlug}/versions/${versionId}`}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue"
        >
          Öppna karta
        </Link>
      </div>
      <div className="mt-3">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
          title={`Publicerad karta v${versionNumber}`}
          mapSlug={mapSlug}
          versionId={versionId}
        />
      </div>
    </section>
  );
}
