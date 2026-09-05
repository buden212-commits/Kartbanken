import {
  CheckoutSelectionType,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import type { BezierSegmentControls } from "@/lib/field-edit/geometry-tools";
import { sampleBezierPolyline } from "@/lib/field-edit/geometry-tools";
import type { SnapResult } from "@/lib/field-edit/snap";
import {
  resolveSyntheticAddVertexKinds,
  syntheticAddObjectId,
  type FieldEditObjectEntry,
} from "@/lib/field-edit/object-index";
import type { FieldEditOps, FieldEditVertexKind } from "@/lib/field-edit/types";
import { resolveObjectCoordinates, resolveObjectVertexKinds } from "@/lib/field-edit/types";
import { verticesForHandles } from "@/lib/field-edit/vertices";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

/** Screen pixels (non-scaling-stroke) for checkout boundary outline. */
const SELECTION_BOUNDARY_STROKE_PX = 2;
/** SVG user units — vertex/draft handle size (geo-scaled). */
const HANDLE_SIZE = 6;
const GPS_HANDLE_SIZE = 5;
/** Screen pixels (non-scaling-stroke) for handle outline. */
const HANDLE_STROKE_PX = 1.5;
const HANDLE_OPACITY = 0.5;
/** Bézier control handles (P1/P2) — distinct from breakpoints. */
const CONTROL_SIZE = 8;
const CONTROL_OPACITY = 0.85;

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
    `fill="none" stroke="#dc2626" stroke-width="${SELECTION_BOUNDARY_STROKE_PX}" vector-effect="non-scaling-stroke" pointer-events="none"`;
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

function dashedLineSvg(
  coords: [number, number][],
  transform: SvgRootTransform,
  stroke: string,
  width = 2,
): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="6 4" pointer-events="none" />`;
}

function maskLineSvg(coords: [number, number][], transform: SvgRootTransform): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  // Map-unit stroke — covers symbol width without a screen-pixel blob at high zoom.
  return `<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" pointer-events="none" />`;
}

function maskAreaSvg(ring: [number, number][], transform: SvgRootTransform): string {
  if (ring.length < 3) return "";
  return `<polygon points="${ringToSvgPoints(ring, transform)}" fill="#ffffff" stroke="#ffffff" stroke-width="20" pointer-events="none" />`;
}

function maskPointSvg(point: [number, number], transform: SvgRootTransform): string {
  const [x, y] = geoToSvgUserPoint(point, transform);
  return `<circle cx="${x}" cy="${y}" r="30" fill="#ffffff" stroke="#ffffff" stroke-width="8" pointer-events="none" />`;
}

function vertexRole(
  index: number,
  count: number,
): "first" | "last" | "middle" {
  if (count <= 1) return "middle";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

function singleVertexHandleSvg(
  sx: number,
  sy: number,
  role: "first" | "last" | "middle",
  kind: FieldEditVertexKind,
  selected: boolean,
  handleSize: number,
): string {
  const fill = selected ? "#2563eb" : "#ffffff";
  const stroke = selected ? "#1d4ed8" : "#64748b";
  const size = selected ? handleSize * 1.15 : handleSize;
  const common =
    `fill="${fill}" fill-opacity="${HANDLE_OPACITY}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" vector-effect="non-scaling-stroke" pointer-events="none"`;

  // OCAD: dash = diamond, corner = square; otherwise keep role markers (X / square / circle).
  if (kind === "dash") {
    return `<polygon points="${sx},${sy - size} ${sx + size},${sy} ${sx},${sy + size} ${sx - size},${sy}" ${common} />`;
  }
  if (kind === "corner") {
    return `<rect x="${sx - size}" y="${sy - size}" width="${size * 2}" height="${size * 2}" ${common} />`;
  }

  if (role === "first") {
    const arm = size;
    return `<g pointer-events="none">
      <line x1="${sx - arm}" y1="${sy - arm}" x2="${sx + arm}" y2="${sy + arm}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX * 1.4}" vector-effect="non-scaling-stroke" />
      <line x1="${sx + arm}" y1="${sy - arm}" x2="${sx - arm}" y2="${sy + arm}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX * 1.4}" vector-effect="non-scaling-stroke" />
    </g>`;
  }

  if (role === "last") {
    return `<rect x="${sx - size}" y="${sy - size}" width="${size * 2}" height="${size * 2}" ${common} />`;
  }

  return `<circle cx="${sx}" cy="${sy}" r="${size}" ${common} />`;
}

function vertexHandlesSvg(
  coords: [number, number][],
  transform: SvgRootTransform,
  selectedVertex: number | null,
  handleSize = HANDLE_SIZE,
  kinds?: FieldEditVertexKind[],
): string {
  return coords
    .map(([x, y], index) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], transform);
      const role = vertexRole(index, coords.length);
      const kind = kinds?.[index] ?? "normal";
      return singleVertexHandleSvg(sx, sy, role, kind, selectedVertex === index, handleSize);
    })
    .join("");
}

