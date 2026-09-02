import {
  CheckoutSelectionType,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { verticesForHandles } from "@/lib/field-edit/vertices";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

function ringToSvgPoints(ring: [number, number][], transform: SvgRootTransform): string {
  return ring
    .map(([x, y]) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], transform);
      return `${sx},${sy}`;
    })
    .join(" ");
}

export function selectionBoundarySvg(
  geometry: CheckoutSelectionGeometry,
  transform: SvgRootTransform,
): string {
  const strokeAttrs =
    'fill="none" stroke="#dc2626" stroke-width="40" vector-effect="non-scaling-stroke" pointer-events="none"';
  if (geometry.type === CheckoutSelectionType.BBOX) {
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      [geometry.bbox.minX, geometry.bbox.minY, geometry.bbox.maxX, geometry.bbox.maxY],
      transform,
    );
    return `<polygon points="${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}" ${strokeAttrs} />`;
  }
  return `<polygon points="${ringToSvgPoints(geometry.ring, transform)}" ${strokeAttrs} />`;
}

function lineSvg(coords: [number, number][], transform: SvgRootTransform, stroke: string, width = 2): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" pointer-events="none" />`;
}

function maskLineSvg(coords: [number, number][], transform: SvgRootTransform): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="120" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pointer-events="none" />`;
}

function maskAreaSvg(ring: [number, number][], transform: SvgRootTransform): string {
  if (ring.length < 3) return "";
  return `<polygon points="${ringToSvgPoints(ring, transform)}" fill="#ffffff" stroke="#ffffff" stroke-width="40" vector-effect="non-scaling-stroke" pointer-events="none" />`;
}

function maskPointSvg(point: [number, number], transform: SvgRootTransform): string {
  const [x, y] = geoToSvgUserPoint(point, transform);
  return `<circle cx="${x}" cy="${y}" r="80" fill="#ffffff" stroke="#ffffff" stroke-width="20" vector-effect="non-scaling-stroke" pointer-events="none" />`;
}

function vertexHandlesSvg(
  coords: [number, number][],
  transform: SvgRootTransform,
  selectedVertex: number | null,
  handleRadius = 120,
): string {
  return coords
    .map(([x, y], index) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], transform);
      const fill = selectedVertex === index ? "#2563eb" : "#ffffff";
      const stroke = selectedVertex === index ? "#1d4ed8" : "#64748b";
      const r = selectedVertex === index ? handleRadius * 1.15 : handleRadius;
      return `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="40" vector-effect="non-scaling-stroke" pointer-events="none" />`;
    })
    .join("");
}

function deleteMarkerSvg(centroid: [number, number], transform: SvgRootTransform): string {
  const [x, y] = geoToSvgUserPoint(centroid, transform);
  return `<g pointer-events="none"><line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /><line x1="${x + 8}" y1="${y - 8}" x2="${x - 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /></g>`;
}

function maskObjectSvg(obj: FieldEditObjectEntry, transform: SvgRootTransform): string {
  if (obj.t === "line") return maskLineSvg(obj.v, transform);
  if (obj.t === "area") return maskAreaSvg(obj.v, transform);
  return maskPointSvg(obj.c, transform);
}

export function fieldEditOverlaySvg(options: {
  transform: SvgRootTransform;
  selectionGeometry: CheckoutSelectionGeometry;
  objects: FieldEditObjectEntry[];
  ops: FieldEditOps;
  selectedObjectIndex: number | null;
  selectedVertexIndex: number | null;
  draftPoints: [number, number][];
  draftKind: "line" | "area" | null;
  gpsLivePoints?: [number, number][];
  symbolPreviewInner?: string;
  maskedObjectIndices?: number[];
  draftHasSymbolPreview?: boolean;
}): string {
  const {
    transform,
    selectionGeometry,
    objects,
    ops,
    selectedObjectIndex,
    selectedVertexIndex,
    draftPoints,
    draftKind,
    gpsLivePoints = [],
    symbolPreviewInner = "",
    maskedObjectIndices = [],
    draftHasSymbolPreview = false,
  } = options;

  const masked = new Set(maskedObjectIndices);
  const parts: string[] = [selectionBoundarySvg(selectionGeometry, transform)];

  for (const obj of objects) {
    if (!masked.has(obj.i)) continue;
    parts.push(maskObjectSvg(obj, transform));
    if (ops.deletes.includes(obj.i)) {
      parts.push(deleteMarkerSvg(obj.c, transform));
    }
  }

  if (symbolPreviewInner) {
    parts.push(`<g pointer-events="none">${symbolPreviewInner}</g>`);
  }

  for (const obj of objects) {
    if (masked.has(obj.i)) continue;
    if (selectedObjectIndex !== obj.i) continue;
    const coords = obj.v;
    if (coords.length === 0) continue;
    const handleCoords = obj.t === "area" ? verticesForHandles(coords, obj.t) : coords;
    parts.push(vertexHandlesSvg(handleCoords, transform, selectedVertexIndex));
  }

  for (const modify of ops.modifies) {
    if (selectedObjectIndex !== modify.objectIndex) continue;
    const handleCoords =
      modify.geometryKind === "area"
        ? verticesForHandles(modify.coordinates, "area")
        : modify.coordinates;
    parts.push(vertexHandlesSvg(handleCoords, transform, selectedVertexIndex));
  }

  if (!draftHasSymbolPreview && draftKind === "line" && draftPoints.length >= 1) {
    parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }
  if (!draftHasSymbolPreview && draftKind === "area" && draftPoints.length >= 1) {
    if (draftPoints.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(draftPoints, transform)}" fill="rgba(34,197,94,0.15)" stroke="#16a34a" stroke-width="2" pointer-events="none" />`,
      );
    } else {
      parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    }
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  } else if (draftHasSymbolPreview && draftPoints.length >= 1) {
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }

  if (gpsLivePoints.length >= 1 && !draftHasSymbolPreview) {
    parts.push(lineSvg(gpsLivePoints, transform, "#16a34a", 3));
    parts.push(vertexHandlesSvg(gpsLivePoints, transform, null, 80));
  }

  return parts.join("");
}
