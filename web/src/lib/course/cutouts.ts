import { geoToSvgUserPoint, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import type {
  CourseCircleCutout,
  CourseGeometry,
  CourseLegGap,
  CourseObjectDto,
  CoursePointGeometry,
  EditorObject,
} from "./types";
import { CourseObjectType } from "./types";
import {
  COURSE_LEG_SYMBOLS,
  getCourseSymbol,
  getPointSymbolLegGap,
  IOF_CONTROL_RADIUS,
  IOF_FINISH_INNER_RADIUS,
  IOF_FINISH_OUTER_RADIUS,
  IOF_MAGENTA,
  IOF_MAP_ISSUE_RADIUS,
  IOF_SYMBOL_STROKE,
  mmToOcadUnits,
  renderControlNumberNearPoint,
} from "./symbols";

function distance2d(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Default arc removed from control circles (~45°). */
export const DEFAULT_CUTOUT_SPAN_RAD = Math.PI / 4;

/** Default gap length on legs and manual lines (3 mm on map). */
export const DEFAULT_LEG_GAP_LENGTH = mmToOcadUnits(3);

export const MAX_CUTOUTS_PER_POINT = 4;
export const MAX_LEG_GAPS_PER_POINT = 4;
export const MAX_GAPS_PER_LINE = 8;

const CUTOUT_SYMBOL_NRS = new Set([702, 703, 706]);

export function supportsCircleCutouts(symbolNr: number): boolean {
  return CUTOUT_SYMBOL_NRS.has(symbolNr);
}

export function controlCircleRadiusGeo(symbolNr: number): number {
  switch (symbolNr) {
    case 702:
      return IOF_MAP_ISSUE_RADIUS;
    case 706:
      return IOF_FINISH_OUTER_RADIUS;
    default:
      return IOF_CONTROL_RADIUS;
  }
}

export function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

export function angleFromCenter(
  center: [number, number],
  point: [number, number],
): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0]);
}

export function cutoutContainsAngle(
  cutout: CourseCircleCutout,
  angle: number,
): boolean {
  const span = cutout.spanRad ?? DEFAULT_CUTOUT_SPAN_RAD;
  const half = span / 2;
  const center = normalizeAngle(cutout.angleRad);
  const a = normalizeAngle(angle);
  let diff = Math.abs(a - center);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff <= half + 0.001;
}

export function toggleCutout(
  cutouts: CourseCircleCutout[] | undefined,
  angleRad: number,
): CourseCircleCutout[] {
  const existing = cutouts ?? [];
  const idx = existing.findIndex((c) => cutoutContainsAngle(c, angleRad));
  if (idx >= 0) {
    return existing.filter((_, i) => i !== idx);
  }
  if (existing.length >= MAX_CUTOUTS_PER_POINT) return existing;
  return [...existing, { angleRad, spanRad: DEFAULT_CUTOUT_SPAN_RAD }];
}

function legGapContainsDistance(
  gap: CourseLegGap,
  distance: number,
): boolean {
  return distance >= gap.distance && distance <= gap.distance + gap.length;
}

export function toggleLegGap(
  gaps: CourseLegGap[] | undefined,
  distance: number,
  length = DEFAULT_LEG_GAP_LENGTH,
): CourseLegGap[] {
  const existing = gaps ?? [];
  const idx = existing.findIndex((g) =>
    legGapContainsDistance(g, distance),
  );
  if (idx >= 0) {
    return existing.filter((_, i) => i !== idx);
  }
  if (existing.length >= MAX_LEG_GAPS_PER_POINT) return existing;
  const centered = Math.max(0, distance - length / 2);
  return [...existing, { distance: centered, length }];
}

export function toggleLineGap(
  gaps: CourseLegGap[] | undefined,
  distance: number,
  length = DEFAULT_LEG_GAP_LENGTH,
): CourseLegGap[] {
  const existing = gaps ?? [];
  const idx = existing.findIndex((g) =>
    legGapContainsDistance(g, distance),
  );
  if (idx >= 0) {
    return existing.filter((_, i) => i !== idx);
  }
  if (existing.length >= MAX_GAPS_PER_LINE) return existing;
  const centered = Math.max(0, distance - length / 2);
  return [...existing, { distance: centered, length }];
}

function geoPointOnCircle(
  center: [number, number],
  radius: number,
  angle: number,
): [number, number] {
  return [
    center[0] + radius * Math.cos(angle),
    center[1] + radius * Math.sin(angle),
  ];
}

type AngleInterval = { start: number; end: number };

function cutoutToIntervals(cutout: CourseCircleCutout): AngleInterval[] {
  const half = (cutout.spanRad ?? DEFAULT_CUTOUT_SPAN_RAD) / 2;
  const start = normalizeAngle(cutout.angleRad - half);
  const end = normalizeAngle(cutout.angleRad + half);
  if (start <= end) return [{ start, end }];
  return [
    { start, end: Math.PI * 2 },
    { start: 0, end },
  ];
}

