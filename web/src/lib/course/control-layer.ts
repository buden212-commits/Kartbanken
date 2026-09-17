import type { CourseObjectDto, EditorObject } from "./types";

/** IOF 701 start, 703 control, 704 control number, and 706 finish live on the map layer. */
export const CONTROL_LAYER_SYMBOLS = new Set([701, 703, 704, 706]);

export function isControlLayerSymbol(symbolNr: number): boolean {
  return CONTROL_LAYER_SYMBOLS.has(symbolNr);
}

export function isPersistedObjectId(id: string | undefined | null): boolean {
  if (!id) return false;
  if (id.startsWith("tmp_")) return false;
  return id.length >= 8;
}

export function controlLayerObjects<T extends { symbolNr: number }>(objects: T[]): T[] {
  return objects.filter((obj) => isControlLayerSymbol(obj.symbolNr));
}

export function courseOnlyObjects<T extends { symbolNr: number }>(objects: T[]): T[] {
  return objects.filter((obj) => !isControlLayerSymbol(obj.symbolNr));
}

type LayerLike = {
  id: string;
  symbolNr: number;
  objectType: string;
  geometryJson: string;
  textContent: string | null;
  sortOrder: number;
};

function parseGeometryJson(json: string): CourseObjectDto["geometry"] {
  return JSON.parse(json) as CourseObjectDto["geometry"];
}

export function serializeLayerObjects(rows: LayerLike[]): CourseObjectDto[] {
  return rows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((obj) => ({
      id: obj.id,
      symbolNr: obj.symbolNr,
      objectType: obj.objectType as CourseObjectDto["objectType"],
      geometry: parseGeometryJson(obj.geometryJson),
      textContent: obj.textContent,
      sortOrder: obj.sortOrder,
    }));
}

/** Layer first, then course-specific objects. Same id kept once (layer wins). */
export function mergeLayerAndCourseObjects(
  layer: CourseObjectDto[],
  course: CourseObjectDto[],
): CourseObjectDto[] {
  const seen = new Set<string>();
  const merged: CourseObjectDto[] = [];
  for (const obj of [...layer, ...course]) {
    if (seen.has(obj.id)) continue;
    seen.add(obj.id);
    merged.push(obj);
  }
  return merged.map((obj, index) => ({ ...obj, sortOrder: index }));
}

export function keepControlLayer(objects: EditorObject[]): EditorObject[] {
  return controlLayerObjects(objects).map((obj, index) => ({
    ...obj,
    sortOrder: index,
  }));
}
