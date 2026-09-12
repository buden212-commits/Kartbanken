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
  IOF_START_TRIANGLE_SIDE,
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

const CUTOUT_SYMBOL_NRS = new Set([701, 702, 703, 706]);

export function supportsPointCutouts(symbolNr: number): boolean {
  return CUTOUT_SYMBOL_NRS.has(symbolNr);
}

/** @deprecated use supportsPointCutouts */
export function supportsCircleCutouts(symbolNr: number): boolean {
  return supportsPointCutouts(symbolNr) && symbolNr !== 701;
}

export function controlClipRadiusGeo(symbolNr: number): number {
  switch (symbolNr) {
    case 701:
      return (IOF_START_TRIANGLE_SIDE * Math.sqrt(3)) / 3;
    case 702:
      return IOF_MAP_ISSUE_RADIUS;
    case 706:
      return IOF_FINISH_OUTER_RADIUS;
    default:
      return IOF_CONTROL_RADIUS;
  }
}

export function controlCircleRadiusGeo(symbolNr: number): number {
  return controlClipRadiusGeo(symbolNr);
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

/** Map incoming leg gaps (distance from end control toward start) onto shortened segment. */
export function mapIncomingLegGapsToShortenedLine(
  fullLenGeo: number,
  gapStartGeo: number,
  gapEndGeo: number,
  incomingLegGaps: CourseLegGap[] | undefined,
): CourseLegGap[] {
  if (!incomingLegGaps?.length || fullLenGeo <= 0) return [];
  const visibleStart = gapStartGeo;
  const visibleEnd = fullLenGeo - gapEndGeo;
  const visibleLen = visibleEnd - visibleStart;
  if (visibleLen <= 0) return [];

  return incomingLegGaps
    .map((g) => {
      const gapEndFromA = fullLenGeo - g.distance;
      const gapStartFromA = gapEndFromA - g.length;
      const clipStart = Math.max(gapStartFromA, visibleStart);
      const clipEnd = Math.min(gapEndFromA, visibleEnd);
      if (clipEnd <= clipStart) return null;
      return {
        distance: clipStart - visibleStart,
        length: clipEnd - clipStart,
      };
    })
    .filter((g): g is CourseLegGap => g != null && g.length > 0.5);
}

export function mergeLegGapsForRender(
  outgoing: CourseLegGap[],
  incoming: CourseLegGap[],
): CourseLegGap[] {
  return [...outgoing, ...incoming].sort((a, b) => a.distance - b.distance);
}

function startTriangleVerticesGeo(
  center: [number, number],
  headingRad: number,
): [[number, number], [number, number], [number, number]] {
  const side = IOF_START_TRIANGLE_SIDE;
  const h = (Math.sqrt(3) / 2) * side;
  const cos = Math.cos(headingRad);
  const sin = Math.sin(headingRad);
  const rotate = (px: number, py: number): [number, number] => {
    const dx = px;
    const dy = py;
    return [
      center[0] + dx * cos - dy * sin,
      center[1] + dx * sin + dy * cos,
    ];
  };
  const tip = rotate(0, h * (2 / 3));
  const baseL = rotate(-side / 2, -h / 3);
  const baseR = rotate(side / 2, -h / 3);
  return [tip, baseL, baseR];
}

function edgeMidAngle(
  center: [number, number],
  v0: [number, number],
  v1: [number, number],
): number {
  return angleFromCenter(center, [
    (v0[0] + v1[0]) / 2,
    (v0[1] + v1[1]) / 2,
  ]);
}

/** Render 701 start triangle with edge cutouts. */
export function renderStartTriangleWithCutoutsSvg(
  centerGeo: [number, number],
  headingRad: number,
  cutouts: CourseCircleCutout[],
  transform: SvgRootTransform,
  stroke: string,
  strokeW: number,
  opacity: number,
): string {
  const [tip, baseL, baseR] = startTriangleVerticesGeo(centerGeo, headingRad);
  const edges: [[number, number], [number, number]][] = [
    [tip, baseL],
    [baseL, baseR],
    [baseR, tip],
  ];

  const edgeCutoutIndex = new Set<number>();
  for (const cutout of cutouts) {
    let bestEdge = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < edges.length; i++) {
      const [v0, v1] = edges[i]!;
      const midAngle = edgeMidAngle(centerGeo, v0, v1);
      let diff = Math.abs(normalizeAngle(midAngle - cutout.angleRad));
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestEdge = i;
      }
    }
    edgeCutoutIndex.add(bestEdge);
  }

  const parts: string[] = [];
  for (let i = 0; i < edges.length; i++) {
    const [v0, v1] = edges[i]!;
    const edgeCutouts = cutouts.filter((c) => {
      const midAngle = edgeMidAngle(centerGeo, v0, v1);
      let diff = Math.abs(normalizeAngle(midAngle - c.angleRad));
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      return diff <= (c.spanRad ?? DEFAULT_CUTOUT_SPAN_RAD) / 2 + 0.3;
    });

    if (edgeCutouts.length === 0) {
      const [sx0, sy0] = geoToSvgUserPoint(v0, transform);
      const [sx1, sy1] = geoToSvgUserPoint(v1, transform);
      parts.push(
        `<line x1="${sx0}" y1="${sy0}" x2="${sx1}" y2="${sy1}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
      );
      continue;
    }

    const edgeLen = distance2d(v0, v1);
    const gaps = edgeCutouts.map((c) => {
      const midAngle = edgeMidAngle(centerGeo, v0, v1);
      const span = (c.spanRad ?? DEFAULT_CUTOUT_SPAN_RAD) * 0.4;
      const t = 0.5 + (normalizeAngle(c.angleRad - midAngle) / Math.PI) * 0.25;
      const center = Math.max(0, Math.min(edgeLen, t * edgeLen));
      return {
        distance: Math.max(0, center - (span * edgeLen) / 2),
        length: span * edgeLen,
      };
    });

    const [sx0, sy0] = geoToSvgUserPoint(v0, transform);
    const [sx1, sy1] = geoToSvgUserPoint(v1, transform);
    parts.push(
      renderLineSegmentsWithGapsSvg(
        sx0,
        sy0,
        sx1,
        sy1,
        gaps,
        stroke,
        strokeW,
        opacity,
      ),
    );
  }

  return parts.join("\n");
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
  /** Full leg length in geo units. */
  fullLen: number;
  /** Click was closer to the end control — store on incomingLegGaps. */
  atEndControl: boolean;
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
        hit: {
          fromControl: a,
          toControl: b,
          distanceFromStart,
          fullLen,
          atEndControl: distanceFromStart > fullLen / 2,
        },
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
  if (!supportsPointCutouts(obj.symbolNr)) return false;

  const center = obj.geometry.coordinates;
  const r = controlClipRadiusGeo(obj.symbolNr);
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

export type CutoutMarkerHit = {
  kind: "cutout" | "leg-out" | "leg-in" | "line-gap";
  objectId: string;
  index: number;
};

export function renderCutoutMarkersSvg(
  objects: Array<CourseObjectDto | EditorObject>,
  transform: SvgRootTransform,
  options?: { selectedId?: string | null; showAll?: boolean },
): string {
  const selectedId = options?.selectedId;
  const showAll = options?.showAll ?? false;
  const markers: string[] = [];
  const markerR = IOF_SYMBOL_STROKE * 1.2;
  const color = "#0d9488";

  const sorted = objects.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const legPoints = sorted.filter(
    (o) =>
      o.objectType === CourseObjectType.POINT &&
      o.geometry.type === "Point" &&
      COURSE_LEG_SYMBOLS.has(o.symbolNr),
  );

  for (const obj of sorted) {
    const id = "clientId" in obj ? obj.clientId : obj.id;
    const isSelected = selectedId === id;
    if (obj.geometry.type !== "Point" || obj.objectType !== CourseObjectType.POINT) {
      if (obj.geometry.type === "LineString" && obj.geometry.gaps?.length) {
        const coords = obj.geometry.coordinates;
        const cum = cumulativeLineDistances(coords);
        obj.geometry.gaps.forEach((g, index) => {
          if (!isSelected && selectedId && !showAll) return;
          const target = g.distance + g.length / 2;
          let acc = 0;
          for (let i = 0; i < coords.length - 1; i++) {
            const segLen = distance2d(coords[i]!, coords[i + 1]!);
            if (acc + segLen >= target) {
              const t = (target - acc) / segLen;
              const geo: [number, number] = [
                coords[i]![0] + t * (coords[i + 1]![0] - coords[i]![0]),
                coords[i]![1] + t * (coords[i + 1]![1] - coords[i]![1]),
              ];
              const [sx, sy] = geoToSvgUserPoint(geo, transform);
              markers.push(
                `<circle cx="${sx}" cy="${sy}" r="${markerR}" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="${markerR * 0.3}"/>`,
              );
              break;
            }
            acc += segLen;
          }
        });
      }
      continue;
    }

    const geo = obj.geometry;
    if (!isSelected && selectedId && !showAll) continue;

    geo.cutouts?.forEach((cutout) => {
      const r = controlClipRadiusGeo(obj.symbolNr);
      const pt = geoPointOnCircle(
        geo.coordinates,
        r,
        cutout.angleRad,
      );
      const [sx, sy] = geoToSvgUserPoint(pt, transform);
      markers.push(
        `<circle cx="${sx}" cy="${sy}" r="${markerR}" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="${markerR * 0.3}"/>`,
      );
    });

    const legIdx = legPoints.findIndex(
      (p) => ("clientId" in p ? p.clientId : p.id) === id,
    );
    const next = legPoints[legIdx + 1];
    if (next?.geometry.type === "Point" && geo.legGaps?.length) {
      const a = geo.coordinates;
      const b = next.geometry.coordinates;
      const fullLen = distance2d(a, b);
      for (const g of geo.legGaps) {
        const t = fullLen > 0 ? (g.distance + g.length / 2) / fullLen : 0;
        const pt: [number, number] = [
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
        ];
        const [sx, sy] = geoToSvgUserPoint(pt, transform);
        markers.push(
          `<circle cx="${sx}" cy="${sy}" r="${markerR}" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="${markerR * 0.3}"/>`,
        );
      }
    }

    const prev = legPoints[legIdx - 1];
    if (prev?.geometry.type === "Point" && geo.incomingLegGaps?.length) {
      const a = prev.geometry.coordinates;
      const b = geo.coordinates;
      const fullLen = distance2d(a, b);
      for (const g of geo.incomingLegGaps) {
        const fromA = fullLen - g.distance - g.length / 2;
        const t = fullLen > 0 ? fromA / fullLen : 0;
        const pt: [number, number] = [
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
        ];
        const [sx, sy] = geoToSvgUserPoint(pt, transform);
        markers.push(
          `<circle cx="${sx}" cy="${sy}" r="${markerR}" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="${markerR * 0.3}"/>`,
        );
      }
    }
  }

  return markers.join("\n");
}

export function hitTestCutoutMarker(
  geoPoint: [number, number],
  objects: Array<CourseObjectDto | EditorObject>,
  tolerance: number,
): CutoutMarkerHit | null {
  let bestHit: CutoutMarkerHit | null = null;
  let bestDist = Infinity;

  const tryMarker = (dist: number, hit: CutoutMarkerHit) => {
    if (dist <= tolerance && dist < bestDist) {
      bestDist = dist;
      bestHit = hit;
    }
  };

  const sorted = objects.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const legPoints = sorted.filter(
    (o) =>
      o.objectType === CourseObjectType.POINT &&
      o.geometry.type === "Point" &&
      COURSE_LEG_SYMBOLS.has(o.symbolNr),
  );

  for (const obj of sorted) {
    const id = "clientId" in obj ? obj.clientId : obj.id;
    if (obj.geometry.type === "Point" && obj.objectType === CourseObjectType.POINT) {
      const geo = obj.geometry;
      geo.cutouts?.forEach((cutout, index) => {
        const pt = geoPointOnCircle(
          geo.coordinates,
          controlClipRadiusGeo(obj.symbolNr),
          cutout.angleRad,
        );
        tryMarker(distance2d(geoPoint, pt), { kind: "cutout", objectId: id, index });
      });

      const legIdx = legPoints.findIndex(
        (p) => ("clientId" in p ? p.clientId : p.id) === id,
      );
      const next = legPoints[legIdx + 1];
      if (next?.geometry.type === "Point") {
        const a = geo.coordinates;
        const b = next.geometry.coordinates;
        const fullLen = distance2d(a, b);
        geo.legGaps?.forEach((g, index) => {
          const t = fullLen > 0 ? (g.distance + g.length / 2) / fullLen : 0;
          const pt: [number, number] = [
            a[0] + t * (b[0] - a[0]),
            a[1] + t * (b[1] - a[1]),
          ];
          tryMarker(distance2d(geoPoint, pt), {
            kind: "leg-out",
            objectId: id,
            index,
          });
        });
      }

      const prev = legPoints[legIdx - 1];
      if (prev?.geometry.type === "Point") {
        const a = prev.geometry.coordinates;
        const b = geo.coordinates;
        const fullLen = distance2d(a, b);
        geo.incomingLegGaps?.forEach((g, index) => {
          const fromA = fullLen - g.distance - g.length / 2;
          const t = fullLen > 0 ? fromA / fullLen : 0;
          const pt: [number, number] = [
            a[0] + t * (b[0] - a[0]),
            a[1] + t * (b[1] - a[1]),
          ];
          tryMarker(distance2d(geoPoint, pt), {
            kind: "leg-in",
            objectId: id,
            index,
          });
        });
      }
    }

    if (obj.geometry.type === "LineString" && obj.geometry.gaps?.length) {
      const coords = obj.geometry.coordinates;
      const cum = cumulativeLineDistances(coords);
      obj.geometry.gaps.forEach((g, index) => {
        const target = g.distance + g.length / 2;
        let acc = 0;
        for (let i = 0; i < coords.length - 1; i++) {
          const segLen = distance2d(coords[i]!, coords[i + 1]!);
          if (acc + segLen >= target) {
            const t = (target - acc) / segLen;
            const pt: [number, number] = [
              coords[i]![0] + t * (coords[i + 1]![0] - coords[i]![0]),
              coords[i]![1] + t * (coords[i + 1]![1] - coords[i]![1]),
            ];
            tryMarker(distance2d(geoPoint, pt), {
              kind: "line-gap",
              objectId: id,
              index,
            });
            break;
          }
          acc += segLen;
        }
      });
    }
  }

  return bestHit;
}

export function applyClipMarkerDrag(
  objects: EditorObject[],
  drag: CutoutMarkerHit,
  geo: [number, number],
): EditorObject[] {
  const legPoints = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (o) =>
        o.objectType === CourseObjectType.POINT &&
        o.geometry.type === "Point" &&
        COURSE_LEG_SYMBOLS.has(o.symbolNr),
    );

  return objects.map((obj) => {
    if (obj.clientId !== drag.objectId) return obj;

    if (drag.kind === "cutout" && obj.geometry.type === "Point") {
      const pointGeo = obj.geometry;
      const cutouts = [...(pointGeo.cutouts ?? [])];
      const existing = cutouts[drag.index];
      if (!existing) return obj;
      cutouts[drag.index] = {
        ...existing,
        angleRad: angleFromCenter(pointGeo.coordinates, geo),
      };
      return {
        ...obj,
        geometry: { ...pointGeo, cutouts },
      };
    }

    if (drag.kind === "leg-out" && obj.geometry.type === "Point") {
      const pointGeo = obj.geometry;
      const legGaps = [...(pointGeo.legGaps ?? [])];
      const existing = legGaps[drag.index];
      if (!existing) return obj;
      const legIdx = legPoints.findIndex((p) => p.clientId === obj.clientId);
      const next = legPoints[legIdx + 1];
      if (!next || next.geometry.type !== "Point") return obj;
      const a = pointGeo.coordinates;
      const b = next.geometry.coordinates;
      const fullLen = distance2d(a, b);
      const t =
        fullLen > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((geo[0] - a[0]) * (b[0] - a[0]) +
                  (geo[1] - a[1]) * (b[1] - a[1])) /
                  (fullLen * fullLen),
              ),
            )
          : 0;
      legGaps[drag.index] = {
        distance: Math.max(0, t * fullLen - existing.length / 2),
        length: existing.length,
      };
      return {
        ...obj,
        geometry: { ...pointGeo, legGaps },
      };
    }

    if (drag.kind === "leg-in" && obj.geometry.type === "Point") {
      const pointGeo = obj.geometry;
      const incomingLegGaps = [...(pointGeo.incomingLegGaps ?? [])];
      const existing = incomingLegGaps[drag.index];
      if (!existing) return obj;
      const legIdx = legPoints.findIndex((p) => p.clientId === obj.clientId);
      const prev = legPoints[legIdx - 1];
      if (!prev || prev.geometry.type !== "Point") return obj;
      const a = prev.geometry.coordinates;
      const b = pointGeo.coordinates;
      const fullLen = distance2d(a, b);
      const t =
        fullLen > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((geo[0] - a[0]) * (b[0] - a[0]) +
                  (geo[1] - a[1]) * (b[1] - a[1])) /
                  (fullLen * fullLen),
              ),
            )
          : 0;
      const distFromEnd = fullLen - t * fullLen;
      incomingLegGaps[drag.index] = {
        distance: Math.max(0, distFromEnd - existing.length / 2),
        length: existing.length,
      };
      return {
        ...obj,
        geometry: { ...pointGeo, incomingLegGaps },
      };
    }

    if (drag.kind === "line-gap" && obj.geometry.type === "LineString") {
      const lineGeo = obj.geometry;
      const gaps = [...(lineGeo.gaps ?? [])];
      const existing = gaps[drag.index];
      if (!existing) return obj;
      const coords = lineGeo.coordinates;
      let bestDist = 0;
      let bestSeg = 0;
      let bestT = 0;
      let bestProjDist = Infinity;
      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i]!;
        const b = coords[i + 1]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;
        const t =
          lenSq > 0
            ? Math.max(
                0,
                Math.min(1, ((geo[0] - a[0]) * dx + (geo[1] - a[1]) * dy) / lenSq),
              )
            : 0;
        const proj: [number, number] = [a[0] + t * dx, a[1] + t * dy];
        const d = distance2d(geo, proj);
        if (d < bestProjDist) {
          bestProjDist = d;
          bestSeg = i;
          bestT = t;
        }
      }
      const cum = cumulativeLineDistances(coords);
      const segLen = distance2d(coords[bestSeg]!, coords[bestSeg + 1]!);
      bestDist = cum[bestSeg]! + bestT * segLen;
      gaps[drag.index] = {
        distance: Math.max(0, bestDist - existing.length / 2),
        length: existing.length,
      };
      return {
        ...obj,
        geometry: { ...lineGeo, gaps },
      };
    }

    return obj;
  });
}
