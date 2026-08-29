"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { formatBytes, formatDateOnly, formatTimeOnly } from "@/lib/format";
import { VersionHistoryActions } from "@/components/version-history-actions";
import { VersionMapNotesButton } from "@/components/version-map-notes-button";
import { VersionPublishToggle } from "@/components/version-publish-toggle";
import { VersionRecommendedToggle } from "@/components/version-recommended-toggle";
import { HelpLinkIcon } from "@/components/help-link-icon";

export type VersionHistoryItem = {
  id: string;
  versionNumber: number;
  originalFilename: string;
  uploadedAt: string;
  fileSizeBytes: number;
  comment: string | null;
  parseStatus: string;
  objectCount: number | null;
  isPublished: boolean;
  isRecommended: boolean;
  uploaderLabel: string;
  previousVersionId?: string;
  canView: boolean;
};

type Props = {
  mapSlug: string;
  versions: VersionHistoryItem[];
  canManagePublication: boolean;
  canDelete?: boolean;
};

function versionMapHref(mapSlug: string, versionId: string): string {
  return `/maps/${mapSlug}/versions/${versionId}`;
}

function parseLabel(version: VersionHistoryItem): string {
  if (version.parseStatus === "OK") {
    return `${version.objectCount?.toLocaleString("sv-SE") ?? "?"} objekt`;
  }
  if (version.parseStatus === "PROCESSING") return "Parsar…";
  if (version.parseStatus === "ERROR") return "Parsningsfel";
  return "Väntar";
}

function stopRowNavigation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function VersionSummary({
  version,
  className = "",
}: {
  version: VersionHistoryItem;
  className?: string;
}) {
  const date = formatDateOnly(version.uploadedAt);

  return (
    <div className={className}>
      <span className="font-mono text-sm font-medium text-slate-800">v{version.versionNumber}</span>
      <span
        className={`mt-0.5 block text-sm ${version.canView ? "text-ifk-blue" : "text-slate-600"}`}
      >
        {date}
      </span>
    </div>
  );
}

const toggleBtn =
  "mt-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100";

const versionHistoryColgroup = (
  <colgroup>
    <col className="w-[10.5rem]" />
    <col className="w-[8%]" />
    <col className="w-[12%]" />
    <col />
    <col className="w-[9%]" />
    <col className="w-14" />
    <col className="w-[8rem]" />
  </colgroup>
);

function VersionHistoryTableHead({
  canManagePublication,
  compact = false,
}: {
  canManagePublication: boolean;
  compact?: boolean;
}) {
  const cellClass = compact
    ? "px-2 py-2.5 font-medium"
    : "px-2 pb-3 pt-4 font-medium";
  const firstCellClass = compact
    ? "px-2 py-2.5 pl-3 font-medium"
    : "px-2 pb-3 pl-3 pt-4 font-medium";

  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
        <th className={firstCellClass}>
          <div className="flex items-center gap-1">
            <span>Version</span>
            <HelpLinkIcon section="versioner" compact />
          </div>
        </th>
        <th className={cellClass}>Storlek</th>
        <th className={cellClass}>Uppladdare</th>
        <th className={cellClass}>Kommentar</th>
        <th className={cellClass}>Status</th>
        <th className={cellClass}>
          <div className="flex items-center gap-0.5">
            <span title="Publicerad">Pub.</span>
            {canManagePublication && (
              <HelpLinkIcon section="publicering" compact label="Hjälp om publicering" />
            )}
          </div>
        </th>
        <th className={cellClass}>Åtgärder</th>
      </tr>
    </thead>
  );
}

