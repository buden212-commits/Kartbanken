"use client";

import { useId, useState, type ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  /** Extra content on the right side of the header (e.g. actions). */
  headerAside?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. When set, overrides internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  id?: string;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  headerAside,
  defaultOpen = false,
  open: openControlled,
  onOpenChange,
  className = "mt-10",
  id,
  children,
}: Props) {
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);
  const open = openControlled ?? openUncontrolled;
  const panelId = useId();

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openControlled === undefined) {
      setOpenUncontrolled(next);
    }
  }

  return (
    <section className={className} id={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <span className="mt-1 shrink-0 text-sm text-slate-400" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-medium text-slate-900 group-hover:text-ifk-blue">
              {title}
            </span>
            {description && (
              <span className="mt-1 block text-sm text-slate-600">{description}</span>
            )}
          </span>
        </button>
        {headerAside}
      </div>
      {open && (
        <div id={panelId} className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
}
