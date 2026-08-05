import { createRequire } from "module";
import type { SuggestionGeometry } from "@/lib/suggestion/types";
import {
  computeCoordBounds,
  defaultTObject12Template,
  objectLenFromByteSize,
  OCAD_AREA_OBJECT,
  OCAD_AREA_SYMBOL,
  OCAD_LINE_OBJECT,
  OCAD_LINE_SYMBOL,
  OCAD_POINT_OBJECT,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
  type OcadCoord,
  type TObject12Template,
  writeTObject12,
} from "./ocad-object-create";
import { appendNewObjects, type NewObjectSpec } from "./ocad-integrate";
import { normalizeSourceVersion } from "./ocad-export-shared";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    header: { version: number };
    objects: Array<{
      sym: number;
      objType: number;
      otp: number;
      unicode: boolean;
      ang: number;
      col: number;
      lineWidth: number;
      diamFlags: number;
      serverObjectId: number;
      height: number;
      creationDate?: number;
      multirepresentationId?: number;
      modificationDate?: number;
      nText: number;
      nObjectString?: number;
      nDatabaseString?: number;
      objectStringType?: number;
      res1?: number;
      objIndex?: { status: number; _index: number };
    }>;
    symbols: Array<{ symNum: number; type: number }>;
  }>;
};

export type OcdSuggestionSymbolMapping = {
  point: number;
  line: number;
  area: number;
};

export type AppendSuggestionsResult = {
  buffer: Buffer;
  appended: number;
  skipped: number;
  warnings: string[];
};

const CORNER_Y_FLAG = 0x01;

function isActiveObject(obj: { objIndex?: { status: number } }): boolean {
  const status = obj.objIndex?.status;
  return status != null && status > 0 && status < 3;
}

function templateFromObject(
  obj: Awaited<ReturnType<typeof readOcad>>["objects"][number],
  sym: number,
): TObject12Template {
  return {
    sym,
    otp: obj.otp ?? 0,
    unicode: obj.unicode ?? true,
    ang: obj.ang ?? 0,
    col: obj.col ?? -1,
    lineWidth: obj.lineWidth ?? 0,
    diamFlags: obj.diamFlags ?? 0,
    serverObjectId: obj.serverObjectId ?? 0,
    height: obj.height ?? 0,
    creationDate: obj.creationDate ?? defaultTObject12Template(sym).creationDate,
    multirepresentationId: obj.multirepresentationId ?? 0,
    modificationDate: obj.modificationDate ?? defaultTObject12Template(sym).modificationDate,
    nText: 0,
    nObjectString: 0,
    nDatabaseString: 0,
    objectStringType: obj.objectStringType ?? 0,
    res1: obj.res1 ?? 0,
  };
}

function findTemplateObject(
  ocadFile: Awaited<ReturnType<typeof readOcad>>,
  sym: number,
  objType: number,
): Awaited<ReturnType<typeof readOcad>>["objects"][number] | null {
  const preferred = ocadFile.objects.find(
    (obj) => isActiveObject(obj) && obj.sym === sym && obj.objType === objType,
  );
  if (preferred) return preferred;

  return (
    ocadFile.objects.find((obj) => isActiveObject(obj) && obj.objType === objType) ?? null
  );
}

function assertSymbolType(
  ocadFile: Awaited<ReturnType<typeof readOcad>>,
  sym: number,
  expectedTypes: number[],
  label: string,
): void {
  const symbol = ocadFile.symbols.find((entry) => entry.symNum === sym);
  if (!symbol) {
    throw new Error(`Symbol ${sym} finns inte i kartfilen (${label}).`);
  }
  if (!expectedTypes.includes(symbol.type)) {
    throw new Error(
      `Symbol ${sym} passar inte för ${label}. Välj en symbol av rätt typ i exportdialogen.`,
    );
  }
}

function buildObjectSpec(
  template: TObject12Template,
  coords: OcadCoord[],
  objType: number,
): NewObjectSpec {
  const objectBytes = writeTObject12(template, coords);
  const bounds = computeCoordBounds(coords);
  return {
    objectBytes,
    sym: template.sym,
    objType,
    len: objectLenFromByteSize(objectBytes.length),
    rc: bounds,
  };
}

