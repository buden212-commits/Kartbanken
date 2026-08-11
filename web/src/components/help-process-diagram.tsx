"use client";

import { useEffect, useId, useRef, useState } from "react";
import { rasterizeDiagramContainer } from "@/lib/help/diagram-raster";

type Props = {
  chart: string;
  title?: string;
  caption?: string;
};

export function HelpProcessDiagram({ chart, title, caption }: Props) {
  const figureRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const figure = figureRef.current;

    if (figure) {
      delete figure.dataset.helpDiagramReady;
      delete figure.dataset.helpDiagramPng;
      delete figure.dataset.helpDiagramWidth;
      delete figure.dataset.helpDiagramHeight;
    }

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          flowchart: {
            curve: "basis",
            padding: 16,
            htmlLabels: false,
          },
          securityLevel: "strict",
        });

        if (cancelled || !containerRef.current) return;

        const { svg } = await mermaid.render(`help-flow-${diagramId}`, chart.trim());
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = svg;

        // Pre-rasterize for reliable PDF export (Mermaid SVG -> PNG).
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        const png = await rasterizeDiagramContainer(containerRef.current);
        if (cancelled || !figureRef.current) return;

        if (png) {
          figureRef.current.dataset.helpDiagramPng = png.dataUrl;
          figureRef.current.dataset.helpDiagramWidth = String(png.width);
          figureRef.current.dataset.helpDiagramHeight = String(png.height);
          figureRef.current.dataset.helpDiagramReady = "true";
        } else {
          figureRef.current.dataset.helpDiagramReady = "error";
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte rendera diagram");
          if (figureRef.current) {
            figureRef.current.dataset.helpDiagramReady = "error";
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  return (
    <figure ref={figureRef} className="not-prose">
      {title && (
        <figcaption className="mb-2 text-sm font-medium text-slate-900">{title}</figcaption>
      )}
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm [&_svg]:mx-auto [&_svg]:max-w-full"
        aria-label={title ?? "Processdiagram"}
      />
      {caption && <p className="mt-2 text-xs text-slate-500">{caption}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </figure>
  );
}
