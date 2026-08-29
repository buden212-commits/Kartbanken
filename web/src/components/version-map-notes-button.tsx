"use client";

import { useCallback, useEffect, useId, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type Props = {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  disabled?: boolean;
};

export function VersionMapNotesButton({
  mapSlug,
  versionId,
  versionNumber,
  disabled = false,
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapNotes, setMapNotes] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  async function openNotes(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setOpen(true);
    if (mapNotes !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/versions/${versionId}/map-notes`);
      const data = (await res.json()) as { mapNotes?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Kunde inte läsa kartinformation");
      setMapNotes(data.mapNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa kartinformation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:pointer-events-none disabled:opacity-40"
        aria-label="Visa kartinformation"
        title="Visa kartinformation"
        disabled={disabled}
        onClick={openNotes}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
          <path
            d="M6 3.5h5.5L15.5 8v8.5H6A1.5 1.5 0 0 1 4.5 15V5A1.5 1.5 0 0 1 6 3.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 3.5V8h4M7 11h6M7 13.5h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Kartinformation
        </span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 id={titleId} className="text-lg font-medium text-slate-900">
                    Kartinformation
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    v{versionNumber} — samma text som i OCAD under Karta → Kartinformation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Stäng"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-[min(60vh,28rem)] overflow-y-auto px-5 py-4">
                {loading && <p className="text-sm text-slate-600">Läser kartinformation…</p>}
                {error && <p className="text-sm text-red-700">{error}</p>}
                {!loading && !error && mapNotes === "" && (
                  <p className="text-sm text-slate-500">Ingen kartinformation i filen.</p>
                )}
                {!loading && !error && mapNotes ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
                    {mapNotes}
                  </pre>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
