import type { CourseGeometry, CourseObjectDto, EditorObject } from "./types";
import { CourseObjectType } from "./types";
import { mapUnitsToMeters } from "@/lib/ocad/crs";
import type { ExportFrame } from "@/lib/ocad/map-export";
import { PDF_EXPORT_ROTATION_DEG, rotatePointDeg } from "@/lib/ocad/map-export";
import { geoToSvgUserPoint, type SvgRootTransform } from "@/lib/ocad/svg-coords";
import {
  controlNumberHitTolerance,
  isControlNumberObject,
} from "./control-numbers";
import {
  mapLegGapsToShortenedLine,
  renderLineSegmentsWithGapsSvg,
  renderPointWithCutoutsSvg,
  supportsCircleCutouts,
} from "./cutouts";
import {
  COURSE_LEG_SYMBOLS,
  getPointSymbolLegGap,
  IOF_CONTROL_RADIUS,
  IOF_LINE_WIDTH,
  IOF_MAGENTA,
  mmToOcadUnits,
  renderAreaSymbolSvg,
  renderLineSymbolSvg,
  renderPointSymbolSvg,
  renderTextSymbolSvg,
} from "./symbols";

export function objectCentroid(geometry: CourseGeometry): [number, number] {
  if (geometry.type === "Point") {
    return geometry.coordinates;
  }
  if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    if (coords.length === 0) return [0, 0];
    const mid = Math.floor(coords.length / 2);
    return coords[mid]!;
  }
  const ring = geometry.coordinates[0] ?? [];
  if (ring.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / ring.length, sy / ring.length];
}

/** Axis-aligned geo bbox covering all coordinates in course geometries. */
export function courseObjectsBbox(
  objects: Array<{ geometry: CourseGeometry }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    found = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const obj of objects) {
    const { geometry } = obj;
    if (geometry.type === "Point") {
      include(geometry.coordinates[0], geometry.coordinates[1]);
    } else if (geometry.type === "LineString") {
      for (const [x, y] of geometry.coordinates) include(x, y);
    } else {
      for (const ring of geometry.coordinates) {
        for (const [x, y] of ring) include(x, y);
      }
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

export function translateGeometry(
  geometry: CourseGeometry,
  dx: number,
  dy: number,
): CourseGeometry {
  if (geometry.type === "Point") {
    const [x, y] = geometry.coordinates;
    return {
      ...geometry,
      coordinates: [x + dx, y + dy],
    };
  }
  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(
        ([x, y]) => [x + dx, y + dy] as [number, number],
      ),
    };
  }
  return {
    ...geometry,
    coordinates: [
      geometry.coordinates[0]!.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    ],
  };
}

export function distance2d(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function hitTestObject(
  geoPoint: [number, number],
  obj: CourseObjectDto | EditorObject,
  tolerance: number,
): boolean {
  const { geometry } = obj;
  const tol =
    obj.objectType === CourseObjectType.TEXT && isControlNumberObject(obj as EditorObject)
      ? controlNumberHitTolerance(tolerance)
      : tolerance;

  if (geometry.type === "Point") {
    const pointTol =
      obj.objectType === CourseObjectType.TEXT ? tol * 2 : tol * 2;
    return distance2d(geoPoint, geometry.coordinates) <= pointTol;
  }

  if (geometry.type === "LineString") {
    for (let i = 0; i < geometry.coordinates.length - 1; i++) {
      const a = geometry.coordinates[i]!;
      const b = geometry.coordinates[i + 1]!;
      if (pointToSegmentDistance(geoPoint, a, b) <= tol) return true;
    }
    return false;
  }

  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    const [x, y] = geoPoint;
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (x >= minX - tolerance && x <= maxX + tolerance && y >= minY - tolerance && y <= maxY + tolerance) {
      return true;
    }
  }

  return false;
}

/** First hit in reverse paint order (topmost object). */
export function hitTestTopObject<T extends CourseObjectDto | EditorObject>(
  geoPoint: [number, number],
  objects: T[],
  tolerance: number,
): T | undefined {
  const sorted = objects.slice().sort((a, b) => b.sortOrder - a.sortOrder);
  return sorted.find((o) => hitTestObject(geoPoint, o, tolerance));
}

/** Hit test for delete — skips auto-placed control numbers (704) so controls are reachable. */
export function hitTestTopObjectForDelete<T extends CourseObjectDto | EditorObject>(
  geoPoint: [number, number],
  objects: T[],
  tolerance: number,
): T | undefined {
  const sorted = objects
    .slice()
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .filter((o) => !isControlNumberObject(o as EditorObject));
  return sorted.find((o) => hitTestObject(geoPoint, o, tolerance));
}

