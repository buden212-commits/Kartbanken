"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mapSlug: string;
  versionId: string;
  initialPublished: boolean;
  canManage: boolean;
  compact?: boolean;
};

export function VersionPublishToggle({
  mapSlug,
  versionId,
  initialPublished,
  canManage,
  compact = false,
}: Props) {
  const router = useRouter();
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <span
        title={isPublished ? "Publicerad" : "Ej publicerad"}
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          isPublished
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {isPublished ? "Ja" : "Nej"}
      </span>
    );
  }

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    const prev = isPublished;
    setIsPublished(next);

    try {
      const res = await fetch(`/api/maps/${mapSlug}/versions/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: next }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Kunde inte uppdatera");
      }
      if (next) {
        router.refresh();
      }
    } catch (err) {
      setIsPublished(prev);
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        title={isPublished ? "Publicerad" : "Ej publicerad"}
        className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700"
      >
        <input
          type="checkbox"
          checked={isPublished}
          disabled={saving}
          onChange={(e) => void handleToggle(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20"
        />
        {!compact && <span>{isPublished ? "Publicerad" : "Ej publicerad"}</span>}
      </label>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
