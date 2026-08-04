/** PDF scale math for course export — shared between client and tests. */

export type PdfPaperFormat = "A4" | "A3";
export type PdfOrientation = "portrait" | "landscape";

export const COURSE_PDF_SCALE_MIN = Number(process.env.COURSE_PDF_SCALE_MIN ?? 4000);
export const COURSE_PDF_SCALE_MAX = Number(process.env.COURSE_PDF_SCALE_MAX ?? 20000);

export const COURSE_PDF_SCALES = [4000, 5000, 7500, 10000, 15000, 20000].filter(
  (s) => s >= COURSE_PDF_SCALE_MIN && s <= COURSE_PDF_SCALE_MAX,
);

const PAPER_MM: Record<PdfPaperFormat, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

const OCAD_UNITS_PER_MM = 100;

export function clampCourseScale(scale: number): number {
  return Math.min(COURSE_PDF_SCALE_MAX, Math.max(COURSE_PDF_SCALE_MIN, scale));
}

export function parseCourseScale(value: unknown, fallback = 10000): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return clampCourseScale(Math.round(n));
}

export function paperSizeMm(
  format: PdfPaperFormat,
  orientation: PdfOrientation,
): { widthMm: number; heightMm: number } {
  const paper = PAPER_MM[format];
  return orientation === "portrait"
    ? { widthMm: paper.w, heightMm: paper.h }
    : { widthMm: paper.h, heightMm: paper.w };
}

export function computeExportAreaUnits(
  exportScale: number,
  fileMapScale: number,
  format: PdfPaperFormat,
  orientation: PdfOrientation,
): { widthUnits: number; heightUnits: number; widthMm: number; heightMm: number } {
  const { widthMm, heightMm } = paperSizeMm(format, orientation);
  const safeFileScale =
    Number.isFinite(fileMapScale) && fileMapScale > 0 ? fileMapScale : 15000;
  const scaleRatio = exportScale / safeFileScale;

  return {
    widthUnits: widthMm * OCAD_UNITS_PER_MM * scaleRatio,
    heightUnits: heightMm * OCAD_UNITS_PER_MM * scaleRatio,
    widthMm,
    heightMm,
  };
}

export function exportFrameFromCenter(
  centerX: number,
  centerY: number,
  exportScale: number,
  fileMapScale: number,
  format: PdfPaperFormat,
  orientation: PdfOrientation,
) {
  const area = computeExportAreaUnits(exportScale, fileMapScale, format, orientation);
  return {
    centerX,
    centerY,
    ...area,
  };
}

/** Center a PDF frame on a course extent in SVG user space. */
export function exportFrameFromExtent(
  extent: { minX: number; minY: number; maxX: number; maxY: number },
  exportScale: number,
  fileMapScale: number,
  format: PdfPaperFormat,
  orientation: PdfOrientation,
) {
  return exportFrameFromCenter(
    (extent.minX + extent.maxX) / 2,
    (extent.minY + extent.maxY) / 2,
    exportScale,
    fileMapScale,
    format,
    orientation,
  );
}

export function exportFrameBbox(frame: {
  centerX: number;
  centerY: number;
  widthUnits: number;
  heightUnits: number;
}) {
  return {
    x: frame.centerX - frame.widthUnits / 2,
    y: frame.centerY - frame.heightUnits / 2,
    width: frame.widthUnits,
    height: frame.heightUnits,
  };
}

export function formatScaleLabel(scale: number): string {
  return `1:${scale.toLocaleString("sv-SE")}`;
}

/** Bottom-left PDF export line, e.g. "Skala 1:15 000". */
export function formatMapScaleExportLabel(scale: number): string {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 15000;
  return `Skala ${formatScaleLabel(safeScale)}`;
}