function mergeIntervals(intervals: AngleInterval[]): AngleInterval[] {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged: AngleInterval[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (cur.start <= last.end + 0.0001) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function visibleArcIntervals(cutouts: CourseCircleCutout[]): AngleInterval[] {
  const forbidden = mergeIntervals(
    cutouts.flatMap((c) => cutoutToIntervals(c)),
  );
  if (forbidden.length === 0) {
    return [{ start: 0, end: Math.PI * 2 }];
  }

  const visible: AngleInterval[] = [];
  let cursor = 0;
  for (const f of forbidden) {
    if (f.start > cursor + 0.001) {
      visible.push({ start: cursor, end: f.start });
    }
    cursor = Math.max(cursor, f.end);
  }
  if (cursor < Math.PI * 2 - 0.001) {
    visible.push({ start: cursor, end: Math.PI * 2 });
  }
  return visible;
}

/** Render control circle as arc polylines with optional cutouts. */
export function renderCircleWithCutoutsSvg(
  centerGeo: [number, number],
  radiusGeo: number,
  cutouts: CourseCircleCutout[] | undefined,
  transform: SvgRootTransform,
  stroke: string,
  strokeW: number,
  opacity: number,
): string {
  if (!cutouts?.length) return "";

  const arcs = visibleArcIntervals(cutouts);
  const segments: string[] = [];

  for (const arc of arcs) {
    const span = arc.end - arc.start;
    if (span < 0.01) continue;
    const steps = Math.max(4, Math.ceil((span / (Math.PI * 2)) * 32));
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = arc.start + (span * i) / steps;
      const geo = geoPointOnCircle(centerGeo, radiusGeo, t);
      const [sx, sy] = geoToSvgUserPoint(geo, transform);
      points.push(`${sx},${sy}`);
    }
    segments.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
    );
  }

  return segments.join("\n");
}

type LineSegment = { x1: number; y1: number; x2: number; y2: number };

/** Split a line in SVG space, removing gap regions measured from the line start. */
export function renderLineSegmentsWithGapsSvg(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gaps: CourseLegGap[] | undefined,
  stroke: string,
  strokeW: number,
  opacity: number,
  dashArray?: string,
): string {
  if (!gaps?.length) {
    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"${dashAttr}/>`;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return "";

  const sorted = gaps
    .slice()
    .sort((a, b) => a.distance - b.distance)
    .map((g) => ({
      start: Math.max(0, g.distance),
      end: Math.min(len, g.distance + g.length),
    }))
    .filter((g) => g.end > g.start);

  const segments: LineSegment[] = [];
  let cursor = 0;
  for (const gap of sorted) {
    if (gap.start > cursor + 0.5) {
      segments.push({
        x1: x1 + (dx * cursor) / len,
        y1: y1 + (dy * cursor) / len,
        x2: x1 + (dx * gap.start) / len,
        y2: y1 + (dy * gap.start) / len,
      });
    }
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < len - 0.5) {
    segments.push({
      x1: x1 + (dx * cursor) / len,
      y1: y1 + (dy * cursor) / len,
      x2: x2,
      y2: y2,
    });
  }

  const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
  return segments
    .map(
      (s) =>
        `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"${dashAttr}/>`,
    )
    .join("\n");
}

/** Map leg gaps (from control center, geo units) onto shortened leg segment. */
export function mapLegGapsToShortenedLine(
  fullLenGeo: number,
  gapStartGeo: number,
  gapEndGeo: number,
  legGaps: CourseLegGap[] | undefined,
): CourseLegGap[] {
  if (!legGaps?.length || fullLenGeo <= 0) return [];
  const visibleStart = gapStartGeo;
  const visibleEnd = fullLenGeo - gapEndGeo;
  const visibleLen = visibleEnd - visibleStart;
  if (visibleLen <= 0) return [];

  return legGaps
    .map((g) => {
      const gapStart = g.distance;
      const gapEnd = g.distance + g.length;
      const clipStart = Math.max(gapStart, visibleStart);
      const clipEnd = Math.min(gapEnd, visibleEnd);
      if (clipEnd <= clipStart) return null;
      return {
        distance: clipStart - visibleStart,
        length: clipEnd - clipStart,
      };
    })
    .filter((g): g is CourseLegGap => g != null && g.length > 0.5);
}

function pointToSegmentParam(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
  );
}

export type CourseLegHit = {
  fromControl: EditorObject | CourseObjectDto;
  toControl: EditorObject | CourseObjectDto;
  /** Distance from start control center along leg (geo units). */
  distanceFromStart: number;
};

