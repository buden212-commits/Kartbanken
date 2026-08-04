"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mapSlug: string;
  mapTitle: string;
  iconOnly?: boolean;
};

const iconBtnDanger =
  "group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:pointer-events-none disabled:opacity-50";
const tooltip =
  "pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M4.5 6h11M8 6V4.5h4V6M7 6v9.5h6V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MapDeleteButton({ mapSlug, mapTitle, iconOnly = false }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Radera kartfilen "${mapTitle}" permanent? Alla versioner, utcheckningar och banor tas bort. Detta kan inte ångras.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/maps/${mapSlug}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Radering misslyckades");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Radering misslyckades");
    } finally {
      setDeleting(false);
    }
  }

  if (iconOnly) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          aria-label="Radera kartfil"
          disabled={deleting}
          onClick={() => void handleDelete()}
          className={iconBtnDanger}
        >
          <TrashIcon />
          <span role="tooltip" className={tooltip}>
            {deleting ? "Raderar…" : "Radera kartfil"}
          </span>
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={deleting}
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "Raderar…" : "Radera kartfil"}
      </button>
      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