function bezierEditSvg(
  anchors: [number, number][],
  controls: BezierSegmentControls[],
  closed: boolean,
  transform: SvgRootTransform,
  selectedVertex: number | null,
): string {
  if (anchors.length < 2 || controls.length === 0) return "";

  const sampled = sampleBezierPolyline(anchors, controls, closed, 12);
  const parts: string[] = [];
  if (sampled.length >= 2) {
    parts.push(lineSvg(sampled, transform, "#ea580c", 2.5));
  }

  const n = anchors.length;
  for (let i = 0; i < controls.length; i++) {
    const p0 = anchors[i]!;
    const p3 = anchors[(i + 1) % n]!;
    const { p1, p2 } = controls[i]!;
    const [x0, y0] = geoToSvgUserPoint(p0, transform);
    const [x1, y1] = geoToSvgUserPoint(p1, transform);
    const [x2, y2] = geoToSvgUserPoint(p2, transform);
    const [x3, y3] = geoToSvgUserPoint(p3, transform);
    const guide =
      `stroke="#ea580c" stroke-opacity="0.55" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" fill="none" pointer-events="none"`;
    parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" ${guide} />`);
    parts.push(`<line x1="${x3}" y1="${y3}" x2="${x2}" y2="${y2}" ${guide} />`);

    for (const [cx, cy] of [
      [x1, y1],
      [x2, y2],
    ] as const) {
      const s = CONTROL_SIZE;
      parts.push(
        `<polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="#ea580c" fill-opacity="${CONTROL_OPACITY}" stroke="#9a3412" stroke-opacity="${CONTROL_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    }
  }

  parts.push(vertexHandlesSvg(anchors, transform, selectedVertex));
  return parts.join("");
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

function snapIndicatorSvg(snap: SnapResult, transform: SvgRootTransform): string {
  const [x, y] = geoToSvgUserPoint(snap.point, transform);
  const color = snap.kind === "vertex" ? "#2563eb" : snap.kind === "segment" ? "#7c3aed" : "#0891b2";
  return `<g pointer-events="none">
    <circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
    <line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
    <line x1="${x}" y1="${y - 10}" x2="${x}" y2="${y + 10}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
  </g>`;
}

export type BezierEditOverlay = {
  anchors: [number, number][];
  controls: BezierSegmentControls[];
  closed: boolean;
};

export type BezierDrawOverlay = {
  anchors: [number, number][];
  controls: BezierSegmentControls[];
  /** Live segment while gesturing (guides + preview curve). */
  live?: {
    p0: [number, number];
    p1: [number, number];
    p2?: [number, number];
    p3?: [number, number];
  } | null;
};

function bezierDrawDraftSvg(
  draft: BezierDrawOverlay,
  transform: SvgRootTransform,
): string {
  const parts: string[] = [];
  if (draft.anchors.length >= 2 && draft.controls.length > 0) {
    parts.push(
      bezierEditSvg(draft.anchors, draft.controls, false, transform, null),
    );
  } else if (draft.anchors.length >= 1) {
    parts.push(vertexHandlesSvg(draft.anchors, transform, null));
  }

  const live = draft.live;
  if (!live) return parts.join("");

  const [x0, y0] = geoToSvgUserPoint(live.p0, transform);
  const [x1, y1] = geoToSvgUserPoint(live.p1, transform);
  const guide =
    `stroke="#ea580c" stroke-opacity="0.55" stroke-width="1.25" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" fill="none" pointer-events="none"`;
  parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" ${guide} />`);
  parts.push(vertexHandlesSvg([live.p0], transform, 0));
  {
    const s = CONTROL_SIZE;
    parts.push(
      `<polygon points="${x1},${y1 - s} ${x1 + s},${y1} ${x1},${y1 + s} ${x1 - s},${y1}" fill="#ea580c" fill-opacity="${CONTROL_OPACITY}" stroke="#9a3412" stroke-opacity="${CONTROL_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" vector-effect="non-scaling-stroke" pointer-events="none" />`,
    );
  }

  if (live.p2 && live.p3) {
    const [x2, y2] = geoToSvgUserPoint(live.p2, transform);
    const [x3, y3] = geoToSvgUserPoint(live.p3, transform);
    parts.push(`<line x1="${x3}" y1="${y3}" x2="${x2}" y2="${y2}" ${guide} />`);
    const sampled = sampleBezierPolyline(
      [live.p0, live.p3],
      [{ p1: live.p1, p2: live.p2 }],
      false,
      12,
    );
    if (sampled.length >= 2) {
      parts.push(lineSvg(sampled, transform, "#ea580c", 2.5));
    }
    const s = CONTROL_SIZE;
    parts.push(
      `<polygon points="${x2},${y2 - s} ${x2 + s},${y2} ${x2},${y2 + s} ${x2 - s},${y2}" fill="#ea580c" fill-opacity="${CONTROL_OPACITY}" stroke="#9a3412" stroke-opacity="${CONTROL_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" vector-effect="non-scaling-stroke" pointer-events="none" />`,
    );
    parts.push(vertexHandlesSvg([live.p3], transform, null));
  } else {
    // Only P0–P1 so far: show a straight guide toward the drag
    parts.push(lineSvg([live.p0, live.p1], transform, "#ea580c", 1.5));
  }

  return parts.join("");
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
  snapPreview?: SnapResult | null;
  bezierEdit?: BezierEditOverlay | null;
  bezierDraw?: BezierDrawOverlay | null;
  cutDraftPoints?: [number, number][];
  mergeObjectIndices?: number[];
  rectangularDraw?: {
    solid: [number, number][];
    dashed: [number, number][];
    fill: boolean;
  } | null;
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
    snapPreview = null,
    bezierEdit = null,
    bezierDraw = null,
    cutDraftPoints = [],
    mergeObjectIndices = [],
    rectangularDraw = null,
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
    if (mergeObjectIndices.includes(obj.i) && obj.i !== selectedObjectIndex) {
      const coords = resolveObjectCoordinates(obj.i, obj.v, ops);
      if (coords && coords.length > 0) {
        if (obj.t === "area") {
          parts.push(
            `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(13,148,136,0.18)" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="6 4" pointer-events="none" />`,
          );
        } else if (obj.t === "line") {
          parts.push(lineSvg(coords, transform, "#0d9488", 3));
        }
      }
    }
    if (mergeObjectIndices.includes(obj.i) && obj.i === selectedObjectIndex) {
      const coords = resolveObjectCoordinates(obj.i, obj.v, ops);
      if (coords && coords.length > 0) {
        if (obj.t === "area") {
          parts.push(
            `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(13,148,136,0.12)" stroke="#0f766e" stroke-width="2.5" pointer-events="none" />`,
          );
        } else if (obj.t === "line") {
          parts.push(lineSvg(coords, transform, "#0f766e", 3.5));
        }
      }
    }
  }

  for (const obj of objects) {
    if (selectedObjectIndex !== obj.i) continue;
    if (bezierEdit) {
      parts.push(
        bezierEditSvg(
          bezierEdit.anchors,
          bezierEdit.controls,
          bezierEdit.closed,
          transform,
          selectedVertexIndex,
        ),
      );
      continue;
    }
    const coords = resolveObjectCoordinates(obj.i, obj.v, ops);
    if (!coords || coords.length === 0) continue;
    const handleCoords = obj.t === "area" ? verticesForHandles(coords, obj.t) : coords;
    const kinds =
      resolveSyntheticAddVertexKinds(obj.i, handleCoords.length, ops.adds) ??
      resolveObjectVertexKinds(obj.i, handleCoords.length, ops);
    parts.push(vertexHandlesSvg(handleCoords, transform, selectedVertexIndex, HANDLE_SIZE, kinds));
  }

  if (bezierDraw) {
    parts.push(bezierDrawDraftSvg(bezierDraw, transform));
  } else if (rectangularDraw) {
    if (rectangularDraw.fill && rectangularDraw.solid.length + rectangularDraw.dashed.length >= 3) {
      const ring = [...rectangularDraw.solid];
      for (const p of rectangularDraw.dashed) {
        const last = ring[ring.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) ring.push(p);
      }
      if (ring.length >= 3) {
        parts.push(
          `<polygon points="${ringToSvgPoints(ring, transform)}" fill="rgba(245,158,11,0.15)" stroke="none" pointer-events="none" />`,
        );
      }
    }
    if (rectangularDraw.solid.length >= 2) {
      parts.push(lineSvg(rectangularDraw.solid, transform, "#d97706", 2.5));
    }
    if (rectangularDraw.dashed.length >= 2) {
      parts.push(dashedLineSvg(rectangularDraw.dashed, transform, "#d97706", 2.5));
    }
    const handles = [
      ...rectangularDraw.solid,
      ...rectangularDraw.dashed.slice(1),
    ];
    if (handles.length >= 1) {
      parts.push(vertexHandlesSvg(handles, transform, null));
    }
  } else if (!draftHasSymbolPreview && draftKind === "line" && draftPoints.length >= 1) {
    parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }
  if (
    !bezierDraw &&
    !rectangularDraw &&
    !draftHasSymbolPreview &&
    draftKind === "area" &&
    draftPoints.length >= 1
  ) {
    if (draftPoints.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(draftPoints, transform)}" fill="rgba(34,197,94,0.15)" stroke="#16a34a" stroke-width="2" pointer-events="none" />`,
      );
    } else {
      parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    }
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  } else if (
    !bezierDraw &&
    !rectangularDraw &&
    draftHasSymbolPreview &&
    draftPoints.length >= 1
  ) {
    parts.push(vertexHandlesSvg(draftPoints, transform, null));
  }

  if (gpsLivePoints.length >= 1 && !draftHasSymbolPreview) {
    parts.push(lineSvg(gpsLivePoints, transform, "#16a34a", 3));
    parts.push(vertexHandlesSvg(gpsLivePoints, transform, null, GPS_HANDLE_SIZE));
  }

  if (cutDraftPoints.length >= 1) {
    if (cutDraftPoints.length >= 2) {
      parts.push(lineSvg(cutDraftPoints, transform, "#7c3aed", 2.5));
    }
    parts.push(vertexHandlesSvg(cutDraftPoints, transform, null));
  }

  if (snapPreview) {
    parts.push(snapIndicatorSvg(snapPreview, transform));
  }

  return parts.join("");
}

