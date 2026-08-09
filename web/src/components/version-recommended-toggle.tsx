"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mapSlug: string;
  versionId: string;
  initialRecommended: boolean;
  canManage: boolean;
};

export function VersionRecommendedToggle({
  mapSlug,
  versionId,
  initialRecommended,
  canManage,
}: Props) {
  const router = useRouter();
  const [isRecommended, setIsRecommended] = useState(initialRecommended);
  const [saving, setSaving] = useState(false);

  if (!canManage) {
    return isRecommended ? (
      <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
        Rek.
      </span>
    ) : null;
  }

  async function handleToggle(next: boolean) {
    setSaving(true);
    const prev = isRecommended;
    setIsRecommended(next);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/versions/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRecommended: next }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Kunde inte uppdatera");
      }
      router.refresh();
    } catch {
      setIsRecommended(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label
      title="Rekommenderad version (intern markering)"
      className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={isRecommended}
        disabled={saving}
        onChange={(e) => void handleToggle(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20"
      />
      <span>Rek.</span>
    </label>
  );
}
