"use client";

import type { CourseSummary } from "@/lib/course/types";
import {
  COURSE_PDF_SCALES,
  formatScaleLabel,
  type PdfOrientation,
  type PdfPaperFormat,
} from "@/lib/course/pdf-scale";
import { downloadMapPdf } from "@/lib/ocad/map-export";
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

      const res = await fetch(
        `/api/maps/${mapSlug}/courses/${exportCourseId}/export/pdf?${params}`,
        { headers: { Accept: "application/json" } },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export misslyckades");
      }

      const data = (await res.json()) as {
        svg: string;
        courseName?: string;
        frame: {
          centerX: number;
          centerY: number;
          widthUnits: number;
          heightUnits: number;
          widthMm: number;
          heightMm: number;
        };
      };

      const nameForFile =
        data.courseName ?? exportCourse?.name ?? "bana";

      await downloadMapPdf(
        data.svg,
        data.frame,
        `${nameForFile.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "bana"}-${scale}`,
      );
      setPreviewNote(
        `Exporterad ${nameForFile} · ${format} ${orientation === "portrait" ? "stående" : "liggande"} ${formatScaleLabel(scale)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setLoading(false);
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
      {previewNote && <p className="mt-2 text-xs text-emerald-700">{previewNote}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Välj bana — utskriftsområdet centreras på den banans utbredning. PDF genereras i
        webbläsaren (jspdf).
      </p>
    </div>
  );
}
