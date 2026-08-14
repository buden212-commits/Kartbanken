"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bbox } from "@/lib/checkout/types";
import type { ImportPartialAnalysis } from "@/lib/checkout/import-partial-types";
import { clearPreviewCache, fetchPreviewText } from "@/lib/ocad/preview-fetch";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

type Mode = "extent" | "edges" | "diff";

type Props = {
  previewUrl: string;
  analysis: ImportPartialAnalysis;
  mode: Mode;
  title: string;
  areaHref?: string;
};

type Scene = {
  inner: string;
  fill: string;
  fullViewBox: string;
  transform: SvgRootTransform;
};

function bboxToTuple(box: Bbox): [number, number, number, number] {
  return [box.minX, box.minY, box.maxX, box.maxY];
}

function paddedViewBox(
  extent: Bbox,
  transform: SvgRootTransform,
  fallback: string,
): string {
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(bboxToTuple(extent), transform);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return fallback;
  }
  const padX = width * 0.2;
  const padY = height * 0.2;
  return `${minX - padX} ${minY - padY} ${width + padX * 2} ${height + padY * 2}`;
}

function parseViewBoxSize(viewBox: string): { w: number; h: number } | null {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const w = Math.abs(parts[2]!);
  const h = Math.abs(parts[3]!);
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

export function ImportPartialMapPreview({ previewUrl, analysis, mode, title, areaHref }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setSlow(false);

    fetchPreviewText(previewUrl, {
      signal: controller.signal,
      bypassCache: retryKey > 0,
    })
      .then((text) => {
        if (cancelled) return;
        const extracted = extractSvgInner(text);
        if (!extracted.viewBox || !extracted.inner.trim()) {
          throw new Error("Kartbilden saknar innehåll. Öppna området så kartan hinner laddas, och försök igen.");
        }
        setScene({
          inner: extracted.inner,
          fill: extracted.fill ?? "transparent",
          fullViewBox: extracted.viewBox,
          transform: extracted.rootTransform,
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Kunde inte ladda kartbild");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUrl, retryKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const viewBox = useMemo(() => {
    if (!scene) return null;
    return paddedViewBox(analysis.extent, scene.transform, scene.fullViewBox);
  }, [analysis.extent, scene]);

  const frame = useMemo(() => {
    if (!scene) return null;
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(bboxToTuple(analysis.extent), scene.transform);
    const width = maxX - minX;
    const height = maxY - minY;
    if (!(width > 0) || !(height > 0)) return null;
    return { x: minX, y: minY, width, height };
  }, [analysis.extent, scene]);

  const markerRadius = useMemo(() => {
    if (!viewBox) return 8;
    const size = parseViewBoxSize(viewBox);
    if (!size) return 8;
    return Math.max(size.w, size.h) * 0.01;
  }, [viewBox]);

  function retry() {
    clearPreviewCache(previewUrl);
    setScene(null);
    setRetryKey((n) => n + 1);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
        <h3 className="text-sm font-medium text-slate-800">{title}</h3>
      </div>
      <div className="relative flex h-[min(70dvh,560px)] min-h-[280px] items-center justify-center overflow-hidden bg-white">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-white text-sm text-slate-600">
            <p>Laddar kartbild…</p>
            {slow && (
              <p className="text-xs text-slate-500">Kartan är stor — det kan ta en stund.</p>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="z-10 flex max-w-md flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-red-600">
              {error ??
                "Kunde inte visa kartan. Öppna området och kontrollera att kartbilden laddas där."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={retry}
              >
                Försök igen
              </button>
              {areaHref && (
                <a
                  href={areaHref}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Öppna området
                </a>
              )}
            </div>
          </div>
        )}
        {scene && viewBox && status === "ready" && (
          <svg
            viewBox={viewBox}
            fill={scene.fill}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full max-h-full max-w-full"
          >
            <g dangerouslySetInnerHTML={{ __html: scene.inner }} />
            {frame && (
              <rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                fill="rgba(37, 99, 235, 0.15)"
                stroke="#1d4ed8"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {mode === "edges" &&
              analysis.edgeObjects.map((object) => {
                const [cx, cy] = geoToSvgUserPoint(object.centroid, scene.transform);
                return (
                  <circle
                    key={`${object.objectIndex}-${object.symbolNumber}`}
                    cx={cx}
                    cy={cy}
                    r={markerRadius}
                    fill={object.likelyClipped ? "#dc2626" : "#f97316"}
                    stroke="#fff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                );
              })}
            {mode === "diff" &&
              analysis.diff.samples.map((change, index) => {
                const [cx, cy] = geoToSvgUserPoint(change.centroid, scene.transform);
                const fill =
                  change.changeType === "added"
                    ? "#059669"
                    : change.changeType === "removed"
                      ? "#dc2626"
                      : "#f59e0b";
                return (
                  <circle
                    key={`${change.changeType}-${change.objectIndex}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={markerRadius}
                    fill={fill}
                    stroke="#fff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                );
              })}
          </svg>
        )}
      </div>
    </div>
  );
}
