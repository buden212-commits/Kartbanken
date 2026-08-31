import { parseOcadBuffer } from "./read";
import type { NormalizedOcadObject } from "./types";
import type { MapHitIndexEntry } from "./map-hit-index";

const MAX_FEATURE_SPAN = 600; // ~6 mm in OCAD units — knolls, boulders, etc.

function bboxSpan(bbox: [number, number, number, number]): number {
  const [minX, minY, maxX, maxY] = bbox;
  return Math.max(maxX - minX, maxY - minY);
}

function isSuggestibleFeature(obj: NormalizedOcadObject): boolean {
  if (obj.type === "point" || obj.type === "text") return true;
  return bboxSpan(obj.bbox) <= MAX_FEATURE_SPAN;
}

export function buildMapHitIndex(
  objects: NormalizedOcadObject[],
): MapHitIndexEntry[] {
  return objects.filter(isSuggestibleFeature).map((obj) => ({
    c: obj.centroid,
    b: obj.bbox,
    s: obj.symbolNumber,
    t: obj.type,
  }));
}

export async function loadMapHitIndexFromOcd(
  buffer: Buffer,
  fileName: string,
): Promise<MapHitIndexEntry[]> {
  const parsed = await parseOcadBuffer(buffer, fileName);
  return buildMapHitIndex(parsed.objects);
}