/** Read-only comparison overlay for admin/user review of submitted field edits. */
export function fieldEditReviewOverlaySvg(options: {
  transform: SvgRootTransform;
  selectionGeometry: CheckoutSelectionGeometry;
  objects: FieldEditObjectEntry[];
  ops: FieldEditOps;
  symbolPreviewInner?: string;
  maskedObjectIndices?: number[];
  highlightObjectIndex?: number | null;
}): string {
  const {
    transform,
    selectionGeometry,
    objects,
    ops,
    symbolPreviewInner = "",
    maskedObjectIndices = [],
    highlightObjectIndex = null,
  } = options;

  const base = fieldEditOverlaySvg({
    transform,
    selectionGeometry,
    objects,
    ops,
    selectedObjectIndex: null,
    selectedVertexIndex: null,
    draftPoints: [],
    draftKind: null,
    symbolPreviewInner,
    maskedObjectIndices,
  });

  const byIndex = new Map(objects.map((o) => [o.i, o]));
  const parts: string[] = [base];

  for (const objectIndex of ops.deletes) {
    const obj = byIndex.get(objectIndex);
    if (!obj) continue;
    if (obj.t === "area" && obj.v.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(obj.v, transform)}" fill="rgba(220,38,38,0.12)" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="6 4" pointer-events="none" />`,
      );
    } else if (obj.t === "line" && obj.v.length >= 2) {
      parts.push(dashedLineSvg(obj.v, transform, "#dc2626", 3));
    }
  }

  for (const modify of ops.modifies) {
    const coords = modify.coordinates;
    if (modify.geometryKind === "area" && coords.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(217,119,6,0.12)" stroke="#d97706" stroke-width="2.5" stroke-dasharray="6 4" pointer-events="none" />`,
      );
    } else if (modify.geometryKind === "line" && coords.length >= 2) {
      parts.push(dashedLineSvg(coords, transform, "#d97706", 3));
    } else if (modify.geometryKind === "point" && coords.length >= 1) {
      const [x, y] = geoToSvgUserPoint(coords[0]!, transform);
      parts.push(
        `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    }
  }

  for (const add of ops.adds) {
    if (add.kind === "area" && add.ring.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(add.ring, transform)}" fill="rgba(22,163,74,0.12)" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="6 4" pointer-events="none" />`,
      );
    } else if (add.kind === "line" && add.coordinates.length >= 2) {
      parts.push(dashedLineSvg(add.coordinates, transform, "#16a34a", 3));
    } else if (add.kind === "point") {
      const [x, y] = geoToSvgUserPoint([add.x, add.y], transform);
      parts.push(
        `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    }
  }

  if (highlightObjectIndex != null) {
    const obj = byIndex.get(highlightObjectIndex);
    let focusPoint: [number, number] | null = null;
    if (obj) {
      const coords = resolveObjectCoordinates(highlightObjectIndex, obj.v, ops);
      if (coords && coords.length > 0) {
        focusPoint =
          coords.length === 1
            ? coords[0]!
            : [
                coords.reduce((s, p) => s + p[0], 0) / coords.length,
                coords.reduce((s, p) => s + p[1], 0) / coords.length,
              ];
      } else if (ops.deletes.includes(highlightObjectIndex)) {
        focusPoint = obj.c;
      }
    } else {
      for (const [addIndex, add] of ops.adds.entries()) {
        if (syntheticAddObjectId(addIndex) !== highlightObjectIndex) continue;
        focusPoint =
          add.kind === "point"
            ? [add.x, add.y]
            : add.kind === "line"
              ? (add.coordinates[0] ?? null)
              : (add.ring[0] ?? null);
      }
    }
    if (focusPoint) {
      const [cx, cy] = geoToSvgUserPoint(focusPoint, transform);
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#2563eb" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    }
  }

  return parts.join("");
}
