import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import type {
  SuggestionBboxGeometry,
  SuggestionGeometry,
  SuggestionObjectDto,
  SuggestionPointGeometry,
} from "./types";

export const SUGGESTION_ORANGE = "#f97316";
export const SUGGESTION_ORANGE_STROKE = "#c2410c";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSuggestionPinSvg(
  geometry: SuggestionPointGeometry,
  rootTransform: SvgRootTransform,
  options?: { label?: string; selected?: boolean },
): string {
  const [x, y] = geoToSvgUserPoint(geometry.coordinates, rootTransform);
  const r = options?.selected ? 14 : 10;
  const label = options?.label
    ? `<text x="${x}" y="${y - r - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-pin="true">
    <circle cx="${x}" cy="${y}" r="${r + 4}" fill="${SUGGESTION_ORANGE}" fill-opacity="0.25" stroke="none"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${SUGGESTION_ORANGE}" fill-opacity="0.9" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="3" fill="white"/>
    ${label}
  </g>`;
}

export function renderSuggestionBboxSvg(
  geometry: SuggestionBboxGeometry,
  rootTransform: SvgRootTransform,
  options?: { label?: string; selected?: boolean; draft?: boolean },
): string {
  const { minX, minY, maxX, maxY } = geometry.bbox;
  const [svgMinX, svgMinY, svgMaxX, svgMaxY] = geoBboxToSvgUser(
    [minX, minY, maxX, maxY],
    rootTransform,
  );
  const x = Math.min(svgMinX, svgMaxX);
  const y = Math.min(svgMinY, svgMaxY);
  const width = Math.abs(svgMaxX - svgMinX);
  const height = Math.abs(svgMaxY - svgMinY);
  const strokeWidth = options?.selected ? 3 : 2;
  const fillOpacity = options?.draft ? 0.15 : 0.25;
  const label = options?.label
    ? `<text x="${x + width / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-bbox="true">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${SUGGESTION_ORANGE}" fill-opacity="${fillOpacity}" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${strokeWidth}" stroke-dasharray="${options?.draft ? "6 4" : "none"}"/>
    ${label}
  </g>`;
}

export function renderSuggestionGeometrySvg(
  geometry: SuggestionGeometry,
  rootTransform: SvgRootTransform,
  options?: { label?: string; selected?: boolean; draft?: boolean },
): string {
  if (geometry.type === "Point") {
    return renderSuggestionPinSvg(geometry, rootTransform, options);
  }
  return renderSuggestionBboxSvg(geometry, rootTransform, options);
}

export function renderSuggestionObjectsSvg(
  objects: SuggestionObjectDto[],
  rootTransform: SvgRootTransform,
  options?: { label?: string; selected?: boolean },
): string {
  return objects
    .map((obj) => renderSuggestionGeometrySvg(obj.geometry, rootTransform, options))
    .join("");
}

/** Minimum bbox side length in map coordinates (meters). */
export const MIN_SUGGESTION_BBOX_SIZE = 1;

export function normalizeSuggestionBbox(
  start: [number, number],
  end: [number, number],
): SuggestionBboxGeometry["bbox"] {
  return {
    minX: Math.min(start[0], end[0]),
    minY: Math.min(start[1], end[1]),
    maxX: Math.max(start[0], end[0]),
    maxY: Math.max(start[1], end[1]),
  };
}

export function isValidSuggestionBbox(bbox: SuggestionBboxGeometry["bbox"]): boolean {
  return (
    bbox.maxX - bbox.minX >= MIN_SUGGESTION_BBOX_SIZE &&
    bbox.maxY - bbox.minY >= MIN_SUGGESTION_BBOX_SIZE
  );
}
