/**
 * Screen-space markers for field-edit (outside CSS zoom).
 * Coordinates are viewport CSS pixels from DiffMapPanel.projectGeo.
 */
import type { BezierSegmentControls } from "@/lib/field-edit/geometry-tools";
import type { SnapResult } from "@/lib/field-edit/snap";
import {
  resolveSyntheticAddVertexKinds,
  syntheticAddObjectId,
  type FieldEditObjectEntry,
} from "@/lib/field-edit/object-index";
import type { FieldEditOps, FieldEditVertexKind } from "@/lib/field-edit/types";
import { resolveObjectCoordinates, resolveObjectVertexKinds } from "@/lib/field-edit/types";
import { verticesForHandles } from "@/lib/field-edit/vertices";
import type { BezierDrawOverlay, BezierEditOverlay } from "@/components/field-edit/field-edit-overlay";

const HANDLE_SIZE_PX = 6;
const GPS_HANDLE_SIZE_PX = 5;
const HANDLE_STROKE_PX = 1.5;
const HANDLE_OPACITY = 0.5;
const CONTROL_SIZE_PX = 8;
const CONTROL_OPACITY = 0.85;

export type ProjectGeoToViewport = (
  geo: [number, number],
) => { x: number; y: number } | null;

function atPx(x: number, y: number, inner: string): string {
  return `<g transform="translate(${x} ${y})" pointer-events="none">${inner}</g>`;
}

