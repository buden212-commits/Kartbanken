import type { SvgRootTransform } from "@/lib/ocad/svg-coords";

/**
 * Convert desired screen pixels to SVG user units for the current view.
 * Use for marker radii/handle sizes so overlays stay constant on screen
 * regardless of map extent or zoom.
 *
 * Stroke widths that already use `vector-effect="non-scaling-stroke"` should
 * stay in raw screen pixels and must NOT be multiplied by this factor.
 */
export function svgUnitsPerScreenPx(
  viewBox: string | null | undefined,
  containerWidth: number,
  containerHeight: number,
  zoom = 1,
): number {
  if (!viewBox || containerWidth <= 0 || containerHeight <= 0) return 1;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return 1;
  const vbW = parts[2]!;
  const vbH = parts[3]!;
  if (vbW <= 0 || vbH <= 0) return 1;
  const meetScale = Math.min(containerWidth / vbW, containerHeight / vbH);
  const screenScale = meetScale * (zoom > 0 ? zoom : 1);
  if (screenScale < 1e-12) return 1;
  return 1 / screenScale;
}

/** Prefer live CTM when an SVG element is available (includes CSS zoom/pan). */
export function svgUnitsPerScreenPxFromElement(svg: SVGSVGElement | null): number | null {
  if (!svg) return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const scale = Math.hypot(ctm.a, ctm.b);
  if (scale < 1e-12) return null;
  return 1 / scale;
}

export function screenPxToSvgUser(px: number, unitsPerPx: number): number {
  return px * unitsPerPx;
}

/** No-op placeholder so call sites can share the transform type. */
export type OverlayViewScale = {
  /** SVG user units per CSS pixel */
  svgUnitsPerPx: number;
  transform: SvgRootTransform;
};
