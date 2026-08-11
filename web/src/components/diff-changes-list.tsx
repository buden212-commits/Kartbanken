"use client";

import { useEffect, useMemo, useState } from "react";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { ChangeType } from "@/lib/ocad/diff-types";
import { CHANGES_LIST_PAGE_SIZE } from "@/lib/ocad/diff-storage";
import { formatChangeCentroid } from "@/lib/ocad/change-utils";

const CHANGE_LABELS: Record<ChangeType, string> = {
  added: "Tillagd",
  removed: "Borttagen",
  modified: "Ändrad",
};

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "text-emerald-600",
  removed: "text-red-600",
  modified: "text-amber-600",
};

export type DiffChangeListItem = {
  change: OcadObjectChange;
  index: number;
};

type Props = {
  items: DiffChangeListItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  listLength: number;
  totalChanges?: number;
  changesTruncated?: boolean;
  maxChangesApplied?: number | null;
  emptyMessage?: string;
  footerNote?: string;
};

export function DiffChangesList({
  items,
  selectedIndex,
  onSelect,
  listLength,
  totalChanges,
  changesTruncated = false,
  maxChangesApplied = null,
  emptyMessage = "Inga ändringar matchar filtret.",
  footerNote = "Klicka på en rad för att zooma till objektet.",
}: Props) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / CHANGES_LIST_PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [items.length, listLength]);

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    const start = page * CHANGES_LIST_PAGE_SIZE;
    return items.slice(start, start + CHANGES_LIST_PAGE_SIZE);
  }, [items, page]);

  const effectiveTotal = totalChanges ?? listLength;
  const storedTotal = listLength;

  return (
    <>
      <p className="mt-3 text-sm text-slate-500">
        Visar {pageItems.length.toLocaleString("sv-SE")} på denna sida ·{" "}
        {items.length.toLocaleString("sv-SE")} matchar filtret ·{" "}
        {storedTotal.toLocaleString("sv-SE")} i listan
        {changesTruncated && effectiveTotal > storedTotal && (
          <span className="text-amber-700">
            {" "}
            (totalt {effectiveTotal.toLocaleString("sv-SE")} — listan begränsad till{" "}
            {maxChangesApplied?.toLocaleString("sv-SE") ?? storedTotal.toLocaleString("sv-SE")})
          </span>
        )}
        {!changesTruncated && effectiveTotal > storedTotal && (
          <span>
            {" "}
            (totalt {effectiveTotal.toLocaleString("sv-SE")} i diff)
          </span>
        )}
        . {footerNote}
      </p>

      {changesTruncated && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Changelistan sparades med tak ({maxChangesApplied?.toLocaleString("sv-SE") ?? "?"} poster).
          Kartlagren inkluderar alla ändringar; använd sök och filter på de sparade posterna.
        </p>
      )}

      <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto text-sm">
        {pageItems.length === 0 ? (
          <li className="py-6 text-center text-slate-500">{emptyMessage}</li>
        ) : (
          pageItems.map(({ change, index }) => (
            <li key={`${change.objectIndex}-${change.symbolNumber}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left transition ${
                  selectedIndex === index
                    ? "bg-ifk-blue-pale ring-1 ring-ifk-blue"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className={`font-medium ${CHANGE_COLORS[change.changeType]}`}>
                  {CHANGE_LABELS[change.changeType]}
                </span>
                <span className="font-mono text-slate-500">{change.symbolNumber}</span>
                <span>{change.symbolName}</span>
                {change.type === "point" && <span className="text-xs text-slate-400">punkt</span>}
                {change.type === "line" && <span className="text-xs text-slate-400">linje</span>}
                <span className="font-mono text-xs text-slate-500">
                  {formatChangeCentroid(change)}
                </span>
                {change.text && (
                  <span className="text-slate-600">&quot;{change.text}&quot;</span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>

      {pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Föregående
          </button>
          <span className="text-slate-600">
            Sida {page + 1} av {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Nästa
          </button>
        </div>
      )}
    </>
  );
}
