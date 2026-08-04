import type { CourseObjectDto } from "./types";
import { renderCourseExportTextSvg, renderCourseOverlaySvg } from "./geometry";
import { IDENTITY_SVG_TRANSFORM, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import { buildKartramFrameMarkup, parseKartramFromSvg } from "@/lib/ocad/kartram";
import {
  buildExportInfoSvg,
  exportFrameBbox,
  pdfExportRotationTransform,
  type ExportFrame,
} from "@/lib/ocad/map-export";
import {
  formatMapScaleExportLabel,
  type PdfOrientation,
  type PdfPaperFormat,
} from "./pdf-scale";

export function buildControlListSvg(
  controls: Array<{ number: number; label: string }>,
  widthMm: number,
): string {
  if (controls.length === 0) return "";

  const lineHeight = 14;
  const padding = 8;
  const height = padding * 2 + controls.length * lineHeight;
  const lines = controls
    .map(
      (c, i) =>
        `<text x="${padding}" y="${padding + (i + 1) * lineHeight - 3}" font-size="11" font-family="sans-serif">${c.number}. ${escapeXml(c.label)}</text>`,
    )
    .join("\n");

  return `<g transform="translate(0, 0)">
<rect x="0" y="0" width="${widthMm * 3.78}" height="${height}" fill="white" fill-opacity="0.92" stroke="#cbd5e1"/>
${lines}
</g>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** IOF 704-style course name, length, and map scale — bottom-left of export frame. */
export function buildCourseInfoSvg(
  frame: ExportFrame,
  courseName: string,
  courseLengthLabel: string,
  mapScale?: number,
  options?: { textRotationDeg?: number },
): string {
  const lines = [courseName.trim(), courseLengthLabel.trim()];
  if (mapScale != null) {
    lines.push(formatMapScaleExportLabel(mapScale));
  }
  return buildExportInfoSvg(frame, lines, options);
}

export function buildCourseExportSvg(
  fullSvgText: string,
  frame: ExportFrame,
  objects: CourseObjectDto[],
  rootTransform: SvgRootTransform = IDENTITY_SVG_TRANSFORM,
  controlNumbers?: Map<string, number>,
  courseInfo?: { name: string; lengthLabel: string; mapScale?: number },
): string {
  const pixelWidth = Math.max(1, Math.round((frame.widthMm / 25.4) * 200));
  const pixelHeight = Math.max(1, Math.round((frame.heightMm / 25.4) * 200));

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
  const overlayMarkup = renderCourseOverlaySvg(objects, rootTransform, {
    controlNumbers,
    skipText: true,
  });
  const exportTextMarkup = renderCourseExportTextSvg(
    objects,
    rootTransform,
    frame,
    controlNumbers,
  );
  const infoMarkup =
    courseInfo != null
      ? buildCourseInfoSvg(
          frame,
          courseInfo.name,
          courseInfo.lengthLabel,
          courseInfo.mapScale,
          { textRotationDeg: 0 },
        )
      : "";

  const rotation = pdfExportRotationTransform(frame);
  const kartramMarkup = buildKartramFrameMarkup(
    parseKartramFromSvg(fullSvgText),
    exportFrameBbox(frame),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="${fill}" data-pdf-export="true" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">
${defs}
<g transform="${rotation}">
${inner}
<g data-course-overlay="true">${overlayMarkup}</g>
${kartramMarkup}
</g>
${exportTextMarkup ? `<g data-export-text="true">\n${exportTextMarkup}\n</g>` : ""}
${infoMarkup}
</svg>`;
}

export function parseExportQueryParams(searchParams: URLSearchParams): {
  format: PdfPaperFormat;
  orientation: PdfOrientation;
  scale: number;
  includeControlList: boolean;
} {
  const format = searchParams.get("format") === "A3" ? "A3" : "A4";
  const orientation =
    searchParams.get("orientation") === "landscape" ? "landscape" : "portrait";
  const scale = Number(searchParams.get("scale") ?? 10000);
  const includeControlList = searchParams.get("controlList") !== "false";
  return { format, orientation, scale, includeControlList };
}
