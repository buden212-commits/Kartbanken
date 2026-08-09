"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateOnly } from "@/lib/format";

export type VersionCompareOption = {
  id: string;
  versionNumber: number;
  uploadedAt: string;
  isPublished: boolean;
};

type Props = {
  mapSlug: string;
  versions: VersionCompareOption[];
};

function versionLabel(version: VersionCompareOption): string {
  const date = formatDateOnly(version.uploadedAt);
  const pub = version.isPublished ? " · publicerad" : "";
  return `v${version.versionNumber} (${date}${pub})`;
}

export function VersionComparePicker({ mapSlug, versions }: Props) {
  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions],
  );

  const [fromId, setFromId] = useState(() => sorted[1]?.id ?? sorted[0]?.id ?? "");
  const [toId, setToId] = useState(() => sorted[0]?.id ?? "");

  const fromVersion = sorted.find((v) => v.id === fromId) ?? null;
  const toVersion = sorted.find((v) => v.id === toId) ?? null;

  const compareHref = useMemo(() => {
    if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) {
      return null;
    }
    const [older, newer] =
      fromVersion.versionNumber < toVersion.versionNumber
        ? [fromVersion, toVersion]
        : [toVersion, fromVersion];
    return `/maps/${mapSlug}/compare?v1=${older.id}&v2=${newer.id}`;
  }, [fromVersion, toVersion, mapSlug]);

  if (sorted.length < 2) {
    return null;
  }

  const selectionError =
    fromVersion && toVersion && fromVersion.id === toVersion.id
      ? "Välj två olika versioner."
      : null;

  return (
    <div className="rounded-xl border border-ifk-blue/20 bg-ifk-blue-pale/40 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">Jämför versioner</p>
      <p className="mt-1 text-xs text-slate-600">
        Välj två versioner — skillnader visas från äldre till nyare (samma vy som vid uppladdning).
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block text-xs text-slate-600">Version A</span>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {sorted.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version)}
              </option>
            ))}
          </select>
        </label>

        <span className="hidden pb-2 text-sm text-slate-500 sm:inline" aria-hidden>
          →
        </span>

        <label className="min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block text-xs text-slate-600">Version B</span>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {sorted.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version)}
              </option>
            ))}
          </select>
        </label>

        {compareHref ? (
          <Link
            href={compareHref}
            className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-ifk-blue/90"
          >
            Jämför
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2 text-sm font-medium text-white"
          >
            Jämför
          </button>
        )}
      </div>

      {selectionError && (
        <p className="mt-2 text-xs text-red-700">{selectionError}</p>
      )}

      {compareHref && fromVersion && toVersion && (
        <p className="mt-2 text-xs text-slate-500">
          Jämför v
          {fromVersion.versionNumber < toVersion.versionNumber
            ? fromVersion.versionNumber
            : toVersion.versionNumber}{" "}
          → v
          {fromVersion.versionNumber > toVersion.versionNumber
            ? fromVersion.versionNumber
            : toVersion.versionNumber}
        </p>
      )}
    </div>
  );
}
