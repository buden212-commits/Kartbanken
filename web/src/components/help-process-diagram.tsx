"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  chart: string;
  title?: string;
  caption?: string;
};

export function HelpProcessDiagram({ chart, title, caption }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte rendera diagram");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  return (
    <figure className="not-prose">
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
