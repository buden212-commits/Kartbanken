import {
  CheckoutSelectionType,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import type { BezierSegmentControls } from "@/lib/field-edit/geometry-tools";
import { sampleBezierPolyline } from "@/lib/field-edit/geometry-tools";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { resolveObjectCoordinates } from "@/lib/field-edit/types";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

/** Screen pixels (non-scaling-stroke) for checkout boundary outline. */
const SELECTION_BOUNDARY_STROKE_PX = 2;

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

function lineSvg(
  coords: [number, number][],
  transform: SvgRootTransform,
  stroke: string,
  widthPx = 2,
): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${widthPx}" vector-effect="non-scaling-stroke" pointer-events="none" />`;
}

function dashedLineSvg(
  coords: [number, number][],
  transform: SvgRootTransform,
  stroke: string,
  widthPx = 2,
): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${widthPx}" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none" />`;
}

function maskLineSvg(coords: [number, number][], transform: SvgRootTransform): string {
  if (coords.length < 2) return "";
  const points = ringToSvgPoints(coords, transform);
  // Map-unit stroke — covers OCAD symbol width (map symbols scale with extent).
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

function maskObjectSvg(obj: FieldEditObjectEntry, transform: SvgRootTransform): string {
  if (obj.t === "line") return maskLineSvg(obj.v, transform);
  if (obj.t === "area") return maskAreaSvg(obj.v, transform);
  return maskPointSvg(obj.c, transform);
}

export type BezierEditOverlay = {
  anchors: [number, number][];
  controls: BezierSegmentControls[];
  closed: boolean;
};

export type BezierDrawOverlay = {
  anchors: [number, number][];
  controls: BezierSegmentControls[];
  /**
   * Live inflection: press at `anchor`, drag to `handle` (outgoing tip).
   * Optional `prevOutHandle` enables curve preview from the last committed anchor.
   */
  live?: {
    anchor: [number, number];
    handle: [number, number];
    prevOutHandle?: [number, number] | null;
  } | null;
};

/** Map-space Bézier curve + guide lines (handles rendered in screen overlay). */
function bezierEditSvg(
  anchors: [number, number][],
  controls: BezierSegmentControls[],
  closed: boolean,
  transform: SvgRootTransform,
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
  }

  return parts.join("");
}

function bezierDrawDraftSvg(
  draft: BezierDrawOverlay,
  transform: SvgRootTransform,
): string {
  const parts: string[] = [];
  if (draft.anchors.length >= 2 && draft.controls.length > 0) {
    parts.push(bezierEditSvg(draft.anchors, draft.controls, false, transform));
  }

  const live = draft.live;
  if (!live) return parts.join("");

  const [ax, ay] = geoToSvgUserPoint(live.anchor, transform);
  const [hx, hy] = geoToSvgUserPoint(live.handle, transform);
  const guide =
    `stroke="#ea580c" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" fill="none" pointer-events="none"`;

  parts.push(`<line x1="${ax}" y1="${ay}" x2="${hx}" y2="${hy}" ${guide} />`);

  if (draft.anchors.length >= 1 && live.prevOutHandle) {
    const prev = draft.anchors[draft.anchors.length - 1]!;
    const p1 = live.prevOutHandle;
    const p2: [number, number] = [
      2 * live.anchor[0] - live.handle[0],
      2 * live.anchor[1] - live.handle[1],
    ];
    const sampled = sampleBezierPolyline([prev, live.anchor], [{ p1, p2 }], false, 12);
    if (sampled.length >= 2) {
      parts.push(lineSvg(sampled, transform, "#ea580c", 2.5));
    }
    const [ix, iy] = geoToSvgUserPoint(p2, transform);
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${ix}" y2="${iy}" ${guide} />`);
  }

  return parts.join("");
}

