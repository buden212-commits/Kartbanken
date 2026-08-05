import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import type {
  SuggestionBboxGeometry,
  SuggestionGeometry,
  SuggestionLineGeometry,
  SuggestionObjectDto,
  SuggestionPointGeometry,
  SuggestionPolygonGeometry,
} from "./types";

export const SUGGESTION_ORANGE = "#f97316";
export const SUGGESTION_ORANGE_STROKE = "#c2410c";
/** Stroke/pin scale for interactive map views (detail, create, overview overlay). */
export const LIVE_MAP_STROKE_SCALE = 2.5;
/** Label text scale for interactive map views (relative to stroke scale). */
export const LIVE_MAP_LABEL_SCALE = 10;

export function liveMapRenderOptions(
  options?: Omit<SuggestionRenderOptions, "strokeScale" | "labelScale">,
): SuggestionRenderOptions {
  return {
    ...options,
    strokeScale: LIVE_MAP_STROKE_SCALE,
    labelScale: LIVE_MAP_LABEL_SCALE,
  };
}
/** Halo stroke for lines/polygons — improves contrast on busy maps. */
const SUGGESTION_HALO = "#ffffff";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SuggestionRenderOptions = {
  label?: string;
  selected?: boolean;
  draft?: boolean;
  /** Multiplier for stroke widths and pin size (e.g. PDF snippets). */
  strokeScale?: number;
  /** Multiplier for label font size and label offsets (live map overlays). */
  labelScale?: number;
};

function strokeScale(options?: SuggestionRenderOptions): number {
  const scale = options?.strokeScale ?? 1;
  return scale > 0 ? scale : 1;
}

function labelScale(options?: SuggestionRenderOptions): number {
  const scale = options?.labelScale ?? 1;
  return scale > 0 ? scale : 1;
}

export function renderSuggestionPinSvg(
  geometry: SuggestionPointGeometry,
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
): string {
  const [x, y] = geoToSvgUserPoint(geometry.coordinates, rootTransform);
  const s = strokeScale(options);
  const ls = labelScale(options);
  const r = (options?.selected ? 22 : 16) * s;
  const labelOffset = 8 * s * ls;
  const labelSize = 13 * s * ls;
  const label = options?.label
    ? `<text x="${x}" y="${y - r - labelOffset}" text-anchor="middle" font-size="${labelSize}" font-weight="700" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-pin="true">
    <circle cx="${x}" cy="${y}" r="${r + 8 * s}" fill="${SUGGESTION_ORANGE}" fill-opacity="0.3" stroke="${SUGGESTION_HALO}" stroke-width="${3 * s}"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${SUGGESTION_ORANGE}" fill-opacity="0.95" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${4 * s}"/>
    <circle cx="${x}" cy="${y}" r="${5 * s}" fill="white" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${1.5 * s}"/>
    ${label}
  </g>`;
}

export function renderSuggestionBboxSvg(
  geometry: SuggestionBboxGeometry,
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
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
  const s = strokeScale(options);
  const ls = labelScale(options);
  const strokeWidth = (options?.selected ? 6 : 5) * s;
  const fillOpacity = options?.draft ? 0.2 : 0.3;
  const label = options?.label
    ? `<text x="${x + width / 2}" y="${y - 6 * s * ls}" text-anchor="middle" font-size="${11 * s * ls}" font-weight="600" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-bbox="true">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${SUGGESTION_ORANGE}" fill-opacity="${fillOpacity}" stroke="${SUGGESTION_HALO}" stroke-width="${strokeWidth + 3 * s}"/>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${SUGGESTION_ORANGE}" fill-opacity="${fillOpacity}" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${strokeWidth}" stroke-dasharray="${options?.draft ? `${8 * s} ${5 * s}` : "none"}"/>
    ${label}
  </g>`;
}

export function geoRingToSvgPoints(
  ring: [number, number][],
  rootTransform: SvgRootTransform,
): string {
  return ring
    .map(([x, y]) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], rootTransform);
      return `${sx},${sy}`;
    })
    .join(" ");
}

