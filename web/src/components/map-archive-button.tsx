"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mapSlug: string;
  initialArchived: boolean;
};

export function MapArchiveButton({ mapSlug, initialArchived }: Props) {
  const router = useRouter();
  const [archived, setArchived] = useState(initialArchived);
  const [loading, setLoading] = useState(false);

  async function toggleArchive() {
    const next = !archived;
    const label = next ? "arkivera" : "återställa";
    if (
      !window.confirm(
        next
          ? "Arkivera området? Det döljs från startsidan och kan inte uppdateras (utom av admin)."
          : "Återställ området från arkivet?",
      )
    ) {
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/maps/${mapSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: next }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      window.alert(data.error ?? `Kunde inte ${label} området`);
      return;
    }

    setArchived(next);
    router.refresh();
    if (next) router.push("/");
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void toggleArchive()}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? "Sparar…" : archived ? "Återställ från arkiv" : "Arkivera område"}
    </button>
  );
}
