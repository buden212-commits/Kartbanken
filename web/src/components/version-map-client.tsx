"use client";

import Link from "next/link";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { useSuggestionMapOverlayControls } from "@/components/suggestion/suggestion-map-overlay";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
  fileName: string;
  objectCount: number | null;
  isPublished: boolean;
  canSuggest: boolean;
};

export function VersionMapClient({
  mapSlug,
  mapTitle,
  versionId,
  versionNumber,
  fileName,
  objectCount,
  isPublished,
  canSuggest,
}: Props) {
  const viewerUrl = `/maps/${mapSlug}/versions/${versionId}/viewer`;
  const { renderOverlay, toggle, overlays } = useSuggestionMapOverlayControls(mapSlug, versionId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Visa karta</h1>
          <p className="mt-2 break-words text-sm text-slate-600 sm:text-base">
            v{versionNumber} · {fileName}
            {objectCount != null && (
              <> · {objectCount.toLocaleString("sv-SE")} objekt</>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Dra för att panorera, nyp eller använd +/− för att zooma.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canSuggest && isPublished && (
            <Link
              href={`/maps/${mapSlug}/versions/${versionId}/suggest`}
              className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 transition hover:border-orange-400"
            >
              Föreslå ändring
            </Link>
          )}
          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-4 py-2 text-sm font-medium text-ifk-blue transition hover:border-ifk-blue"
          >
            Öppna i nytt fönster
          </a>
        </div>
      </div>

      <div className="mt-4 flex justify-end">{toggle}</div>

      <div className="mt-2 sm:mt-4">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
          title="Hela kartan"
          mapSlug={mapSlug}
          versionId={versionId}
          exportEnabled
          renderSvgOverlay={renderOverlay}
          suggestionOverlays={overlays}
        />
      </div>
    </div>
  );
}
