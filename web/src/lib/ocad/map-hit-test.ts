import type { OcadObjectChange } from "./diff-types";
import { getChangeCentroid } from "./change-utils";
import { svgUserToGeoPoint, type SvgRootTransform } from "./svg-coords";

export type ViewBoxRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function parseViewBoxString(viewBox: string | null): ViewBoxRect | null {
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [x, y, width, height] = parts;
  return { x: x!, y: y!, width: width!, height: height! };
}

export function screenToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): [number, number] | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const mapped = point.matrixTransform(ctm.inverse());
  return [mapped.x, mapped.y];
}

function hitScore(
  change: OcadObjectChange,
  x: number,
  y: number,
  tolerance: number,
): number | null {
  const [minX, minY, maxX, maxY] = change.bbox;
  const pad = change.type === "point" ? tolerance : tolerance * 0.5;
  const inBbox =
    x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad;

  const [cx, cy] = getChangeCentroid(change) ?? [NaN, NaN];
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const dist = Math.hypot(x - cx, y - cy);

  if (change.type === "point") {
    if (dist <= tolerance * 2.5) return dist;
    return null;
  }

  if (inBbox) return dist;
  return null;
}

export function findChangeAtPoint(
  svgPoint: [number, number],
  changes: OcadObjectChange[],
  viewBox: ViewBoxRect | null,
  rootTransform: SvgRootTransform,
): { change: OcadObjectChange; index: number } | null {
  if (changes.length === 0) return null;

  const [x, y] = svgUserToGeoPoint(svgPoint, rootTransform);
  const tolerance = viewBox
    ? Math.max(viewBox.width, viewBox.height) * 0.04
    : 25;

  let best: { change: OcadObjectChange; index: number; score: number } | null = null;

  for (let index = 0; index < changes.length; index++) {
    const change = changes[index]!;
    const score = hitScore(change, x, y, tolerance);
    if (score === null) continue;
    if (!best || score < best.score) {
      best = { change, index, score };
    }
  }

  return best ? { change: best.change, index: best.index } : null;
}