/**
 * Map-space overlay: selection, masks, symbol preview, draft strokes.
 * Vertex/snap/delete markers are rendered via `fieldEditScreenMarkersSvg`
 * outside the CSS zoom transform so they stay screen-sized.
 */
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
  bezierEdit?: BezierEditOverlay | null;
  bezierDraw?: BezierDrawOverlay | null;
  cutDraftPoints?: [number, number][];
  mergeObjectIndices?: number[];
  rectangularDraw?: {
    solid: [number, number][];
    dashed: [number, number][];
    fill: boolean;
  } | null;
  curveDraw?: {
    ring: [number, number][];
    fill: boolean;
    axesSolid?: [number, number][];
    axesDashed?: [number, number][];
  } | null;
}): string {
  const {
    transform,
    selectionGeometry,
    objects,
    ops,
    selectedObjectIndex,
    draftPoints,
    draftKind,
    gpsLivePoints = [],
    symbolPreviewInner = "",
    maskedObjectIndices = [],
    draftHasSymbolPreview = false,
    bezierEdit = null,
    bezierDraw = null,
    cutDraftPoints = [],
    mergeObjectIndices = [],
    rectangularDraw = null,
    curveDraw = null,
  } = options;

  const masked = new Set(maskedObjectIndices);
  const parts: string[] = [selectionBoundarySvg(selectionGeometry, transform)];

  for (const obj of objects) {
    if (!masked.has(obj.i)) continue;
    parts.push(maskObjectSvg(obj, transform));
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
            `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(13,148,136,0.18)" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none" />`,
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
            `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(13,148,136,0.12)" stroke="#0f766e" stroke-width="2.5" vector-effect="non-scaling-stroke" pointer-events="none" />`,
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
        ),
      );
    }
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
  } else if (curveDraw) {
    if (curveDraw.fill && curveDraw.ring.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(curveDraw.ring, transform)}" fill="rgba(245,158,11,0.15)" stroke="#d97706" stroke-width="2.5" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    } else if (curveDraw.ring.length >= 2) {
      parts.push(lineSvg(curveDraw.ring, transform, "#d97706", 2.5));
    }
    if (curveDraw.axesSolid && curveDraw.axesSolid.length >= 2) {
      parts.push(lineSvg(curveDraw.axesSolid, transform, "#ea580c", 2));
    }
    if (curveDraw.axesDashed && curveDraw.axesDashed.length >= 2) {
      parts.push(dashedLineSvg(curveDraw.axesDashed, transform, "#ea580c", 2));
    }
  } else if (!draftHasSymbolPreview && draftKind === "line" && draftPoints.length >= 1) {
    parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
  }
  if (
    !bezierDraw &&
    !rectangularDraw &&
    !curveDraw &&
    !draftHasSymbolPreview &&
    draftKind === "area" &&
    draftPoints.length >= 1
  ) {
    if (draftPoints.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(draftPoints, transform)}" fill="rgba(34,197,94,0.15)" stroke="#16a34a" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    } else {
      parts.push(lineSvg(draftPoints, transform, "#16a34a", 2));
    }
  }

  if (gpsLivePoints.length >= 1 && !draftHasSymbolPreview) {
    parts.push(lineSvg(gpsLivePoints, transform, "#16a34a", 3));
  }

  if (cutDraftPoints.length >= 2) {
    parts.push(lineSvg(cutDraftPoints, transform, "#7c3aed", 2.5));
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
}): string {
  const {
    transform,
    selectionGeometry,
    objects,
    ops,
    symbolPreviewInner = "",
    maskedObjectIndices = [],
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
        `<polygon points="${ringToSvgPoints(obj.v, transform)}" fill="rgba(220,38,38,0.12)" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    } else if (obj.t === "line" && obj.v.length >= 2) {
      parts.push(dashedLineSvg(obj.v, transform, "#dc2626", 3));
    }
  }

  for (const modify of ops.modifies) {
    const coords = modify.coordinates;
    if (modify.geometryKind === "area" && coords.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(coords, transform)}" fill="rgba(217,119,6,0.12)" stroke="#d97706" stroke-width="2.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    } else if (modify.geometryKind === "line" && coords.length >= 2) {
      parts.push(dashedLineSvg(coords, transform, "#d97706", 3));
    }
  }

  for (const add of ops.adds) {
    if (add.kind === "area" && add.ring.length >= 3) {
      parts.push(
        `<polygon points="${ringToSvgPoints(add.ring, transform)}" fill="rgba(22,163,74,0.12)" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none" />`,
      );
    } else if (add.kind === "line" && add.coordinates.length >= 2) {
      parts.push(dashedLineSvg(add.coordinates, transform, "#16a34a", 3));
    }
  }

  return parts.join("");
}
