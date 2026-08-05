import { geoBboxToSvgUser, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import { parseOcadMapScale } from "@/lib/ocad/svg-utils";
import { suggestionObjectTypeForGeometry } from "@/lib/suggestion/access";
import {
  bboxFromSuggestionGeometries,
  renderSuggestionObjectsSvg,
} from "@/lib/suggestion/geometry";
import type { SuggestionGeometry } from "@/lib/suggestion/types";

const SNIPPET_DPI = 150;
const SNIPPET_PADDING_M = 50;
const SNIPPET_MAX_PX = 520;

export function buildSuggestionMapSnippetSvg(
  fullSvgText: string,
  geometries: SuggestionGeometry[],
  rootTransform: SvgRootTransform,
  paddingM = SNIPPET_PADDING_M,
): string | null {
  const geoBbox = bboxFromSuggestionGeometries(geometries);
  if (!geoBbox) return null;

  const [minGx, minGy, maxGx, maxGy] = geoBbox;
  const [svgMinX, svgMinY, svgMaxX, svgMaxY] = geoBboxToSvgUser(
    [minGx - paddingM, minGy - paddingM, maxGx + paddingM, maxGy + paddingM],
    rootTransform,
  );

  const x = Math.min(svgMinX, svgMaxX);
  const y = Math.min(svgMinY, svgMaxY);
  const width = Math.max(Math.abs(svgMaxX - svgMinX), 10);
  const height = Math.max(Math.abs(svgMaxY - svgMinY), 10);

  const aspect = width / height;
  let pixelWidth: number;
  let pixelHeight: number;
  if (aspect >= 1) {
    pixelWidth = SNIPPET_MAX_PX;
    pixelHeight = Math.max(1, Math.round(SNIPPET_MAX_PX / aspect));
  } else {
    pixelHeight = SNIPPET_MAX_PX;
    pixelWidth = Math.max(1, Math.round(SNIPPET_MAX_PX * aspect));
  }

  const fillMatch = fullSvgText.match(/<svg[^>]*\bfill=["']([^"']+)["']/i);
  const fill = fillMatch?.[1] ?? "white";
  const defsMatch = fullSvgText.match(/<defs[\s\S]*?<\/defs>/i);
  const defs = defsMatch?.[0] ?? "<defs/>";
  const inner = fullSvgText
    .replace(/<\?xml[^?]*\?>/i, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/<defs[\s\S]*?<\/defs>/i, "");

  const objects = geometries.map((geometry, index) => ({
    id: `snippet-${index}`,
    objectType: suggestionObjectTypeForGeometry(geometry),
    geometry,
    sortOrder: index,
  }));

  const overlay = renderSuggestionObjectsSvg(objects, rootTransform, {
    selected: true,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="${fill}" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">
${defs}
${inner}
<g data-suggestion-snippet="true">${overlay}</g>
</svg>`;
}

export function snippetPixelSize(svgMarkup: string): { width: number; height: number } {
  const widthMatch = svgMarkup.match(/\bwidth="(\d+)"/);
  const heightMatch = svgMarkup.match(/\bheight="(\d+)"/);
  return {
    width: widthMatch ? Number(widthMatch[1]) : SNIPPET_MAX_PX,
    height: heightMatch ? Number(heightMatch[1]) : SNIPPET_MAX_PX,
  };
}

export { SNIPPET_DPI, SNIPPET_MAX_PX, parseOcadMapScale };
