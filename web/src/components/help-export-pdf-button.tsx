"use client";

import { useState } from "react";
import { exportHelpPageToPdf } from "@/lib/help/export-help-pdf";

type Props = {
  userLabel?: string;
  subtitle?: string;
};

export function HelpExportPdfButton({ userLabel, subtitle }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setLoading(true);

    try {
      const root = document.getElementById("help-export-body");
      if (!root) {
        throw new Error("Kunde inte hitta hjälpinnehållet");
      }

      await exportHelpPageToPdf({
        root,
        coverTitle: "kartor.ifkmora.se — Hjälp",
        coverSubtitle:
          subtitle ??
          "Guide till områden, versionshantering, checkout, jämförelse och export av orienteringskartor.",
        userLabel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte exportera PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={loading}
        className="btn-primary whitespace-nowrap disabled:opacity-50"
      >
        {loading ? "Exporterar PDF…" : "Exportera PDF"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
