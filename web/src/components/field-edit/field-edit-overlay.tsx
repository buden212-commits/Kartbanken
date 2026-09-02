import {
  CheckoutSelectionType,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import type { FieldEditAdd, FieldEditOps } from "@/lib/field-edit/types";
import { resolveObjectCoordinates } from "@/lib/field-edit/types";
import { closedRing, verticesForHandles } from "@/lib/field-edit/vertices";
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
  if (geometry.type === CheckoutSelectionType.BBOX) {
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      [geometry.bbox.minX, geometry.bbox.minY, geometry.bbox.maxX, geometry.bbox.maxY],
      transform,
    );
    return `<polygon points="${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}" fill="rgba(59,130,246,0.08)" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4" pointer-events="none" />`;
  }
  return `<polygon points="${ringToSvgPoints(geometry.ring, transform)}" fill="rgba(59,130,246,0.08)" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4" pointer-events="none" />`;
}

function lineSvg(coords: [number, number][], transform: SvgRootTransform, stroke: string, width = 2): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" pointer-events="none" />`;
}

function areaSvg(ring: [number, number][], transform: SvgRootTransform, fill: string, stroke: string): string {
  const closed = ring.length >= 3 ? ring : ring;
  if (closed.length < 3) return "";
  return `<polygon points="${ringToSvgPoints(closed, transform)}" fill="${fill}" stroke="${stroke}" stroke-width="40" vector-effect="non-scaling-stroke" pointer-events="none" />`;
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
  } = options;

  const parts: string[] = [selectionBoundarySvg(selectionGeometry, transform)];

  for (const obj of objects) {
    const coords = resolveObjectCoordinates(obj.i, obj.v, ops);
    if (!coords) {
      if (obj.t === "line") {
        parts.push(lineSvg(obj.v, transform, "rgba(220,38,38,0.5)", 3));
      } else if (obj.t === "area") {
        parts.push(areaSvg(obj.v, transform, "rgba(220,38,38,0.15)", "#dc2626"));
      }
      const [x, y] = geoToSvgUserPoint(obj.c, transform);
      parts.push(
        `<g pointer-events="none"><line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /><line x1="${x + 8}" y1="${y - 8}" x2="${x - 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /></g>`,
      );
      continue;
    }

    const isSelected = selectedObjectIndex === obj.i;
    if (obj.t === "line") {
      parts.push(
        lineSvg(
          coords,
          transform,
          isSelected ? "#2563eb" : "rgba(37,99,235,0.35)",
          isSelected ? 3 : 2,
        ),
      );
    } else if (obj.t === "area") {
      parts.push(
        areaSvg(
          closedRing(coords),
          transform,
          isSelected ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.08)",
          isSelected ? "#2563eb" : "#93c5fd",
        ),
      );
    } else {
      const [x, y] = geoToSvgUserPoint(coords[0] ?? obj.c, transform);
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${isSelected ? 8 : 5}" fill="${isSelected ? "rgba(37,99,235,0.35)" : "rgba(148,163,184,0.2)"}" stroke="${isSelected ? "#2563eb" : "#94a3b8"}" stroke-width="2" pointer-events="none" />`,
      );
    }

    if (isSelected && coords.length > 0) {
      const handleCoords = obj.t === "area" ? verticesForHandles(coords, obj.t) : coords;
      parts.push(vertexHandlesSvg(handleCoords, transform, selectedVertexIndex));
    }
  }

  for (const add of ops.adds) {
    parts.push(renderAddSvg(add, transform));
  }

  if (draftKind === "line" && draftPoints.length >= 1) {
    parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }
  if (draftKind === "area" && draftPoints.length >= 1) {
    if (draftPoints.length >= 3) {
      parts.push(areaSvg(draftPoints, transform, "rgba(34,197,94,0.15)", "#16a34a"));
    } else {
      parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    }
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }

  if (gpsLivePoints.length >= 1) {
    parts.push(lineSvg(gpsLivePoints, transform, "#16a34a", 3));
    parts.push(vertexHandlesSvg(gpsLivePoints, transform, null, 80));
  }

  return parts.join("");
}

function renderAddSvg(add: FieldEditAdd, transform: SvgRootTransform): string {
  switch (add.kind) {
    case "point": {
      const [x, y] = geoToSvgUserPoint([add.x, add.y], transform);
      return `<circle cx="${x}" cy="${y}" r="7" fill="rgba(34,197,94,0.35)" stroke="#16a34a" stroke-width="2" pointer-events="none" />`;
    }
    case "line":
      return lineSvg(add.coordinates, transform, "#16a34a", 2);
    case "area":
      return areaSvg(add.ring, transform, "rgba(34,197,94,0.2)", "#16a34a");
  }
}
