import { createHash } from "crypto";
import type { Feature, Geometry } from "geojson";
import type { NormalizedOcadObject, OcadObjectType, OcadParseSummary } from "./types";

type OcadObjectProperties = {
  sym: number;
  objectIndex: number;
  text?: string;
};

type OcadFileLike = {
  header: { version: number };
  objects: unknown[];
  symbols: Array<{ symNum: number; description?: string }>;
  warnings: string[];
  getBounds: (projection?: (v: number[]) => number[]) => number[];
};


function geometryTypeFromFeature(feature: Feature<Geometry, OcadObjectProperties>): OcadObjectType {
  const geometryType = feature.geometry.type;
  if (geometryType === "Point" || geometryType === "MultiPoint") return "point";
  if (geometryType === "LineString" || geometryType === "MultiLineString") return "line";
  if (geometryType === "Polygon" || geometryType === "MultiPolygon") return "area";
  if (feature.properties?.text) return "text";
  return "unknown";
}

function flattenCoordinates(geometry: Geometry): number[][] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as number[]];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates as number[][];
    case "MultiLineString":
    case "Polygon":
      return (geometry.coordinates as number[][][]).flat();
    case "MultiPolygon":
      return (geometry.coordinates as number[][][][]).flat(2);
    default:
      return [];
  }
}

function computeCentroid(coords: number[][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of coords) {
    sumX += x;
    sumY += y;
  }
  return [sumX / coords.length, sumY / coords.length];
}

function computeBbox(coords: number[][]): [number, number, number, number] {
  if (coords.length === 0) return [0, 0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

function hashGeometry(geometry: Geometry, symbolNumber: number, text?: string): string {
  const payload = JSON.stringify({ geometry, symbolNumber, text: text ?? "" });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function buildSymbolNameMap(
  symbols: Array<{ symNum: number; description?: string }>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const symbol of symbols) {
    map.set(symbol.symNum, symbol.description?.trim() || `Symbol ${symbol.symNum}`);
  }
  return map;
}

export function normalizeFromGeoJson(
  features: Feature<Geometry, OcadObjectProperties>[],
  symbolNames: Map<number, string>,
): NormalizedOcadObject[] {
  const objects: NormalizedOcadObject[] = [];

  for (const feature of features) {
    // Skip decorative symbol-element features (no objectIndex / no sym).
    const objectIndex = feature.properties?.objectIndex;
    const symbolNumber = feature.properties?.sym;
    if (objectIndex == null || objectIndex < 0 || symbolNumber == null || symbolNumber === 0) {
      continue;
    }

    const text = feature.properties?.text?.trim() || undefined;
    const coords = flattenCoordinates(feature.geometry);
    const type = geometryTypeFromFeature(feature);

    objects.push({
      objectIndex,
      symbolNumber,
      symbolName: symbolNames.get(symbolNumber) ?? `Symbol ${symbolNumber}`,
      type,
      centroid: computeCentroid(coords),
      bbox: computeBbox(coords),
      geometryHash: hashGeometry(feature.geometry, symbolNumber, text),
      text,
    });
  }

  return objects;
}

export function summarizeParseResult(input: {
  fileName: string;
  fileSizeBytes: number;
  parseDurationMs: number;
  ocadFile: OcadFileLike;
  objects: NormalizedOcadObject[];
}): OcadParseSummary {
  const byType: Record<OcadObjectType, number> = {
    point: 0,
    line: 0,
    area: 0,
    text: 0,
    unknown: 0,
  };

  const symbolCounts = new Map<number, { symbolName: string; count: number }>();

  for (const object of input.objects) {
    byType[object.type] += 1;
    const current = symbolCounts.get(object.symbolNumber) ?? {
      symbolName: object.symbolName,
      count: 0,
    };
    current.count += 1;
    symbolCounts.set(object.symbolNumber, current);
  }

  const topSymbols = [...symbolCounts.entries()]
    .map(([symbolNumber, value]) => ({
      symbolNumber,
      symbolName: value.symbolName,
      count: value.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  let bounds: number[] | null = null;
  try {
    bounds = input.ocadFile.getBounds();
  } catch {
    bounds = null;
  }

  return {
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    parseDurationMs: input.parseDurationMs,
    ocadVersion: input.ocadFile.header.version,
    objectCount: input.objects.length,
    symbolCount: input.ocadFile.symbols.length,
    warnings: input.ocadFile.warnings,
    byType,
    topSymbols,
    bounds,
    objects: input.objects,
  };
}