/** Sum leg distances start → controls → finish in sortOrder (701/703/706). */
export function computeCourseLengthMeters(
  objects: Array<CourseObjectDto | EditorObject>,
  mapScale = 15000,
): number {
  const legPoints = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (o) =>
        o.objectType === CourseObjectType.POINT &&
        o.geometry.type === "Point" &&
        COURSE_LEG_SYMBOLS.has(o.symbolNr),
    );

  let totalMapUnits = 0;
  for (let i = 0; i < legPoints.length - 1; i++) {
    const a = legPoints[i]!;
    const b = legPoints[i + 1]!;
    if (a.geometry.type !== "Point" || b.geometry.type !== "Point") continue;
    totalMapUnits += distance2d(a.geometry.coordinates, b.geometry.coordinates);
  }

  return mapUnitsToMeters(totalMapUnits, mapScale);
}

export function formatCourseLengthKm(lengthMeters: number): string {
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) return "—";
  const km = lengthMeters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance2d(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance2d(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function geometryToSvgPoints(
  geometry: CourseGeometry,
  transform: SvgRootTransform,
): string {
  const mapPoint = (coord: [number, number]) => {
    const [sx, sy] = geoToSvgUserPoint(coord, transform);
    return `${sx},${sy}`;
  };

  if (geometry.type === "Point") {
    const [sx, sy] = geoToSvgUserPoint(geometry.coordinates, transform);
    return `${sx},${sy}`;
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates.map(mapPoint).join(" ");
  }

  const ring = geometry.coordinates[0] ?? [];
  return ring.map(mapPoint).join(" ");
}

function headingRad(from: [number, number], to: [number, number]): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx === 0 && dy === 0) return -Math.PI / 2;
  return Math.atan2(dx, -dy);
}

function shortenLineSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gapStart: number,
  gapEnd: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= gapStart + gapEnd) return null;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * gapStart,
    y1: y1 + uy * gapStart,
    x2: x2 - ux * gapEnd,
    y2: y2 - uy * gapEnd,
  };
}

