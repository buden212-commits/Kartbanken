"use client";

import { useEffect, useState } from "react";
import {
  exportHelpPageToPdf,
  helpExportDiagramsReady,
  waitForHelpExportRoot,
} from "@/lib/help/export-help-pdf";

type Props = {
  userLabel?: string;
  subtitle?: string;
};

export function HelpExportPdfButton({ userLabel, subtitle }: Props) {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function checkReady() {
      const root = document.getElementById("help-export-body");
      if (!root?.querySelector("section")) return false;
      return helpExportDiagramsReady(root);
    }

    if (checkReady()) {
      setReady(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (checkReady()) {
        setReady(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-help-diagram-ready"],
    });
    return () => observer.disconnect();
  }, []);

  async function handleExport() {
    setError(null);
    setLoading(true);

    try {
      const root = await waitForHelpExportRoot();

      await exportHelpPageToPdf({
        root,
        coverTitle: "kartor.ifkmora.se — Hjälp",
        coverSubtitle:
          subtitle ??
          "Guide till områden, versionshantering, utcheckning, jämförelse och export av orienteringskartor.",
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
        disabled={loading || !ready}
        className="btn-primary whitespace-nowrap disabled:opacity-50"
        title={ready ? undefined : "Väntar på att processdiagram laddas…"}
      >
        {loading ? "Exporterar PDF…" : ready ? "Exportera PDF" : "Laddar diagram…"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
