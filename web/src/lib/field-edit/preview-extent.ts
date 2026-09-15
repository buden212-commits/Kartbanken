import { bboxFromGeometry } from "@/lib/checkout/overlap";
import type { CheckoutSelectionGeometry } from "@/lib/checkout/types";
import {
  geoBboxToSvgUser,
  parseSvgRootTransform,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import { rewriteSvgRootTag } from "@/lib/ocad/svg-root";
import { extractSvgInner, type SvgBounds } from "@/lib/ocad/svg-utils";
import { parseViewBoxString } from "@/lib/ocad/map-hit-test";

/** Small padding so the red selection edge is not clipped. */
const DEFAULT_PADDING_RATIO = 0.03;

/**
 * Convert selection geometry to SVG viewBox bounds using the same Y-flip
 * as ocad2svg (`translate(0, minY+maxY)`).
 */
export function selectionToPreviewSvgBounds(
  geometry: CheckoutSelectionGeometry,
  rootTransform: SvgRootTransform,
  paddingRatio = DEFAULT_PADDING_RATIO,
): SvgBounds {
  const bbox = bboxFromGeometry(geometry);
  const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
    [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY],
    rootTransform,
  );
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padX = width * paddingRatio;
  const padY = height * paddingRatio;
  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}

export function svgBoundsToViewBox(bounds: SvgBounds): string {
  return `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
}

/** Root transform for a generated OCAD preview (matches generateOcadSvgLayered). */
export function previewRootTransformFromObjectBounds(objectBounds: SvgBounds): SvgRootTransform {
  return {
    tx: 0,
    ty: objectBounds.minY + objectBounds.maxY,
    flipY: true,
  };
}

function rootTransformFromPreviewSvg(svgText: string): SvgRootTransform {
  const { inner, viewBox } = extractSvgInner(svgText);
  const parsed = parseSvgRootTransform(inner);
  if (parsed.flipY) return parsed;

  const vb = parseViewBoxString(viewBox);
  if (vb && vb.height > 0) {
    // Approximate y-flip center from current viewBox when translate is missing.
    return { tx: 0, ty: vb.y * 2 + vb.height, flipY: true };
  }
  return parsed;
}

/**
 * Rewrite preview SVG viewBox to the checkout/field-edit selection extent
 * so «Hela kartan» does not show large empty margins from oversized object bounds.
 */
export function applySelectionViewBoxToPreviewSvg(
  svgText: string,
  geometry: CheckoutSelectionGeometry,
  paddingRatio = DEFAULT_PADDING_RATIO,
): string {
  const transform = rootTransformFromPreviewSvg(svgText);
  const bounds = selectionToPreviewSvgBounds(geometry, transform, paddingRatio);
  return rewriteSvgRootTag(svgText, { viewBox: svgBoundsToViewBox(bounds) });
}
