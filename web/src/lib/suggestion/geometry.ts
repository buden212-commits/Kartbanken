import { geoToSvgUserPoint, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import type { SuggestionGeometry, SuggestionObjectDto } from "./types";

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
  geometry: SuggestionGeometry,
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

export function renderSuggestionObjectsSvg(
  objects: SuggestionObjectDto[],
  rootTransform: SvgRootTransform,
  options?: { label?: string; selected?: boolean },
): string {
  return objects
    .filter((obj) => obj.geometry.type === "Point")
    .map((obj) => renderSuggestionPinSvg(obj.geometry, rootTransform, options))
    .join("");
}