export function hitTestCourseLeg(
  geoPoint: [number, number],
  objects: Array<CourseObjectDto | EditorObject>,
  tolerance: number,
): CourseLegHit | null {
  const legPoints = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (o) =>
        o.objectType === CourseObjectType.POINT &&
        o.geometry.type === "Point" &&
        COURSE_LEG_SYMBOLS.has(o.symbolNr),
    );

  let best: { hit: CourseLegHit; dist: number } | null = null;

  for (let i = 0; i < legPoints.length - 1; i++) {
    const a = legPoints[i]!;
    const b = legPoints[i + 1]!;
    if (a.geometry.type !== "Point" || b.geometry.type !== "Point") continue;

    const aCoord = a.geometry.coordinates;
    const bCoord = b.geometry.coordinates;
    const t = pointToSegmentParam(geoPoint, aCoord, bCoord);
    const proj: [number, number] = [
      aCoord[0] + t * (bCoord[0] - aCoord[0]),
      aCoord[1] + t * (bCoord[1] - aCoord[1]),
    ];
    const dist = distance2d(geoPoint, proj);
    if (dist > tolerance) continue;

    const fullLen = distance2d(aCoord, bCoord);
    const distanceFromStart = t * fullLen;
    const gapStart = getPointSymbolLegGap(a.symbolNr);
    const gapEnd = getPointSymbolLegGap(b.symbolNr);
    if (
      distanceFromStart < gapStart + tolerance ||
      distanceFromStart > fullLen - gapEnd - tolerance
    ) {
      continue;
    }

    if (!best || dist < best.dist) {
      best = {
        dist,
        hit: { fromControl: a, toControl: b, distanceFromStart },
      };
    }
  }

  return best?.hit ?? null;
}

export type LineGapHit = {
  object: EditorObject | CourseObjectDto;
  distanceAlongLine: number;
};

export function cumulativeLineDistances(
  coordinates: [number, number][],
): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cum.push(
      cum[i - 1]! + distance2d(coordinates[i - 1]!, coordinates[i]!),
    );
  }
  return cum;
}

export function hitTestManualLineForGap(
  geoPoint: [number, number],
  obj: CourseObjectDto | EditorObject,
  tolerance: number,
): LineGapHit | null {
  if (obj.objectType !== CourseObjectType.LINE) return null;
  if (obj.geometry.type !== "LineString") return null;
  if (obj.symbolNr !== 705 && obj.symbolNr !== 707) return null;

  const coords = obj.geometry.coordinates;
  let bestDist = Infinity;
  let bestDistance = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const t = pointToSegmentParam(geoPoint, a, b);
    const proj: [number, number] = [
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
    ];
    const dist = distance2d(geoPoint, proj);
    if (dist >= bestDist) continue;
    const segLen = distance2d(a, b);
    const cum = cumulativeLineDistances(coords);
    bestDist = dist;
    bestDistance = cum[i]! + t * segLen;
  }

  if (bestDist > tolerance) return null;
  return { object: obj, distanceAlongLine: bestDistance };
}

export function hitTestControlForClip(
  geoPoint: [number, number],
  obj: CourseObjectDto | EditorObject,
  tolerance: number,
): boolean {
  if (obj.objectType !== CourseObjectType.POINT) return false;
  if (obj.geometry.type !== "Point") return false;
  if (!supportsCircleCutouts(obj.symbolNr)) return false;

  const center = obj.geometry.coordinates;
  const r = controlCircleRadiusGeo(obj.symbolNr);
  const dist = distance2d(geoPoint, center);
  return dist <= r + tolerance;
}

export function isPointGeometry(geometry: CourseGeometry): geometry is CoursePointGeometry {
  return geometry.type === "Point";
}

export function getPointCutouts(
  geometry: CoursePointGeometry,
): CourseCircleCutout[] | undefined {
  return geometry.cutouts;
}

export function getPointLegGaps(
  geometry: CoursePointGeometry,
): CourseLegGap[] | undefined {
  return geometry.legGaps;
}

export function getLineGaps(
  geometry: Extract<CourseGeometry, { type: "LineString" }>,
): CourseLegGap[] | undefined {
  return geometry.gaps;
}

/** Render point symbol with circle cutouts (703, 706, 702). */
export function renderPointWithCutoutsSvg(
  symbolNr: number,
  centerGeo: [number, number],
  transform: SvgRootTransform,
  cutouts: CourseCircleCutout[],
  options?: {
    opacity?: number;
    selected?: boolean;
    controlNumber?: number;
    textRotationDeg?: number;
  },
): string {
  const color = getCourseSymbol(symbolNr)?.color ?? IOF_MAGENTA;
  const opacity = options?.opacity ?? 1;
  const strokeW = options?.selected ? IOF_SYMBOL_STROKE * 1.4 : IOF_SYMBOL_STROKE;
  const radius = controlCircleRadiusGeo(symbolNr);
  const [cx, cy] = geoToSvgUserPoint(centerGeo, transform);

  let shape = renderCircleWithCutoutsSvg(
    centerGeo,
    radius,
    cutouts,
    transform,
    color,
    strokeW,
    opacity,
  );

  if (symbolNr === 706) {
    shape += `<circle cx="${cx}" cy="${cy}" r="${IOF_FINISH_INNER_RADIUS}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
  }

  const numberLabel =
    options?.controlNumber != null
      ? renderControlNumberNearPoint(
          cx,
          cy,
          options.controlNumber,
          opacity,
          options.textRotationDeg,
        )
      : "";

  return `${shape}${numberLabel}`;
}