export function renderSuggestionPolygonSvg(
  geometry: SuggestionPolygonGeometry,
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
): string {
  const points = geoRingToSvgPoints(geometry.ring, rootTransform);
  const s = strokeScale(options);
  const ls = labelScale(options);
  const strokeWidth = (options?.selected ? 6 : 5) * s;
  const fillOpacity = options?.draft ? 0.2 : 0.3;
  const svgPts = geometry.ring.map(([x, y]) => geoToSvgUserPoint([x, y], rootTransform));
  const cx = svgPts.reduce((sum, [x]) => sum + x, 0) / svgPts.length;
  const cy = svgPts.reduce((sum, [, y]) => sum + y, 0) / svgPts.length;
  const label = options?.label
    ? `<text x="${cx}" y="${cy - 6 * s * ls}" text-anchor="middle" font-size="${11 * s * ls}" font-weight="600" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-polygon="true">
    <polygon points="${points}" fill="${SUGGESTION_ORANGE}" fill-opacity="${fillOpacity}" stroke="${SUGGESTION_HALO}" stroke-width="${strokeWidth + 3 * s}" stroke-linejoin="round"/>
    <polygon points="${points}" fill="${SUGGESTION_ORANGE}" fill-opacity="${fillOpacity}" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${strokeWidth}" stroke-dasharray="${8 * s} ${5 * s}" stroke-linejoin="round"/>
    ${label}
  </g>`;
}

export function renderSuggestionLineSvg(
  geometry: SuggestionLineGeometry,
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
): string {
  const points = geoRingToSvgPoints(geometry.coordinates, rootTransform);
  const s = strokeScale(options);
  const ls = labelScale(options);
  const strokeWidth = (options?.selected ? 8 : 6) * s;
  const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]!;
  const [lx, ly] = geoToSvgUserPoint(mid, rootTransform);
  const label = options?.label
    ? `<text x="${lx}" y="${ly - 10 * s * ls}" text-anchor="middle" font-size="${13 * s * ls}" font-weight="700" fill="${SUGGESTION_ORANGE_STROKE}">${escapeXml(options.label)}</text>`
    : "";
  return `<g data-suggestion-line="true">
    <polyline points="${points}" fill="none" stroke="${SUGGESTION_HALO}" stroke-width="${strokeWidth + 5 * s}" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${points}" fill="none" stroke="${SUGGESTION_ORANGE}" stroke-width="${strokeWidth + 1 * s}" stroke-opacity="0.45" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${points}" fill="none" stroke="${SUGGESTION_ORANGE_STROKE}" stroke-width="${strokeWidth}" stroke-dasharray="${10 * s} ${6 * s}" stroke-linecap="round" stroke-linejoin="round"/>
    ${label}
  </g>`;
}

export function renderSuggestionGeometrySvg(
  geometry: SuggestionGeometry,
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
): string {
  if (geometry.type === "Point") {
    return renderSuggestionPinSvg(geometry, rootTransform, options);
  }
  if (geometry.type === "Bbox") {
    return renderSuggestionBboxSvg(geometry, rootTransform, options);
  }
  if (geometry.type === "Polygon") {
    return renderSuggestionPolygonSvg(geometry, rootTransform, options);
  }
  return renderSuggestionLineSvg(geometry, rootTransform, options);
}

export function renderSuggestionObjectsSvg(
  objects: SuggestionObjectDto[],
  rootTransform: SvgRootTransform,
  options?: SuggestionRenderOptions,
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

export function bboxFromRing(ring: [number, number][]): SuggestionBboxGeometry["bbox"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export function isValidSuggestionPolygonRing(ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  const bbox = bboxFromRing(ring);
  return isValidSuggestionBbox(bbox);
}

export function isValidSuggestionLineCoordinates(coordinates: [number, number][]): boolean {
  return coordinates.length >= 2;
}

const POINT_ZOOM_PADDING_M = 20;

export type SuggestionGeoBbox = [number, number, number, number];

export function bboxFromSuggestionGeometry(
  geometry: SuggestionGeometry,
): SuggestionBboxGeometry["bbox"] {
  switch (geometry.type) {
    case "Point": {
      const [x, y] = geometry.coordinates;
      return {
        minX: x - POINT_ZOOM_PADDING_M,
        minY: y - POINT_ZOOM_PADDING_M,
        maxX: x + POINT_ZOOM_PADDING_M,
        maxY: y + POINT_ZOOM_PADDING_M,
      };
    }
    case "Bbox":
      return geometry.bbox;
    case "Polygon":
      return bboxFromRing(geometry.ring);
    case "LineString":
      return bboxFromRing(geometry.coordinates);
  }
}

export function bboxFromSuggestionGeometries(
  geometries: SuggestionGeometry[],
): SuggestionGeoBbox | null {
  if (geometries.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const geometry of geometries) {
    const bbox = bboxFromSuggestionGeometry(geometry);
    minX = Math.min(minX, bbox.minX);
    minY = Math.min(minY, bbox.minY);
    maxX = Math.max(maxX, bbox.maxX);
    maxY = Math.max(maxY, bbox.maxY);
  }

  return [minX, minY, maxX, maxY];
}
