import type { Geometry } from "geojson";
import type { OcadObjectType } from "@/lib/ocad/types";

/** Extract editable vertex ring from GeoJSON geometry (outer ring for areas). */
export function extractObjectVertices(geometry: Geometry): [number, number][] {
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates[0]!, geometry.coordinates[1]!]];
    case "MultiPoint":
      return (geometry.coordinates as number[][]).map(
        ([x, y]) => [x, y] as [number, number],
      );
    case "LineString":
      return (geometry.coordinates as number[][]).map(
        ([x, y]) => [x, y] as [number, number],
      );
    case "MultiLineString": {
      const lines = geometry.coordinates as number[][][];
      let best = lines[0] ?? [];
      for (const line of lines) {
        if (line.length > best.length) best = line;
      }
      return best.map(([x, y]) => [x, y] as [number, number]);
    }
    case "Polygon": {
      const ring = (geometry.coordinates as number[][][])[0] ?? [];
      return ring.map(([x, y]) => [x, y] as [number, number]);
    }
    case "MultiPolygon": {
      const polys = geometry.coordinates as number[][][][];
      let best = polys[0]?.[0] ?? [];
      for (const poly of polys) {
        const ring = poly[0] ?? [];
        if (ring.length > best.length) best = ring;
      }
      return best.map(([x, y]) => [x, y] as [number, number]);
    }
    default:
      return [];
  }
}

const CLOSE_EPS = 1e-3;

export function isClosedRing(vertices: [number, number][]): boolean {
  if (vertices.length < 2) return false;
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= CLOSE_EPS;
}

/** Drop duplicate closing corner for UI handles (areas). */
export function verticesForHandles(
  vertices: [number, number][],
  type: OcadObjectType,
): [number, number][] {
  if (type !== "area" || vertices.length < 2) return vertices;
  if (isClosedRing(vertices)) return vertices.slice(0, -1);
  return vertices;
}

/** Ensure closed ring for hit-testing and rendering filled areas. */
export function closedRing(vertices: [number, number][]): [number, number][] {
  if (vertices.length < 3) return vertices;
  if (isClosedRing(vertices)) return vertices;
  return [...vertices, vertices[0]!];
}

/** Apply a vertex drag; keeps area rings closed. */
export function applyVertexMove(
  vertices: [number, number][],
  type: OcadObjectType,
  vertexIndex: number,
  newPos: [number, number],
): [number, number][] {
  const next = vertices.map(([x, y], index) =>
    index === vertexIndex ? ([newPos[0], newPos[1]] as [number, number]) : ([x, y] as [number, number]),
  );
  if (type === "area" && isClosedRing(next) && vertexIndex === 0) {
    next[next.length - 1] = [newPos[0], newPos[1]];
  }
  return next;
}

/**
 * Remove a handle-index vertex. `vertices` should be handle coords (area without
 * duplicate close). Returns closed ring for areas, or null if below minPoints.
 */
export function removeVertexAt(
  vertices: [number, number][],
  type: OcadObjectType,
  vertexIndex: number,
  minPoints: number,
): [number, number][] | null {
  const handles = verticesForHandles(vertices, type);
  if (handles.length <= minPoints) return null;
  if (vertexIndex < 0 || vertexIndex >= handles.length) return null;
  const next = handles.filter((_, index) => index !== vertexIndex);
  if (next.length < minPoints) return null;
  return type === "area" ? closedRing(next) : next;
}

/**
 * Insert a vertex on a segment. For areas, segmentIndex may be the closing edge
 * (last → first) when using a closed ring for hit-testing.
 */
export function insertVertexOnSegment(
  vertices: [number, number][],
  type: OcadObjectType,
  segmentIndex: number,
  point: [number, number],
): [number, number][] {
  const handles = verticesForHandles(vertices, type).map(
    ([x, y]) => [x, y] as [number, number],
  );
  if (handles.length < 2) {
    return type === "area" ? closedRing([...handles, point]) : [...handles, point];
  }

  if (type === "area") {
    // Closing edge is between last and first handle.
    if (segmentIndex >= handles.length - 1) {
      handles.push([point[0], point[1]]);
    } else {
      handles.splice(segmentIndex + 1, 0, [point[0], point[1]]);
    }
    return closedRing(handles);
  }

  const insertAt = Math.max(0, Math.min(handles.length, segmentIndex + 1));
  handles.splice(insertAt, 0, [point[0], point[1]]);
  return handles;
}

/** Reverse line/area direction (first ↔ last). */
export function reverseVertices(
  vertices: [number, number][],
  type: OcadObjectType,
): [number, number][] {
  const handles = verticesForHandles(vertices, type).map(
    ([x, y]) => [x, y] as [number, number],
  );
  handles.reverse();
  return type === "area" ? closedRing(handles) : handles;
}