function VersionCard({
  version,
  mapSlug,
  canManagePublication,
  canDelete,
}: {
  version: VersionHistoryItem;
  mapSlug: string;
  canManagePublication: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const mapHref = versionMapHref(mapSlug, version.id);
  const timeTitle = formatTimeOnly(version.uploadedAt);

  const openMap = useCallback(() => {
    if (version.canView) router.push(mapHref);
  }, [mapHref, router, version.canView]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!version.canView) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        router.push(mapHref);
      }
    },
    [mapHref, router, version.canView],
  );

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        role={version.canView ? "link" : undefined}
        tabIndex={version.canView ? 0 : undefined}
        onClick={openMap}
        onKeyDown={handleKeyDown}
        title={version.canView ? `Öppna karta · ${timeTitle}` : timeTitle}
        className={
          version.canView
            ? "cursor-pointer rounded-lg outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-ifk-blue/30 -mx-1 px-1 py-1"
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <VersionSummary version={version} />
          </div>
          <p className="shrink-0 text-xs text-slate-500">{parseLabel(version)}</p>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
          <div>
            <dt className="text-slate-400">Storlek</dt>
            <dd className="mt-0.5">{formatBytes(version.fileSizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Uppladdare</dt>
            <dd className="mt-0.5 truncate">{version.uploaderLabel}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-400">Kommentar</dt>
            <dd className="mt-0.5 flex items-start gap-2">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {version.comment ?? "—"}
              </span>
              {version.canView && (
                <span
                  className="shrink-0"
                  onClick={stopRowNavigation}
                  onKeyDown={stopRowNavigation}
                >
                  <VersionMapNotesButton
                    mapSlug={mapSlug}
                    versionId={version.id}
                    versionNumber={version.versionNumber}
                  />
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 space-y-2" onClick={stopRowNavigation} onKeyDown={stopRowNavigation}>
        <VersionPublishToggle
          mapSlug={mapSlug}
          versionId={version.id}
          initialPublished={version.isPublished}
          parseStatus={version.parseStatus}
          canManage={canManagePublication}
        />
        <VersionRecommendedToggle
          mapSlug={mapSlug}
          versionId={version.id}
          initialRecommended={version.isRecommended}
          canManage={canManagePublication}
        />
      </div>

      <div className="mt-4" onClick={stopRowNavigation} onKeyDown={stopRowNavigation}>
        <VersionHistoryActions
          mapSlug={mapSlug}
          versionId={version.id}
          versionNumber={version.versionNumber}
          previousVersionId={version.previousVersionId}
          canView={version.canView}
          canDelete={canDelete}
        />
      </div>
    </li>
  );
}

function VersionRow({
  version,
  mapSlug,
  canManagePublication,
  canDelete,
}: {
  version: VersionHistoryItem;
  mapSlug: string;
  canManagePublication: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const mapHref = versionMapHref(mapSlug, version.id);
  const timeTitle = formatTimeOnly(version.uploadedAt);

  const openMap = useCallback(() => {
    if (version.canView) router.push(mapHref);
  }, [mapHref, router, version.canView]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (!version.canView) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        router.push(mapHref);
      }
    },
    [mapHref, router, version.canView],
  );

  return (
    <tr
      className={`border-b border-slate-100 last:border-0 ${
        version.canView ? "cursor-pointer hover:bg-slate-50/80" : ""
      }`}
      onClick={openMap}
      onKeyDown={handleKeyDown}
      tabIndex={version.canView ? 0 : undefined}
    >
      <td
        className="px-2 py-2 pl-3 align-top"
        title={version.canView ? `Öppna karta · ${timeTitle}` : timeTitle}
      >
        <VersionSummary version={version} className="py-1 pr-2" />
      </td>
      <td
        className="whitespace-nowrap px-2 py-2.5 text-slate-600"
        title={version.canView ? `Öppna karta · ${timeTitle}` : undefined}
      >
        {formatBytes(version.fileSizeBytes)}
      </td>
      <td
        className="px-2 py-2.5"
        title={version.uploaderLabel}
      >
        <span className="block truncate text-slate-600">{version.uploaderLabel}</span>
      </td>
      <td className="px-2 py-2.5" title={version.comment ?? undefined}>
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 line-clamp-2 break-words text-slate-600">
            {version.comment ?? "—"}
          </span>
          {version.canView && (
            <span
              className="shrink-0"
              onClick={stopRowNavigation}
              onKeyDown={stopRowNavigation}
            >
              <VersionMapNotesButton
                mapSlug={mapSlug}
                versionId={version.id}
                versionNumber={version.versionNumber}
              />
            </span>
          )}
        </div>
      </td>
      <td
        className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-500"
        title={version.canView ? `Öppna karta · ${timeTitle}` : undefined}
      >
        {parseLabel(version)}
      </td>
      <td
        className="px-2 py-2.5"
        onClick={stopRowNavigation}
        onKeyDown={stopRowNavigation}
      >
        <div className="flex flex-col gap-1">
          <VersionPublishToggle
            mapSlug={mapSlug}
            versionId={version.id}
            initialPublished={version.isPublished}
            parseStatus={version.parseStatus}
            canManage={canManagePublication}
            compact
          />
          <VersionRecommendedToggle
            mapSlug={mapSlug}
            versionId={version.id}
            initialRecommended={version.isRecommended}
            canManage={canManagePublication}
          />
        </div>
      </td>
      <td
        className="px-2 py-2.5"
        onClick={stopRowNavigation}
        onKeyDown={stopRowNavigation}
      >
        <VersionHistoryActions
          mapSlug={mapSlug}
          versionId={version.id}
          versionNumber={version.versionNumber}
          previousVersionId={version.previousVersionId}
          canView={version.canView}
          canDelete={canDelete}
        />
      </td>
    </tr>
  );
}

export function VersionHistoryList({
  mapSlug,
  versions,
  canManagePublication,
  canDelete = false,
}: Props) {
  const [showOlder, setShowOlder] = useState(false);

  const latestVersion = versions[0];
  const olderVersions = versions.slice(1);
  const olderCount = olderVersions.length;

  if (!latestVersion) return null;

  return (
    <>
      <div className="mt-4 overflow-x-auto md:hidden">
        <table className="w-full min-w-[36rem] table-fixed rounded-xl border border-slate-200 bg-white text-xs shadow-sm">
          {versionHistoryColgroup}
          <VersionHistoryTableHead canManagePublication={canManagePublication} compact />
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        <VersionCard
          version={latestVersion}
          mapSlug={mapSlug}
          canManagePublication={canManagePublication}
          canDelete={canDelete}
        />
        {showOlder &&
          olderVersions.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              mapSlug={mapSlug}
              canManagePublication={canManagePublication}
              canDelete={canDelete}
            />
          ))}
        {olderCount > 0 && (
          <li>
            <button
              type="button"
              className={toggleBtn}
              onClick={() => setShowOlder((value) => !value)}
              aria-expanded={showOlder}
            >
              {showOlder
                ? "Dölj äldre versioner"
                : `Visa alla tidigare versioner (${olderCount} st)`}
            </button>
          </li>
        )}
      </ul>

      <div className="mt-4 hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full table-fixed text-sm">
          {versionHistoryColgroup}
          <VersionHistoryTableHead canManagePublication={canManagePublication} />
          <tbody>
            <VersionRow
              version={latestVersion}
              mapSlug={mapSlug}
              canManagePublication={canManagePublication}
              canDelete={canDelete}
            />
            {showOlder &&
              olderVersions.map((version) => (
                <VersionRow
                  key={version.id}
                  version={version}
                  mapSlug={mapSlug}
                  canManagePublication={canManagePublication}
                  canDelete={canDelete}
                />
              ))}
            {olderCount > 0 && (
              <tr>
                <td colSpan={7} className="border-t border-slate-100 px-2 py-3">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    onClick={() => setShowOlder((value) => !value)}
                    aria-expanded={showOlder}
                  >
                    {showOlder
                      ? "Dölj äldre versioner"
                      : `Visa alla tidigare versioner (${olderCount} st)`}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
