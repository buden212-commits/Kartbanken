import { parseOcadCrsFromSvg, type OcadCrsInfo } from "./crs";
import { parseSvgRootTransform, type SvgRootTransform } from "./svg-coords";
import type { OcadMapLayer } from "./layers";
import { sanitizeSvgMarkup } from "@/lib/security/svg-sanitize";

export type { OcadMapLayer };

export type SvgBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function parseViewBox(svgText: string): SvgBounds | null {
  const match = svgText.match(/viewBox=["']([^"']+)["']/);
  if (!match) return null;
  const parts = match[1]!.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [x, y, w, h] = parts;
  return { minX: x!, minY: y!, maxX: x! + w!, maxY: y! + h! };
}

export function bboxToViewBox(
  bbox: [number, number, number, number],
  padding = 0.2,
): string {
  const [minX, minY, maxX, maxY] = bbox;
  const w = Math.max(maxX - minX, 5);
  const h = Math.max(maxY - minY, 5);
  const padX = w * padding;
  const padY = h * padding;
  return `${minX - padX} ${minY - padY} ${w + padX * 2} ${h + padY * 2}`;
}

export function boundsToViewBox(bounds: SvgBounds): string {
  return `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
}

export function parseOcadMapScale(svgText: string): number | null {
  const match = svgText.match(/data-ocad-scale=["'](\d+(?:\.\d+)?)["']/i);
  if (!match) return null;
  const scale = Number(match[1]);
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

export function parseOcadFileVersion(svgText: string): number | null {
  const match = svgText.match(/data-ocad-version=["'](\d+(?:\.\d+)?)["']/i);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isFinite(version) && version > 0 ? version : null;
}

function unescapeXmlAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<");
}

export function parseOcadLayersFromSvg(svgText: string): OcadMapLayer[] {
  const match = svgText.match(/data-ocad-layers=["']([^"']*)["']/i);
  if (!match?.[1]) return [];
  try {
    return JSON.parse(unescapeXmlAttr(match[1])) as OcadMapLayer[];
  } catch {
    return [];
  }
}

export function extractSvgInner(svgText: string): {
  inner: string;
  viewBox: string | null;
  fill: string | null;
  ocadMapScale: number | null;
  ocadFileVersion: number | null;
  ocadCrs: OcadCrsInfo | null;
  ocadLayers: OcadMapLayer[];
  rootTransform: SvgRootTransform;
} {
  const safe = sanitizeSvgMarkup(svgText);
  const viewBoxMatch = safe.match(/viewBox=["']([^"']+)["']/);
  const viewBox = viewBoxMatch?.[1] ?? null;
  const fillMatch = safe.match(/<svg[^>]*\bfill=["']([^"']+)["']/i);
  const fill = fillMatch?.[1] ?? null;
  const ocadMapScale = parseOcadMapScale(safe);
  const ocadFileVersion = parseOcadFileVersion(safe);
  const ocadCrs = parseOcadCrsFromSvg(safe);
  const ocadLayers = parseOcadLayersFromSvg(safe);
  const inner = safe
    .replace(/<\?xml[^?]*\?>/i, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
  return {
    inner,
    viewBox,
    fill,
    ocadMapScale,
    ocadFileVersion,
    ocadCrs,
    ocadLayers,
    rootTransform: parseSvgRootTransform(inner),
  };
}
