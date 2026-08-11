"use client";

import Link from "next/link";
import { DiffMapPanel } from "@/components/diff-map-panel";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
  publishedVersionId?: string;
};

export function FullscreenMapViewer({
  mapSlug,
  mapTitle,
  versionId,
  versionNumber,
  publishedVersionId,
}: Props) {
  const showCourseLink = publishedVersionId != null && versionId === publishedVersionId;

  return (
    <div className="flex h-dvh flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{mapTitle}</p>
          <p className="text-xs text-slate-500">v{versionNumber}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showCourseLink && (
            <Link
              href={`/maps/${mapSlug}/bana`}
              className="rounded-md border border-ifk-blue/40 bg-ifk-blue-pale px-2.5 py-1.5 text-xs font-medium text-ifk-blue transition hover:border-ifk-blue"
            >
              Lägg bana
            </Link>
          )}
          <Link
            href={`/maps/${mapSlug}/versions/${versionId}`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue"
          >
            Standardvy
          </Link>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
          title="Hela kartan"
          mapSlug={mapSlug}
          versionId={versionId}
          exportEnabled
          fullscreen
        />
      </div>
    </div>
  );
}