export function renderObjectSvg(
  obj: CourseObjectDto | EditorObject,
  transform: SvgRootTransform,
  options?: {
    opacity?: number;
    selected?: boolean;
    controlNumber?: number;
    headingRad?: number;
    textRotationDeg?: number;
    skipText?: boolean;
  },
): string {
  const opacity = options?.opacity ?? 1;
  const { geometry } = obj;

  if (options?.skipText && obj.objectType === "TEXT") {
    return "";
  }

  if (geometry.type === "Point" && obj.objectType !== "TEXT") {
    const centerGeo = geometry.coordinates;
    const [cx, cy] = geoToSvgUserPoint(centerGeo, transform);
    if (
      geometry.cutouts?.length &&
      supportsCircleCutouts(obj.symbolNr)
    ) {
      return renderPointWithCutoutsSvg(
        obj.symbolNr,
        centerGeo,
        transform,
        geometry.cutouts,
        {
          opacity,
          selected: options?.selected,
          controlNumber: options?.skipText ? undefined : options?.controlNumber,
          textRotationDeg: options?.textRotationDeg,
        },
      );
    }
    return renderPointSymbolSvg(obj.symbolNr, cx, cy, {
      opacity,
      selected: options?.selected,
      controlNumber: options?.skipText ? undefined : options?.controlNumber,
      headingRad: options?.headingRad,
      textRotationDeg: options?.textRotationDeg,
    });
  }

  if (geometry.type === "LineString") {
    const [start, end] = [
      geometry.coordinates[0],
      geometry.coordinates[geometry.coordinates.length - 1],
    ];
    if (
      geometry.coordinates.length === 2 &&
      start &&
      end &&
      geometry.gaps?.length
    ) {
      const [x1, y1] = geoToSvgUserPoint(start, transform);
      const [x2, y2] = geoToSvgUserPoint(end, transform);
      const color = IOF_MAGENTA;
      const strokeW = options?.selected ? IOF_LINE_WIDTH * 1.4 : IOF_LINE_WIDTH;
      let dashArray: string | undefined;
      if (obj.symbolNr === 707) {
        dashArray = `${mmToOcadUnits(2)} ${mmToOcadUnits(0.5)}`;
      }
      const geoLen = distance2d(start, end);
      const scaledGaps = geometry.gaps.map((g) => ({
        distance: (g.distance / geoLen) * Math.hypot(x2 - x1, y2 - y1),
        length: (g.length / geoLen) * Math.hypot(x2 - x1, y2 - y1),
      }));
      return renderLineSegmentsWithGapsSvg(
        x1,
        y1,
        x2,
        y2,
        scaledGaps,
        color,
        strokeW,
        opacity,
        dashArray,
      );
    }

    if (geometry.coordinates.length > 2 && geometry.gaps?.length) {
      const cum = cumulativeLineLengths(geometry.coordinates);
      const totalLen = cum[cum.length - 1] ?? 0;
      const color = IOF_MAGENTA;
      const strokeW = options?.selected ? IOF_LINE_WIDTH * 1.4 : IOF_LINE_WIDTH;
      let dashArray: string | undefined;
      if (obj.symbolNr === 707) {
        dashArray = `${mmToOcadUnits(2)} ${mmToOcadUnits(0.5)}`;
      }
      const parts: string[] = [];
      for (let i = 0; i < geometry.coordinates.length - 1; i++) {
        const a = geometry.coordinates[i]!;
        const b = geometry.coordinates[i + 1]!;
        const segStart = cum[i] ?? 0;
        const segLen = (cum[i + 1] ?? 0) - segStart;
        const segGaps = geometry.gaps
          .map((g) => ({
            distance: g.distance - segStart,
            length: g.length,
          }))
          .filter((g) => g.distance + g.length > 0 && g.distance < segLen)
          .map((g) => ({
            distance: Math.max(0, g.distance),
            length: Math.min(g.length, segLen - Math.max(0, g.distance)),
          }));
        const [x1, y1] = geoToSvgUserPoint(a, transform);
        const [x2, y2] = geoToSvgUserPoint(b, transform);
        const geoSegLen = distance2d(a, b);
        const svgSegLen = Math.hypot(x2 - x1, y2 - y1);
        const mappedGaps =
          geoSegLen > 0
            ? segGaps.map((g) => ({
                distance: (g.distance / geoSegLen) * svgSegLen,
                length: (g.length / geoSegLen) * svgSegLen,
              }))
            : [];
        parts.push(
          renderLineSegmentsWithGapsSvg(
            x1,
            y1,
            x2,
            y2,
            mappedGaps,
            color,
            strokeW,
            opacity,
            dashArray,
          ),
        );
      }
      return parts.join("\n");
    }

    const points = geometryToSvgPoints(geometry, transform);
    return renderLineSymbolSvg(obj.symbolNr, points, {
      opacity,
      selected: options?.selected,
    });
  }

  if (geometry.type === "Polygon") {
    const points = geometryToSvgPoints(geometry, transform);
    return renderAreaSymbolSvg(obj.symbolNr, points, {
      opacity,
      selected: options?.selected,
    });
  }

  if (geometry.type === "Point") {
    const [tx, ty] = geoToSvgUserPoint(geometry.coordinates, transform);
    return renderTextSymbolSvg(tx, ty, obj.textContent ?? "", {
      opacity,
      selected: options?.selected,
      symbolNr: obj.symbolNr,
      textRotationDeg: options?.textRotationDeg,
    });
  }

  return "";
}

function cumulativeLineLengths(coordinates: [number, number][]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cum.push(cum[i - 1]! + distance2d(coordinates[i - 1]!, coordinates[i]!));
  }
  return cum;
}

/** Auto-draw magenta legs between sequential start/control/finish points. */
export function renderCourseLegsSvg(
  objects: Array<CourseObjectDto | EditorObject>,
  transform: SvgRootTransform,
  options?: { opacity?: number },
): string {
  const opacity = options?.opacity ?? 1;
  const sorted = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (o) =>
        o.objectType === CourseObjectType.POINT &&
        o.geometry.type === "Point" &&
        COURSE_LEG_SYMBOLS.has(o.symbolNr),
    );

  if (sorted.length < 2) return "";

  const segments: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.geometry.type !== "Point" || b.geometry.type !== "Point") continue;
    const aCoord = a.geometry.coordinates;
    const bCoord = b.geometry.coordinates;
    const fullLenGeo = distance2d(aCoord, bCoord);
    const [x1, y1] = geoToSvgUserPoint(aCoord, transform);
    const [x2, y2] = geoToSvgUserPoint(bCoord, transform);
    const gapStart = getPointSymbolLegGap(a.symbolNr);
    const gapEnd = getPointSymbolLegGap(b.symbolNr);
    const shortened = shortenLineSegment(x1, y1, x2, y2, gapStart, gapEnd);
    if (!shortened) continue;

    const geoShortLen = Math.max(0, fullLenGeo - gapStart - gapEnd);
    const svgShortLen = Math.hypot(
      shortened.x2 - shortened.x1,
      shortened.y2 - shortened.y1,
    );
    const legGapsGeo =
      a.geometry.legGaps && geoShortLen > 0
        ? mapLegGapsToShortenedLine(
            fullLenGeo,
            gapStart,
            gapEnd,
            a.geometry.legGaps,
          )
        : [];
    const svgGaps =
      geoShortLen > 0 && svgShortLen > 0
        ? legGapsGeo.map((g) => ({
            distance: (g.distance / geoShortLen) * svgShortLen,
            length: (g.length / geoShortLen) * svgShortLen,
          }))
        : undefined;

    segments.push(
      renderLineSegmentsWithGapsSvg(
        shortened.x1,
        shortened.y1,
        shortened.x2,
        shortened.y2,
        svgGaps,
        IOF_MAGENTA,
        IOF_LINE_WIDTH,
        opacity,
      ),
    );
  }
  return segments.join("\n");
}

