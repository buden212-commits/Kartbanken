"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

type Props = {
  title: string;
  /** Optional count/badge shown after the title. */
  badge?: ReactNode;
  /** Short description shown when expanded. */
  description?: ReactNode;
  /** Start expanded. Default collapsed. */
  defaultOpen?: boolean;
  /**
   * When this value changes (and is non-nullish), the section expands.
   * Useful when another control needs to reveal the content (e.g. zoom-to).
   */
  forceOpenKey?: number | string | null;
  children: ReactNode;
  className?: string;
  id?: string;
};

/**
 * Area-page section that can be collapsed to keep the page scannable.
 * Pattern matches MapLayerPanel (aria-expanded + ▸/▾).
 */
export function CollapsibleSection({
  title,
  badge,
  description,
  defaultOpen = false,
  forceOpenKey = null,
  children,
  className = "mt-10",
  id,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  useEffect(() => {
    if (forceOpenKey == null) return;
    setOpen(true);
  }, [forceOpenKey]);

  return (
    <section className={className} id={id}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100/80"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-medium text-slate-900">{title}</span>
            {badge}
          </span>
          {!open && (
            <span className="mt-0.5 block text-xs text-slate-500">
              Klicka för att visa
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm text-slate-500" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div id={contentId} className="mt-3">
          {description && <div className="mb-2 text-sm text-slate-600">{description}</div>}
          {children}
        </div>
      )}
    </section>
  );
}