function geometryToObjectSpec(
  geometry: SuggestionGeometry,
  mapping: OcdSuggestionSymbolMapping,
  ocadFile: Awaited<ReturnType<typeof readOcad>>,
): NewObjectSpec | null {
  switch (geometry.type) {
    case "Point": {
      assertSymbolType(ocadFile, mapping.point, [OCAD_POINT_SYMBOL], "punkt");
      const templateObj = findTemplateObject(ocadFile, mapping.point, OCAD_POINT_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.point)
        : defaultTObject12Template(mapping.point);
      const [x, y] = geometry.coordinates;
      return buildObjectSpec(template, [{ x, y }], OCAD_POINT_OBJECT);
    }
    case "LineString": {
      assertSymbolType(ocadFile, mapping.line, [OCAD_LINE_SYMBOL], "linje");
      const templateObj = findTemplateObject(ocadFile, mapping.line, OCAD_LINE_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.line)
        : defaultTObject12Template(mapping.line);
      const coords = geometry.coordinates.map(([x, y]) => ({ x, y }));
      if (coords.length < 2) return null;
      return buildObjectSpec(template, coords, OCAD_LINE_OBJECT);
    }
    case "Polygon": {
      assertSymbolType(
        ocadFile,
        mapping.area,
        [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL],
        "yta",
      );
      const templateObj = findTemplateObject(ocadFile, mapping.area, OCAD_AREA_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.area)
        : defaultTObject12Template(mapping.area);
      const ring = geometry.ring;
      if (ring.length < 3) return null;

      const coords: OcadCoord[] = ring.map(([x, y], index) => ({
        x,
        y,
        yFlags: index === 0 ? CORNER_Y_FLAG : 0,
      }));
      const [fx, fy] = ring[0]!;
      coords.push({ x: fx, y: fy, yFlags: CORNER_Y_FLAG });
      return buildObjectSpec(template, coords, OCAD_AREA_OBJECT);
    }
    case "Bbox": {
      assertSymbolType(
        ocadFile,
        mapping.area,
        [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL],
        "yta/rektangel",
      );
      const templateObj = findTemplateObject(ocadFile, mapping.area, OCAD_AREA_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.area)
        : defaultTObject12Template(mapping.area);
      const { minX, minY, maxX, maxY } = geometry.bbox;
      const coords: OcadCoord[] = [
        { x: minX, y: minY, yFlags: CORNER_Y_FLAG },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
        { x: minX, y: minY, yFlags: CORNER_Y_FLAG },
      ];
      return buildObjectSpec(template, coords, OCAD_AREA_OBJECT);
    }
  }
}

export function validateOcdSuggestionSymbolMapping(
  value: unknown,
): OcdSuggestionSymbolMapping | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const point = record.point;
  const line = record.line;
  const area = record.area;
  if (
    typeof point !== "number" ||
    typeof line !== "number" ||
    typeof area !== "number" ||
    !Number.isFinite(point) ||
    !Number.isFinite(line) ||
    !Number.isFinite(area) ||
    point <= 0 ||
    line <= 0 ||
    area <= 0
  ) {
    return null;
  }
  return { point, line, area };
}

export async function appendSuggestionsToOcadBuffer(
  sourceBuffer: Buffer,
  geometries: SuggestionGeometry[],
  mapping: OcdSuggestionSymbolMapping,
): Promise<AppendSuggestionsResult> {
  const ocadFile = await readOcad(sourceBuffer, { quietWarnings: true });
  const version = normalizeSourceVersion(ocadFile.header.version);
  if (version !== 12 && version !== 18) {
    throw new Error(
      "Kartförslag i OCD-export stöds bara för OCAD 12 och OCAD 2018-filer.",
    );
  }

  const specs: NewObjectSpec[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const geometry of geometries) {
    try {
      const spec = geometryToObjectSpec(geometry, mapping, ocadFile);
      if (!spec) {
        skipped++;
        warnings.push("En markering hoppades över (ogiltig geometri).");
        continue;
      }
      specs.push(spec);
    } catch (err) {
      skipped++;
      warnings.push(err instanceof Error ? err.message : "Kunde inte skapa OCAD-objekt.");
    }
  }

  if (specs.length === 0) {
    throw new Error("Inga kartförslag kunde omvandlas till OCAD-objekt.");
  }

  const result = appendNewObjects(sourceBuffer, specs);
  return {
    buffer: result.buffer,
    appended: result.appended,
    skipped,
    warnings,
  };
}
