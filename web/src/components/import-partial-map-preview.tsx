"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bbox } from "@/lib/checkout/types";
import type { ImportPartialAnalysis } from "@/lib/checkout/import-partial-types";
import { fetchPreviewText } from "@/lib/ocad/preview-fetch";

type Mode = "extent" | "edges" | "diff";

/** Kartor laddas normalt på 5–10 s. Vänta inte på en ~60 s gateway-timeout. */
const PREVIEW_TIMEOUT_MS = 20_000;

type Props = {
  previewUrl: string;
  analysis: ImportPartialAnalysis;
  mode: Mode;
  title: string;
  areaHref?: string;
};

type PctBox = { left: number; top: number; width: number; height: number };
type PctPoint = { left: number; top: number };

function geoToPct(x: number, y: number, bounds: Bbox): PctPoint | null {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (!(w > 0) || !(h > 0)) return null;
  return {
    left: ((x - bounds.minX) / w) * 100,
    top: ((bounds.maxY - y) / h) * 100,
  };
}

function bboxToPct(box: Bbox, bounds: Bbox): PctBox | null {
  const a = geoToPct(box.minX, box.maxY, bounds);
  const b = geoToPct(box.maxX, box.minY, bounds);
  if (!a || !b) return null;
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const width = Math.abs(b.left - a.left);
  const height = Math.abs(b.top - a.top);
  if (!(width > 0) || !(height > 0)) return null;
  return { left, top, width, height };
}

function svgToImageUrl(svgText: string): string {
  const match = svgText.match(/viewBox=["']([^"']+)["']/i);
  const parts = match?.[1]?.trim().split(/\s+/).map(Number);
  let rewritten = svgText;
  if (parts && parts.length === 4 && parts.every(Number.isFinite)) {
    const vbW = Math.max(Math.abs(parts[2]!), 1);
    const vbH = Math.max(Math.abs(parts[3]!), 1);
    const maxDim = 2000;
    const scale = Math.min(maxDim / vbW, maxDim / vbH, 1);
    const width = Math.max(1, Math.round(vbW * scale));
    const height = Math.max(1, Math.round(vbH * scale));
    rewritten = rewritten
      .replace(/\swidth="[^"]*"/i, ` width="${width}"`)
      .replace(/\sheight="[^"]*"/i, ` height="${height}"`);
  }
  return URL.createObjectURL(new Blob([rewritten], { type: "image/svg+xml;charset=utf-8" }));
}

export function ImportPartialMapPreview({ previewUrl, analysis, mode, title, areaHref }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const bounds = analysis.headBounds;
  const frame = useMemo(
    () => (bounds ? bboxToPct(analysis.extent, bounds) : null),
    [analysis.extent, bounds],
  );

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    setStatus("loading");
    setError(null);
    setSlow(false);

    fetchPreviewText(previewUrl, {
      signal: controller.signal,
      bypassCache: retryKey > 0,
    })
      .then((text) => {
        const url = svgToImageUrl(text);
        createdUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (controller.signal.aborted) {
          setError(
            "Kartbilden tog för lång tid att hämta. Öppna området så kartan hinner laddas, och försök igen.",
          );
        } else {
          setError(err instanceof Error ? err.message : "Kunde inte ladda kartbild");
        }
        setStatus("error");
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewUrl, retryKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const zoomStyle = useMemo(() => {
    if (!frame) return undefined;
    const w = Math.max(frame.width, 0.5);
    const h = Math.max(frame.height, 0.5);
    const scale = Math.min(85 / w, 85 / h, 25);
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    return {
      transformOrigin: `${cx}% ${cy}%`,
      transform: `scale(${scale})`,
    } as const;
  }, [frame]);

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
                onClick={() => setRetryKey((n) => n + 1)}
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
        {imageUrl && (
          <div
            className="relative max-h-full max-w-full"
            style={status === "ready" ? zoomStyle : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Stor karta"
              className="block max-h-[min(70dvh,560px)] w-auto max-w-full"
              onLoad={() => setStatus("ready")}
              onError={() => {
                setError("Kartbilden kunde inte ritas.");
                setStatus("error");
              }}
            />
            {status === "ready" && frame && (
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="absolute border-2 border-blue-700 bg-blue-600/15"
                  style={{
                    left: `${frame.left}%`,
                    top: `${frame.top}%`,
                    width: `${frame.width}%`,
                    height: `${frame.height}%`,
                  }}
                />
                {mode === "edges" &&
                  bounds &&
                  analysis.edgeObjects.map((object) => {
                    const point = geoToPct(object.centroid[0], object.centroid[1], bounds);
                    if (!point) return null;
                    return (
                      <span
                        key={`${object.objectIndex}-${object.symbolNumber}`}
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white ${
                          object.likelyClipped ? "bg-red-600" : "bg-orange-500"
                        }`}
                        style={{ left: `${point.left}%`, top: `${point.top}%` }}
                      />
                    );
                  })}
                {mode === "diff" &&
                  bounds &&
                  analysis.diff.samples.map((change, index) => {
                    const point = geoToPct(change.centroid[0], change.centroid[1], bounds);
                    if (!point) return null;
                    const color =
                      change.changeType === "added"
                        ? "bg-emerald-600"
                        : change.changeType === "removed"
                          ? "bg-red-600"
                          : "bg-amber-500";
                    return (
                      <span
                        key={`${change.changeType}-${change.objectIndex}-${index}`}
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white ${color}`}
                        style={{ left: `${point.left}%`, top: `${point.top}%` }}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