function vertexRole(index: number, count: number): "first" | "last" | "middle" {
  if (count <= 1) return "middle";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

function handleShape(
  role: "first" | "last" | "middle",
  kind: FieldEditVertexKind,
  selected: boolean,
  handleSizePx: number,
): string {
  const fill = selected ? "#2563eb" : "#ffffff";
  const stroke = selected ? "#1d4ed8" : "#64748b";
  const size = selected ? handleSizePx * 1.15 : handleSizePx;
  const common =
    `fill="${fill}" fill-opacity="${HANDLE_OPACITY}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" pointer-events="none"`;

  if (kind === "dash") {
    return `<polygon points="0,${-size} ${size},0 0,${size} ${-size},0" ${common} />`;
  }
  if (kind === "corner") {
    return `<rect x="${-size}" y="${-size}" width="${size * 2}" height="${size * 2}" ${common} />`;
  }
  if (role === "first") {
    const arm = size;
    return `<g pointer-events="none">
      <line x1="${-arm}" y1="${-arm}" x2="${arm}" y2="${arm}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX * 1.4}" />
      <line x1="${arm}" y1="${-arm}" x2="${-arm}" y2="${arm}" stroke="${stroke}" stroke-opacity="${HANDLE_OPACITY}" stroke-width="${HANDLE_STROKE_PX * 1.4}" />
    </g>`;
  }
  if (role === "last") {
    return `<rect x="${-size}" y="${-size}" width="${size * 2}" height="${size * 2}" ${common} />`;
  }
  return `<circle cx="0" cy="0" r="${size}" ${common} />`;
}

function vertexHandles(
  coords: [number, number][],
  project: ProjectGeoToViewport,
  selectedVertex: number | null,
  handleSizePx = HANDLE_SIZE_PX,
  kinds?: FieldEditVertexKind[],
): string {
  return coords
    .map((geo, index) => {
      const p = project(geo);
      if (!p) return "";
      return atPx(
        p.x,
        p.y,
        handleShape(
          vertexRole(index, coords.length),
          kinds?.[index] ?? "normal",
          selectedVertex === index,
          handleSizePx,
        ),
      );
    })
    .join("");
}

function controlDiamond(project: ProjectGeoToViewport, geo: [number, number]): string {
  const p = project(geo);
  if (!p) return "";
  const s = CONTROL_SIZE_PX;
  return atPx(
    p.x,
    p.y,
    `<polygon points="0,${-s} ${s},0 0,${s} ${-s},0" fill="#ea580c" fill-opacity="${CONTROL_OPACITY}" stroke="#9a3412" stroke-opacity="${CONTROL_OPACITY}" stroke-width="${HANDLE_STROKE_PX}" pointer-events="none" />`,
  );
}

function deleteMarker(project: ProjectGeoToViewport, centroid: [number, number]): string {
  const p = project(centroid);
  if (!p) return "";
  return atPx(
    p.x,
    p.y,
    `<g pointer-events="none"><line x1="-8" y1="-8" x2="8" y2="8" stroke="#dc2626" stroke-width="3" /><line x1="8" y1="-8" x2="-8" y2="8" stroke="#dc2626" stroke-width="3" /></g>`,
  );
}

function snapMarker(project: ProjectGeoToViewport, snap: SnapResult): string {
  const p = project(snap.point);
  if (!p) return "";
  const color = snap.kind === "vertex" ? "#2563eb" : snap.kind === "segment" ? "#7c3aed" : "#0891b2";
  return atPx(
    p.x,
    p.y,
    `<g pointer-events="none">
    <circle cx="0" cy="0" r="14" fill="none" stroke="${color}" stroke-width="2" />
    <line x1="-10" y1="0" x2="10" y2="0" stroke="${color}" stroke-width="2" />
    <line x1="0" y1="-10" x2="0" y2="10" stroke="${color}" stroke-width="2" />
  </g>`,
  );
}

function reviewRing(project: ProjectGeoToViewport, geo: [number, number], r: number, stroke: string): string {
  const p = project(geo);
  if (!p) return "";
  return atPx(
    p.x,
    p.y,
    `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none" />`,
  );
}

export function fieldEditScreenMarkersSvg(options: {
  projectGeo: ProjectGeoToViewport;
  objects: FieldEditObjectEntry[];
  ops: FieldEditOps;
  selectedObjectIndex: number | null;
  selectedVertexIndex: number | null;
  draftPoints: [number, number][];
  draftKind: "line" | "area" | null;
  gpsLivePoints?: [number, number][];
  maskedObjectIndices?: number[];
  draftHasSymbolPreview?: boolean;
  snapPreview?: SnapResult | null;
  bezierEdit?: BezierEditOverlay | null;
  bezierDraw?: BezierDrawOverlay | null;
  cutDraftPoints?: [number, number][];
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
    projectGeo,
    objects,
    ops,
    selectedObjectIndex,
    selectedVertexIndex,
    draftPoints,
    draftKind,
    gpsLivePoints = [],
    maskedObjectIndices = [],
    draftHasSymbolPreview = false,
    snapPreview = null,
    bezierEdit = null,
    bezierDraw = null,
    cutDraftPoints = [],
    rectangularDraw = null,
    curveDraw = null,
  } = options;

  const parts: string[] = [];
  const masked = new Set(maskedObjectIndices);

  for (const obj of objects) {
    if (!masked.has(obj.i)) continue;
    if (ops.deletes.includes(obj.i)) {
      parts.push(deleteMarker(projectGeo, obj.c));
    }
  }

  for (const obj of objects) {
    if (selectedObjectIndex !== obj.i) continue;
    if (bezierEdit) {
      for (const seg of bezierEdit.controls) {
        parts.push(controlDiamond(projectGeo, seg.p1));
        parts.push(controlDiamond(projectGeo, seg.p2));
      }
      parts.push(
        vertexHandles(bezierEdit.anchors, projectGeo, selectedVertexIndex),
      );
      continue;
    }
    const coords = resolveObjectCoordinates(obj.i, obj.v, ops);
    if (!coords || coords.length === 0) continue;
    const handleCoords = obj.t === "area" ? verticesForHandles(coords, obj.t) : coords;
    const kinds =
      resolveSyntheticAddVertexKinds(obj.i, handleCoords.length, ops.adds) ??
      resolveObjectVertexKinds(obj.i, handleCoords.length, ops);
    parts.push(
      vertexHandles(handleCoords, projectGeo, selectedVertexIndex, HANDLE_SIZE_PX, kinds),
    );
  }

  if (bezierDraw) {
    if (bezierDraw.anchors.length >= 1) {
      parts.push(vertexHandles(bezierDraw.anchors, projectGeo, null));
    }
    for (const seg of bezierDraw.controls) {
      parts.push(controlDiamond(projectGeo, seg.p1));
      parts.push(controlDiamond(projectGeo, seg.p2));
    }
    const live = bezierDraw.live;
    if (live) {
      parts.push(vertexHandles([live.anchor], projectGeo, 0));
      parts.push(controlDiamond(projectGeo, live.handle));
      const ap = projectGeo(live.anchor);
      const hp = projectGeo(live.handle);
      if (ap && hp) {
        const dx = hp.x - ap.x;
        const dy = hp.y - ap.y;
        const len = Math.hypot(dx, dy);
        if (len > 8) {
          const ux = dx / len;
          const uy = dy / len;
          const backX = -ux * 10;
          const backY = -uy * 10;
          const px = -uy * 5;
          const py = ux * 5;
          parts.push(
            atPx(
              hp.x,
              hp.y,
              `<polygon points="0,0 ${backX + px},${backY + py} ${backX - px},${backY - py}" fill="#ea580c" fill-opacity="0.9" pointer-events="none" />`,
            ),
          );
        }
      }
    }
  } else if (rectangularDraw) {
    const handles = [...rectangularDraw.solid, ...rectangularDraw.dashed.slice(1)];
    if (handles.length >= 1) {
      parts.push(vertexHandles(handles, projectGeo, null));
    }
  } else if (curveDraw) {
    const axisHandles = [
      ...(curveDraw.axesSolid ?? []),
      ...(curveDraw.axesDashed ?? []).slice(1),
    ];
    if (axisHandles.length >= 1) {
      parts.push(vertexHandles(axisHandles, projectGeo, null));
    }
  } else if (!draftHasSymbolPreview && draftKind === "line" && draftPoints.length >= 1) {
    parts.push(vertexHandles(draftPoints, projectGeo, null));
  }

  if (
    !bezierDraw &&
    !rectangularDraw &&
    !curveDraw &&
    !draftHasSymbolPreview &&
    draftKind === "area" &&
    draftPoints.length >= 1
  ) {
    parts.push(vertexHandles(draftPoints, projectGeo, null));
  } else if (
    !bezierDraw &&
    !rectangularDraw &&
    !curveDraw &&
    draftHasSymbolPreview &&
    draftPoints.length >= 1
  ) {
    parts.push(vertexHandles(draftPoints, projectGeo, null));
  }

  if (gpsLivePoints.length >= 1 && !draftHasSymbolPreview) {
    parts.push(vertexHandles(gpsLivePoints, projectGeo, null, GPS_HANDLE_SIZE_PX));
  }

  if (cutDraftPoints.length >= 1) {
    parts.push(vertexHandles(cutDraftPoints, projectGeo, null));
  }

  if (snapPreview) {
    parts.push(snapMarker(projectGeo, snapPreview));
  }

  return parts.join("");
}

export function fieldEditReviewScreenMarkersSvg(options: {
  projectGeo: ProjectGeoToViewport;
  objects: FieldEditObjectEntry[];
  ops: FieldEditOps;
  highlightObjectIndex?: number | null;
}): string {
  const { projectGeo, objects, ops, highlightObjectIndex = null } = options;
  const byIndex = new Map(objects.map((o) => [o.i, o]));
  const parts: string[] = [];

  for (const modify of ops.modifies) {
    if (modify.geometryKind === "point" && modify.coordinates.length >= 1) {
      parts.push(reviewRing(projectGeo, modify.coordinates[0]!, 12, "#d97706"));
    }
  }
  for (const add of ops.adds) {
    if (add.kind === "point") {
      parts.push(reviewRing(projectGeo, [add.x, add.y], 12, "#16a34a"));
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
      const p = projectGeo(focusPoint);
      if (p) {
        parts.push(
          atPx(
            p.x,
            p.y,
            `<circle cx="0" cy="0" r="22" fill="none" stroke="#2563eb" stroke-width="3" pointer-events="none" />`,
          ),
        );
      }
    }
  }

  return parts.join("");
}
