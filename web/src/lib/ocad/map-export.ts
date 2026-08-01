import type { OcadExportVersion } from "./ocad-export-shared";

export type ExportScale = 5000 | 7500 | 10000;
export type ExportFormat = "A4" | "A3";
export type ExportOrientation = "portrait" | "landscape";
export type ExportOutputFormat = "pdf" | "ocd";

export type ExportSettings = {
  scale: ExportScale;
  format: ExportFormat;
  orientation: ExportOrientation;
  outputFormat: ExportOutputFormat;
  ocadVersion: OcadExportVersion;
};

export type ExportFrame = {
  centerX: number;
  centerY: number;
  /** Width in OCAD paper units (1 unit = 0.01 mm on map paper). */
  widthUnits: number;
  /** Height in OCAD paper units (1 unit = 0.01 mm on map paper). */
  heightUnits: number;
  widthMm: number;
  heightMm: number;
};

export const EXPORT_SCALES: { value: ExportScale; label: string }[] = [
  { value: 10000, label: "1:10 000" },
  { value: 7500, label: "1:7 500" },
  { value: 5000, label: "1:5 000" },
];

export const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "A4", label: "A4" },
  { value: "A3", label: "A3" },
];

export const EXPORT_ORIENTATIONS: { value: ExportOrientation; label: string }[] = [
  { value: "portrait", label: "Stående" },
  { value: "landscape", label: "Liggande" },
];

const PAPER_MM: Record<ExportFormat, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

/** OCAD coordinates are stored in 1/100 mm on the map sheet. */
const OCAD_UNITS_PER_MM = 100;

const EXPORT_DPI = 200;

export function computeExportFrameSize(
  exportScale: ExportScale,
  fileMapScale: number,
  format: ExportFormat,
  orientation: ExportOrientation,
): Pick<ExportFrame, "widthUnits" | "heightUnits" | "widthMm" | "heightMm"> {
  const paper = PAPER_MM[format];
  const widthMm = orientation === "portrait" ? paper.w : paper.h;
  const heightMm = orientation === "portrait" ? paper.h : paper.w;
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

export function createExportFrame(
  centerX: number,
  centerY: number,
  settings: ExportSettings,
  fileMapScale: number,
): ExportFrame {
  const safeX = Number.isFinite(centerX) ? centerX : 0;
  const safeY = Number.isFinite(centerY) ? centerY : 0;
  return {
    centerX: safeX,
    centerY: safeY,
    ...computeExportFrameSize(settings.scale, fileMapScale, settings.format, settings.orientation),
  };
}

export function exportFrameBbox(frame: ExportFrame): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: frame.centerX - frame.widthUnits / 2,
    y: frame.centerY - frame.heightUnits / 2,
    width: frame.widthUnits,
    height: frame.heightUnits,
  };
}

export function pointInExportFrame(
  x: number,
  y: number,
  frame: ExportFrame,
): boolean {
  const { x: fx, y: fy, width, height } = exportFrameBbox(frame);
  return x >= fx && x <= fx + width && y >= fy && y <= fy + height;
}

function mmToPx(mm: number): number {
  return Math.max(1, Math.round((mm / 25.4) * EXPORT_DPI));
}

function validateExportFrame(frame: ExportFrame): void {
  const bbox = exportFrameBbox(frame);
  const values = [
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    frame.widthMm,
    frame.heightMm,
    frame.centerX,
    frame.centerY,
  ];
  if (!values.every((v) => Number.isFinite(v))) {
    throw new Error("Exportområdet har ogiltiga koordinater. Flytta ramen och försök igen.");
  }
  if (bbox.width <= 0 || bbox.height <= 0 || frame.widthMm <= 0 || frame.heightMm <= 0) {
    throw new Error("Exportområdet har ogiltig storlek.");
  }
}

export function buildClippedExportSvg(
  fullSvgText: string,
  frame: ExportFrame,
  pixelWidth: number,
  pixelHeight: number,
): string {
  const fillMatch = fullSvgText.match(/<svg[^>]*\bfill=["']([^"']+)["']/i);
  const fill = fillMatch?.[1] ?? "transparent";
  const defsMatch = fullSvgText.match(/<defs[\s\S]*?<\/defs>/i);
  const defs = defsMatch?.[0] ?? "<defs/>";
  const inner = fullSvgText
    .replace(/<\?xml[^?]*\?>/i, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/<defs[\s\S]*?<\/defs>/i, "");

  const { x, y, width, height } = exportFrameBbox(frame);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="${fill}" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">
${defs}
${inner}
</svg>`;
}

function loadSvgImage(svgMarkup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Kunde inte rendera kartbilden för export"));
    };
    img.src = url;
  });
}

export async function downloadMapPdf(
  fullSvgText: string,
  frame: ExportFrame,
  fileName: string,
): Promise<void> {
  validateExportFrame(frame);

  const pixelWidth = mmToPx(frame.widthMm);
  const pixelHeight = mmToPx(frame.heightMm);
  const exportSvg = buildClippedExportSvg(fullSvgText, frame, pixelWidth, pixelHeight);
  const img = await loadSvgImage(exportSvg);

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Kunde inte skapa exportyta");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);

  const { jsPDF } = await import("jspdf");
  const orientation = frame.widthMm >= frame.heightMm ? "landscape" : "portrait";
  const pdfFormat = frame.widthMm <= 220 ? "a4" : "a3";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pdfFormat,
  });

  const dataUrl = canvas.toDataURL("image/png");
  pdf.addImage(dataUrl, "PNG", 0, 0, frame.widthMm, frame.heightMm);
  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

export async function downloadMapOcd(
  mapSlug: string,
  versionId: string,
  frame: ExportFrame,
  ocadVersion: OcadExportVersion,
  fileName: string,
): Promise<{ versionWarning?: string }> {
  validateExportFrame(frame);

  const response = await fetch(`/api/maps/${mapSlug}/versions/${versionId}/export-ocd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      svgFrame: {
        centerX: frame.centerX,
        centerY: frame.centerY,
        widthUnits: frame.widthUnits,
        heightUnits: frame.heightUnits,
      },
      ocadVersion,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "OCD-export misslyckades");
  }

  const blob = await response.blob();
  const versionWarningHeader = response.headers.get("X-Ocad-Version-Warning");
  const versionWarning = versionWarningHeader
    ? decodeURIComponent(versionWarningHeader)
    : undefined;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".ocd") ? fileName : `${fileName}.ocd`;
  link.click();
  URL.revokeObjectURL(url);

  return { versionWarning };
}

export function formatExportLabel(settings: ExportSettings): string {
  const scaleLabel = EXPORT_SCALES.find((s) => s.value === settings.scale)?.label ?? "";
  const formatLabel = settings.format;
  const orientLabel =
    EXPORT_ORIENTATIONS.find((o) => o.value === settings.orientation)?.label ?? "";
  const outputLabel = settings.outputFormat === "ocd" ? "OCD" : "PDF";
  return `${scaleLabel} · ${formatLabel} ${orientLabel} · ${outputLabel}`;
}
