import { formatMapScaleExportLabel } from "@/lib/course/pdf-scale";
import type { OcdSuggestionSymbolMapping } from "@/lib/ocad/ocad-suggestion-export";
import { buildKartramFrameMarkup, parseKartramFromSvg } from "./kartram";
import type { OcadExportVersion } from "./ocad-export-shared";
import { parseOcadMapScale } from "./svg-utils";

export type ExportScale = 5000 | 7500 | 10000;
export type ExportFormat = "A4" | "A3";
export type ExportOrientation = "portrait" | "landscape";
export type ExportOutputFormat = "pdf" | "ocd" | "omap" | "geotiff";

export type ExportSettings = {
  scale: ExportScale;
  format: ExportFormat;
  orientation: ExportOrientation;
  outputFormat: ExportOutputFormat;
  ocadVersion: OcadExportVersion;
  /** Include open/in-progress kartförslag overlays in PDF and GeoTIFF exports. */
  includeSuggestions: boolean;
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

/** Default clockwise rotation for PDF export (IOF). Overridden by Admin → Inställningar. */
export const PDF_EXPORT_ROTATION_DEG = 7;

/** Course overlay text (704 etc.) — matches PDF export tilt in the editor. */
export const COURSE_TEXT_ROTATION_DEG = PDF_EXPORT_ROTATION_DEG;

/** Rotate a text anchor in place (editor preview only; export text stays horizontal). */
export function courseTextRotationTransform(
  x: number,
  y: number,
  deg?: number,
): string | null {
  if (deg == null || deg === 0) return null;
  return `rotate(${deg} ${x} ${y})`;
}

/** Rotate export content around the export frame center (same as viewBox center). */
export function pdfExportRotationTransform(
  frame: ExportFrame,
  deg: number = PDF_EXPORT_ROTATION_DEG,
): string {
  return `rotate(${deg} ${frame.centerX} ${frame.centerY})`;
}

/**
 * Compose export page rotation into every SVG `<pattern>`'s `patternTransform`.
 * Prefer placing `<defs>` inside the rotated export `<g>` instead — mutating
 * patternTransform has broken Image→canvas rasterization in Chromium.
 * Kept for callers that still need an explicit pattern tilt.
 */
export function applyExportRotationToPatterns(
  svgFragment: string,
  deg: number = PDF_EXPORT_ROTATION_DEG,
): string {
  if (!svgFragment || !deg) return svgFragment;
  const rotate = `rotate(${deg})`;
  return svgFragment.replace(/<pattern\b([^>]*)>/gi, (match, attrs: string) => {
    const transformMatch = attrs.match(/\bpatternTransform\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!transformMatch) {
      const trimmed = attrs.trimEnd();
      const spacer = trimmed.length > 0 && !/\s$/.test(attrs) ? " " : "";
      return `<pattern${attrs}${spacer}patternTransform="${rotate}">`;
    }
    const quote = transformMatch[1];
    const existing = transformMatch[2].trim();
    const next = existing ? `${rotate} ${existing}` : rotate;
    const nextAttrs = attrs.replace(
      /\bpatternTransform\s*=\s*(["'])([\s\S]*?)\1/i,
      `patternTransform=${quote}${next}${quote}`,
    );
    return `<pattern${nextAttrs}>`;
  });
}

/** Rotate a point clockwise around a center (degrees). Used to place horizontal export text. */
export function rotatePointDeg(
  x: number,
  y: number,
  deg: number,
  cx: number,
  cy: number,
): [number, number] {
  if (!deg) return [x, y];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

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

/** IOF 704-style export label (magenta Arial 4 mm). */
const IOF_EXPORT_MAGENTA = "#FF00FF";
const IOF_EXPORT_FONT_SIZE = 4 * OCAD_UNITS_PER_MM;

function escapeExportXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Bottom-left export text (course name, length, scale, etc.). */
export function buildExportInfoSvg(
  frame: ExportFrame,
  lines: string[],
  options?: { textRotationDeg?: number },
): string {
  const visibleLines = lines.filter((line) => line.trim().length > 0 && line.trim() !== "—");
  if (visibleLines.length === 0) return "";

  const { x, y, width, height } = exportFrameBbox(frame);
  const margin = 3 * OCAD_UNITS_PER_MM;
  const lineHeight = IOF_EXPORT_FONT_SIZE * 1.2;
  const textX = x + margin;
  const bottomBaseline = y + height - margin;
  const firstLineY = bottomBaseline - (visibleLines.length - 1) * lineHeight;
  const textRotationDeg = options?.textRotationDeg ?? 0;

  const textMarkup = visibleLines
    .map((line, i) => {
      const lineY = firstLineY + i * lineHeight;
      const rotation = courseTextRotationTransform(textX, lineY, textRotationDeg);
      const textEl = `<text x="${textX}" y="${lineY}" fill="${IOF_EXPORT_MAGENTA}" font-size="${IOF_EXPORT_FONT_SIZE}" font-family="Arial, Helvetica, sans-serif" font-weight="normal" font-style="normal">${escapeExportXml(line)}</text>`;
      return rotation ? `<g transform="${rotation}">${textEl}</g>` : textEl;
    })
    .join("\n");

  return `<g data-export-info="true">\n${textMarkup}\n</g>`;
}

export function buildMapScaleInfoSvg(frame: ExportFrame, mapScale: number): string {
  return buildExportInfoSvg(frame, [formatMapScaleExportLabel(mapScale)]);
}

/** Wrap HUD markup (scale label, course text) in a transparent SVG matching the export frame. */
export function buildExportHudSvg(
  frame: ExportFrame,
  pixelWidth: number,
  pixelHeight: number,
  hudMarkup: string,
): string {
  if (!hudMarkup.trim()) return "";
  const { x, y, width, height } = exportFrameBbox(frame);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">
${hudMarkup}
</svg>`;
}

/**
 * Build export SVG clipped to the frame. Map content stays axis-aligned —
 * page tilt is applied later on the canvas so patterns/symbols rotate as pixels.
 */
export function buildClippedExportSvg(
  fullSvgText: string,
  frame: ExportFrame,
  pixelWidth: number,
  pixelHeight: number,
  _bottomLeftMarkup?: string,
  rotatedOverlayMarkup?: string,
  /** Print scale kept for call-site compatibility; HUD is built separately. */
  _exportScale?: number,
  /** @deprecated Page rotation is applied on canvas; kept for call-site compatibility. */
  _rotationDeg: number = PDF_EXPORT_ROTATION_DEG,
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
  const isPrebuiltExport = /<svg[^>]*\bdata-pdf-export=["']true["']/i.test(fullSvgText);
  const kartramMarkup = isPrebuiltExport
    ? ""
    : buildKartramFrameMarkup(parseKartramFromSvg(fullSvgText), exportFrameBbox(frame));
  const overlayMarkup = rotatedOverlayMarkup?.trim() ? `\n${rotatedOverlayMarkup}\n` : "";
  const mapContent = isPrebuiltExport
    ? inner
    : `${defs}\n${inner}\n${kartramMarkup}${overlayMarkup}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="${fill}" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}" data-canvas-rotate="true">
${mapContent}
</svg>`;
}

function loadPngBlobToCanvas(
  blob: Blob,
  pixelWidth: number,
  pixelHeight: number,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Kunde inte skapa exportyta"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pixelWidth, pixelHeight);
      ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Kunde inte läsa rastrerad exportbild"));
    };
    image.src = url;
  });
}

/** Client wait budget for server-side export (under route maxDuration 300s). */
const EXPORT_RASTER_FETCH_TIMEOUT_MS = 280_000;

async function fetchExportRaster(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), EXPORT_RASTER_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "PDF-exporten tog för lång tid. Försök igen om en stund — karttiles kan behöva bli klara först.",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

async function readRasterError(res: Response): Promise<string> {
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "Kunde inte rastrera kartbilden för export";
}

/** Build PDF from an already-rasterized export canvas. */
async function saveCanvasAsPdf(
  canvas: HTMLCanvasElement,
  frame: ExportFrame,
  fileName: string,
): Promise<void> {
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

  // Blob + <a download> is more reliable than pdf.save() after long async work
  // (browsers may ignore downloads that are no longer tied to the click gesture).
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Rasterize via version endpoint (server reads preview SVG from storage).
 * Avoids uploading multi‑MB map SVG in the request body (Vercel limit).
 */
export async function rasterizeVersionExportToCanvas(
  mapSlug: string,
  versionId: string,
  frame: ExportFrame,
  pixelWidth: number,
  pixelHeight: number,
  options?: {
    rotationDeg?: number;
    exportScale?: number;
    suggestionOverlaySvg?: string;
  },
): Promise<HTMLCanvasElement> {
  const res = await fetchExportRaster(
    `/api/maps/${mapSlug}/versions/${versionId}/export-raster`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frame,
        rotationDeg: options?.rotationDeg,
        exportScale: options?.exportScale,
        suggestionOverlaySvg: options?.suggestionOverlaySvg?.trim()
          ? options.suggestionOverlaySvg
          : undefined,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(await readRasterError(res));
  }

  const blob = await res.blob();
  return loadPngBlobToCanvas(blob, pixelWidth, pixelHeight);
}

/**
 * Rasterize a (usually small/prebuilt) SVG via sharp/librsvg.
 * Prefer {@link rasterizeVersionExportToCanvas} for full map exports.
 */
export async function rasterizeExportToCanvas(
  mapSvg: string,
  _frame: ExportFrame,
  pixelWidth: number,
  pixelHeight: number,
  rotationDeg: number,
  hudSvg?: string,
): Promise<HTMLCanvasElement> {
  const res = await fetchExportRaster("/api/export/rasterize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mapSvg,
      hudSvg: hudSvg?.trim() ? hudSvg : undefined,
      rotationDeg,
      widthPx: pixelWidth,
      heightPx: pixelHeight,
    }),
  });

  if (!res.ok) {
    throw new Error(await readRasterError(res));
  }

  const blob = await res.blob();
  return loadPngBlobToCanvas(blob, pixelWidth, pixelHeight);
}

/** Create a canvas from a PNG already produced server-side (e.g. course PDF). */
export async function canvasFromPngBase64(
  pngBase64: string,
  pixelWidth: number,
  pixelHeight: number,
): Promise<HTMLCanvasElement> {
  const raw = pngBase64.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  return loadPngBlobToCanvas(blob, pixelWidth, pixelHeight);
}

export async function downloadMapPdf(
  fullSvgText: string,
  frame: ExportFrame,
  fileName: string,
  options?: {
    mapSlug?: string;
    versionId?: string;
    suggestionOverlaySvg?: string;
    exportScale?: number;
    rotationDeg?: number;
    /** Horizontal overlay (scale label, course text). Drawn after canvas rotation. */
    hudSvg?: string;
    /** Server-rasterized PNG (base64); skips SVG upload. */
    pngBase64?: string;
  },
): Promise<void> {
  validateExportFrame(frame);

  const pixelWidth = mmToPx(frame.widthMm);
  const pixelHeight = mmToPx(frame.heightMm);

  if (options?.pngBase64?.trim()) {
    const canvas = await canvasFromPngBase64(
      options.pngBase64,
      pixelWidth,
      pixelHeight,
    );
    await saveCanvasAsPdf(canvas, frame, fileName);
    return;
  }

  let rotationDeg = options?.rotationDeg;
  if (rotationDeg == null) {
    const { fetchExportRotationDeg } = await import(
      "@/lib/settings/export-rotation-client"
    );
    rotationDeg = await fetchExportRotationDeg();
  }

  const isPrebuiltExport = /<svg[^>]*\bdata-pdf-export=["']true["']/i.test(fullSvgText);

  // Full map exports: rasterize on server from stored preview (no giant SVG body).
  if (
    !isPrebuiltExport &&
    options?.mapSlug &&
    options?.versionId
  ) {
    const canvas = await rasterizeVersionExportToCanvas(
      options.mapSlug,
      options.versionId,
      frame,
      pixelWidth,
      pixelHeight,
      {
        rotationDeg,
        exportScale: options.exportScale,
        suggestionOverlaySvg: options.suggestionOverlaySvg,
      },
    );
    await saveCanvasAsPdf(canvas, frame, fileName);
    return;
  }

  let mapSvg: string;
  let hudSvg = options?.hudSvg?.trim() ?? "";

  if (isPrebuiltExport) {
    mapSvg = fullSvgText;
  } else {
    mapSvg = buildClippedExportSvg(
      fullSvgText,
      frame,
      pixelWidth,
      pixelHeight,
      "",
      options?.suggestionOverlaySvg,
      options?.exportScale,
      0,
    );
    if (!hudSvg) {
      const scaleForLabel =
        options?.exportScale != null &&
        Number.isFinite(options.exportScale) &&
        options.exportScale > 0
          ? options.exportScale
          : (parseOcadMapScale(fullSvgText) ?? 15000);
      hudSvg = buildExportHudSvg(
        frame,
        pixelWidth,
        pixelHeight,
        buildMapScaleInfoSvg(frame, scaleForLabel),
      );
    }
  }

  const canvas = await rasterizeExportToCanvas(
    mapSvg,
    frame,
    pixelWidth,
    pixelHeight,
    rotationDeg,
    hudSvg || undefined,
  );

  await saveCanvasAsPdf(canvas, frame, fileName);
}

export async function downloadMapOcd(
  mapSlug: string,
  versionId: string,
  frame: ExportFrame,
  ocadVersion: OcadExportVersion,
  fileName: string,
  options?: {
    includeSuggestions?: boolean;
    suggestionSymbols?: OcdSuggestionSymbolMapping;
  },
): Promise<{ versionWarning?: string; suggestionWarnings?: string }> {
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
      includeSuggestions: options?.includeSuggestions,
      suggestionSymbols: options?.suggestionSymbols,
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
  const suggestionWarningsHeader = response.headers.get("X-Ocad-Suggestion-Warnings");
  const suggestionWarnings = suggestionWarningsHeader
    ? decodeURIComponent(suggestionWarningsHeader)
    : undefined;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".ocd") ? fileName : `${fileName}.ocd`;
  link.click();
  URL.revokeObjectURL(url);

  return { versionWarning, suggestionWarnings };
}

export async function downloadMapOmap(
  mapSlug: string,
  versionId: string,
  frame: ExportFrame,
  fileName: string,
): Promise<{ warnings?: string }> {
  validateExportFrame(frame);

  const response = await fetch(`/api/maps/${mapSlug}/versions/${versionId}/export-omap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      svgFrame: {
        centerX: frame.centerX,
        centerY: frame.centerY,
        widthUnits: frame.widthUnits,
        heightUnits: frame.heightUnits,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Mapper-export (.omap) misslyckades");
  }

  const blob = await response.blob();
  const warningsHeader = response.headers.get("X-Omap-Warnings");
  const warnings = warningsHeader ? decodeURIComponent(warningsHeader) : undefined;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".omap") ? fileName : `${fileName}.omap`;
  link.click();
  URL.revokeObjectURL(url);

  return { warnings };
}

export async function downloadMapGeoTiff(
  mapSlug: string,
  versionId: string,
  fullSvgText: string,
  frame: ExportFrame,
  fileName: string,
  options?: {
    suggestionOverlaySvg?: string;
    exportScale?: number;
    rotationDeg?: number;
    hudSvg?: string;
  },
): Promise<void> {
  validateExportFrame(frame);

  let rotationDeg = options?.rotationDeg;
  if (rotationDeg == null) {
    const { fetchExportRotationDeg } = await import(
      "@/lib/settings/export-rotation-client"
    );
    rotationDeg = await fetchExportRotationDeg();
  }

  const pixelWidth = mmToPx(frame.widthMm);
  const pixelHeight = mmToPx(frame.heightMm);

  // Prefer server-side raster from stored preview (avoids uploading full SVG).
  let canvas: HTMLCanvasElement;
  try {
    canvas = await rasterizeVersionExportToCanvas(
      mapSlug,
      versionId,
      frame,
      pixelWidth,
      pixelHeight,
      {
        rotationDeg,
        exportScale: options?.exportScale,
        suggestionOverlaySvg: options?.suggestionOverlaySvg,
      },
    );
  } catch {
    const mapSvg = buildClippedExportSvg(
      fullSvgText,
      frame,
      pixelWidth,
      pixelHeight,
      "",
      options?.suggestionOverlaySvg,
      options?.exportScale,
      0,
    );
    let hudSvg = options?.hudSvg?.trim() ?? "";
    if (!hudSvg) {
      const scaleForLabel =
        options?.exportScale != null &&
        Number.isFinite(options.exportScale) &&
        options.exportScale > 0
          ? options.exportScale
          : (parseOcadMapScale(fullSvgText) ?? 15000);
      hudSvg = buildExportHudSvg(
        frame,
        pixelWidth,
        pixelHeight,
        buildMapScaleInfoSvg(frame, scaleForLabel),
      );
    }
    canvas = await rasterizeExportToCanvas(
      mapSvg,
      frame,
      pixelWidth,
      pixelHeight,
      rotationDeg,
      hudSvg || undefined,
    );
  }

  const imageBase64 = canvas.toDataURL("image/png");

  const response = await fetch(`/api/maps/${mapSlug}/versions/${versionId}/export-geotiff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame, imageBase64 }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "GeoTIFF-export misslyckades");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".tif") ? fileName : `${fileName}.tif`;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatExportLabel(settings: ExportSettings): string {
  const scaleLabel = EXPORT_SCALES.find((s) => s.value === settings.scale)?.label ?? "";
  const formatLabel = settings.format;
  const orientLabel =
    EXPORT_ORIENTATIONS.find((o) => o.value === settings.orientation)?.label ?? "";
  const outputLabel =
    settings.outputFormat === "ocd"
      ? "OCD"
      : settings.outputFormat === "geotiff"
        ? "GeoTIFF"
        : "PDF";
  return `${scaleLabel} · ${formatLabel} ${orientLabel} · ${outputLabel}`;
}
