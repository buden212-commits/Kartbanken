"use client";

import type { CourseSummary } from "@/lib/course/types";
import {
  COURSE_PDF_SCALES,
  formatScaleLabel,
  type PdfOrientation,
  type PdfPaperFormat,
} from "@/lib/course/pdf-scale";
import { downloadMapPdf, type ExportProgress } from "@/lib/ocad/map-export";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { useEffect, useMemo, useState } from "react";

type Props = {
  mapSlug: string;
  courses: CourseSummary[];
  /** Currently open course in the editor — used as default export target. */
  activeCourseId: string | null;
  disabled?: boolean;
  exportCenter?: { centerX: number; centerY: number } | null;
};

export function CoursePdfPanel({
  mapSlug,
  courses,
  activeCourseId,
  disabled,
  exportCenter,
}: Props) {
  const [exportCourseId, setExportCourseId] = useState(activeCourseId ?? "");
  const [format, setFormat] = useState<PdfPaperFormat>("A4");
  const [orientation, setOrientation] = useState<PdfOrientation>("portrait");
  const [scale, setScale] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);

  useEffect(() => {
    if (activeCourseId) {
      setExportCourseId(activeCourseId);
    }
  }, [activeCourseId]);

  const exportCourse = useMemo(
    () => courses.find((course) => course.id === exportCourseId) ?? null,
    [courses, exportCourseId],
  );

  async function handleExport() {
    if (!exportCourseId) {
      setError("Välj vilken bana som ska exporteras");
      return;
    }

    setLoading(true);
    setProgress({ label: "Startar export" });
    setError(null);

    try {
      const params = new URLSearchParams({
        format,
        orientation,
        scale: String(scale),
      });
      if (exportCenter) {
        params.set("centerX", String(exportCenter.centerX));
        params.set("centerY", String(exportCenter.centerY));
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch(
          `/api/maps/${mapSlug}/courses/${exportCourseId}/export/pdf?${params}`,
          {
            headers: { Accept: "application/x-ndjson" },
            signal: controller.signal,
          },
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(
            "PDF-exporten tog för lång tid. Vänta en stund och försök igen.",
          );
        }
        throw err;
      } finally {
        window.clearTimeout(timer);
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export misslyckades");
      }

      if (!res.body) {
        throw new Error("Kunde inte läsa exportens förlopp");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let pngBase64: string | null = null;
      let rotationDeg: number | undefined;
      let courseName: string | undefined;
      let frame: {
        centerX: number;
        centerY: number;
        widthUnits: number;
        heightUnits: number;
        widthMm: number;
        heightMm: number;
      } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as {
            type?: string;
            label?: string;
            done?: number;
            total?: number;
            error?: string;
            pngBase64?: string;
            rotationDeg?: number;
            courseName?: string;
            frame?: NonNullable<typeof frame>;
          };
          if (event.type === "progress" && event.label) {
            setProgress({
              label: event.label,
              done: event.done,
              total: event.total,
            });
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Export misslyckades");
          } else if (event.type === "result" && event.pngBase64 && event.frame) {
            pngBase64 = event.pngBase64;
            rotationDeg = event.rotationDeg;
            courseName = event.courseName;
            frame = event.frame;
          }
        }
      }

      if (!pngBase64 || !frame) {
        throw new Error("Kunde inte rastrera kartbilden för export");
      }

      const nameForFile = courseName ?? exportCourse?.name ?? "bana";

      setProgress({ label: "Skapar PDF" });
      await downloadMapPdf(
        "",
        frame,
        `${nameForFile.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "bana"}-${scale}`,
        {
          pngBase64,
          rotationDeg,
          onProgress: setProgress,
        },
      );
      setPreviewNote(
        `Exporterad ${nameForFile} · ${format} ${orientation === "portrait" ? "stående" : "liggande"} ${formatScaleLabel(scale)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="text-sm font-medium text-slate-900">PDF-export</h3>
        <HelpLinkIcon section="bana" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={exportCourseId}
          onChange={(e) => setExportCourseId(e.target.value)}
          className="min-w-[10rem] rounded border border-slate-300 px-2 py-1 text-xs"
          disabled={disabled || loading || courses.length === 0}
          aria-label="Välj bana för PDF-export"
        >
          <option value="">Välj bana…</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
              {course.objectCount === 0 ? " (tom)" : ""}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as PdfPaperFormat)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          disabled={disabled || loading}
        >
          <option value="A4">A4</option>
          <option value="A3">A3</option>
        </select>
        <select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as PdfOrientation)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          disabled={disabled || loading}
        >
          <option value="portrait">Stående</option>
          <option value="landscape">Liggande</option>
        </select>
        <select
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          disabled={disabled || loading}
        >
          {COURSE_PDF_SCALES.map((s) => (
            <option key={s} value={s}>
              {formatScaleLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={disabled || loading || !exportCourseId}
          className="rounded-lg bg-ifk-blue px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading ? "Exporterar…" : "Ladda ner PDF"}
        </button>
      </div>
      {loading && (
        <div className="mt-3 flex items-center gap-3" role="status" aria-live="polite">
          <span
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-ifk-blue"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">
              {progress?.label ?? "Exporterar"}
              {progress?.total != null && progress.total > 0
                ? ` (${progress.done ?? 0} av ${progress.total})`
                : "…"}
            </p>
            {progress?.total != null && progress.total > 0 && (
              <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-ifk-blue transition-[width] duration-200"
                  style={{
                    width: `${Math.min(100, Math.round(((progress.done ?? 0) / progress.total) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {previewNote && <p className="mt-2 text-xs text-emerald-700">{previewNote}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Välj bana — utskriftsområdet centreras på den banans utbredning. Kartan ritas i
        utskriftsupplösning och banan läggs ovanpå.
      </p>
    </div>
  );
}