export function renderCourseOverlaySvg(
  objects: Array<CourseObjectDto | EditorObject>,
  transform: SvgRootTransform,
  options?: {
    opacity?: number;
    controlNumbers?: Map<string, number>;
    selectedId?: string | null;
    drawLegs?: boolean;
    textRotationDeg?: number;
    skipText?: boolean;
  },
): string {
  const sorted = objects.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const legPoints = sorted.filter(
    (o) =>
      o.objectType === "POINT" &&
      o.geometry.type === "Point" &&
      COURSE_LEG_SYMBOLS.has(o.symbolNr),
  );

  const legs =
    options?.drawLegs !== false
      ? renderCourseLegsSvg(objects, transform, { opacity: options?.opacity })
      : "";

  const objectMarkup = sorted
    .map((obj) => {
      const id = "clientId" in obj ? obj.clientId : obj.id;
      let heading: number | undefined;
      if (obj.symbolNr === 701 && obj.geometry.type === "Point") {
        const idx = legPoints.findIndex(
          (p) => ("clientId" in p ? p.clientId : p.id) === id,
        );
        const next = legPoints[idx + 1];
        if (next?.geometry.type === "Point") {
          heading = headingRad(obj.geometry.coordinates, next.geometry.coordinates);
        }
      }
      return renderObjectSvg(obj, transform, {
        opacity: options?.opacity,
        selected: options?.selectedId === id,
        controlNumber: options?.controlNumbers?.get(id),
        headingRad: heading,
        textRotationDeg: options?.textRotationDeg,
        skipText: options?.skipText,
      });
    })
    .join("\n");

  return [legs, objectMarkup].filter(Boolean).join("\n");
}

/** Horizontal course text for PDF export — positions rotated with the map, text at 0°. */
export function renderCourseExportTextSvg(
  objects: Array<CourseObjectDto | EditorObject>,
  transform: SvgRootTransform,
  frame: ExportFrame,
  controlNumbers?: Map<string, number>,
): string {
  const { centerX, centerY } = frame;
  const rotationDeg = PDF_EXPORT_ROTATION_DEG;
  const parts: string[] = [];

  for (const obj of objects) {
    if (obj.objectType === "TEXT" && obj.geometry.type === "Point") {
      const [x, y] = geoToSvgUserPoint(obj.geometry.coordinates, transform);
      const [rx, ry] = rotatePointDeg(x, y, rotationDeg, centerX, centerY);
      parts.push(
        renderTextSymbolSvg(rx, ry, obj.textContent ?? "", {
          symbolNr: obj.symbolNr,
          textRotationDeg: 0,
        }),
      );
      continue;
    }

    if (
      obj.objectType === "POINT" &&
      obj.geometry.type === "Point" &&
      controlNumbers
    ) {
      const id = "clientId" in obj ? obj.clientId : obj.id;
      const num = controlNumbers.get(id);
      if (num == null) continue;

      const [cx, cy] = geoToSvgUserPoint(obj.geometry.coordinates, transform);
      const offset = IOF_CONTROL_RADIUS + mmToOcadUnits(0.8);
      const x = cx + offset;
      const y = cy - mmToOcadUnits(0.5);
      const [rx, ry] = rotatePointDeg(x, y, rotationDeg, centerX, centerY);
      parts.push(
        renderTextSymbolSvg(rx, ry, String(num), {
          symbolNr: 704,
          textRotationDeg: 0,
        }),
      );
    }
  }

  return parts.join("\n");
}

export function renumberSortOrder<T extends { sortOrder: number }>(objects: T[]): T[] {
  return objects.map((obj, index) => ({ ...obj, sortOrder: index }));
}

export function computeHitTolerance(viewBoxWidth: number, viewBoxHeight: number): number {
  return Math.max(viewBoxWidth, viewBoxHeight) * 0.015;
}
