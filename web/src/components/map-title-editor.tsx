"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapDeleteButton } from "@/components/map-delete-button";

type Props = {
  mapSlug: string;
  initialTitle: string;
  canEdit: boolean;
  showDelete?: boolean;
};

const iconBtn =
  "group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:pointer-events-none disabled:opacity-50";
const tooltip =
  "pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M13.5 3.5 16.5 6.5M4 16v-2.5L13 6.5l2.5 2.5L6.5 16H4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MapTitleEditor({
  mapSlug,
  initialTitle,
  canEdit,
  showDelete = false,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(title);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(title);
    setError(null);
    setEditing(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextTitle = draft.trim();
    if (!nextTitle) {
      setError("Titel krävs");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/maps/${mapSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Kunde inte spara namn");
      }

      const data = (await res.json()) as { title: string };
      setTitle(data.title);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara namn");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
        <button
          type="button"
          aria-label="Redigera namn"
          onClick={startEdit}
          className={iconBtn}
        >
          <PencilIcon />
          <span role="tooltip" className={tooltip}>
            Redigera namn
          </span>
        </button>
        {showDelete && (
          <MapDeleteButton mapSlug={mapSlug} mapTitle={title} iconOnly />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="max-w-xl">
      <label htmlFor="map-title" className="form-label">
        Område
      </label>
      <input
        id="map-title"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        required
        autoFocus
        disabled={saving}
        className="form-input"
      />
      <p className="mt-1 text-xs text-slate-500">
        URL-adressen ({mapSlug}) ändras inte — bara visningsnamnet.
      </p>
      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Sparar…" : "Spara"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}
