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
  OCAD_LINE_TEXT_SYMBOL,
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

export type AppendSuggestionsOptions = {
  /** Read symbol definitions/templates from this buffer (defaults to target buffer). */
  symbolSourceBuffer?: Buffer;
};

export type AppendSuggestionsResult = {
  buffer: Buffer;
  appended: number;
  skipped: number;
  warnings: string[];
};

const CORNER_Y_FLAG = 0x01;

type OcadFileData = Awaited<ReturnType<typeof readOcad>>;

function isActiveObject(obj: { objIndex?: { status: number } }): boolean {
  const status = obj.objIndex?.status;
  return status != null && status > 0 && status < 3;
}

function geometryLabel(geometry: SuggestionGeometry, index: number): string {
  if (geometry.type === "Point" && geometry.intent === "delete") {
    return `Markering ${index + 1} (radera objekt)`;
  }
  switch (geometry.type) {
    case "Point":
      return `Markering ${index + 1} (punkt)`;
    case "LineString":
      return `Markering ${index + 1} (linje)`;
    case "Polygon":
      return `Markering ${index + 1} (polygon)`;
    case "Bbox":
      return `Markering ${index + 1} (rektangel)`;
  }
}

function templateFromObject(
  obj: OcadFileData["objects"][number],
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
  ocadFile: OcadFileData,
  sym: number,
  objType: number,
): OcadFileData["objects"][number] | null {
  const preferred = ocadFile.objects.find(
    (obj) => isActiveObject(obj) && obj.sym === sym && obj.objType === objType,
  );
  if (preferred) return preferred;

  return (
    ocadFile.objects.find((obj) => isActiveObject(obj) && obj.objType === objType) ?? null
  );
}

function inferSymbolTypeFromObjects(ocadFile: OcadFileData, sym: number): number | null {
  const objectTypes = new Set(
    ocadFile.objects
      .filter((obj) => isActiveObject(obj) && obj.sym === sym)
      .map((obj) => obj.objType),
  );
  if (objectTypes.has(OCAD_POINT_OBJECT)) return OCAD_POINT_SYMBOL;
  if (objectTypes.has(OCAD_LINE_OBJECT)) return OCAD_LINE_SYMBOL;
  if (objectTypes.has(OCAD_AREA_OBJECT)) return OCAD_AREA_SYMBOL;
  return null;
}

function resolveSymbolType(
  ocadFile: OcadFileData,
  sym: number,
): number | null {
  const symbol = ocadFile.symbols.find((entry) => entry.symNum === sym);
  if (symbol && Number.isFinite(symbol.type)) return symbol.type;
  return inferSymbolTypeFromObjects(ocadFile, sym);
}

function assertSymbolType(
  ocadFile: OcadFileData,
  sym: number,
  expectedTypes: number[],
  label: string,
  geometryName: string,
): void {
  const symbolType = resolveSymbolType(ocadFile, sym);
  if (symbolType == null) {
    throw new Error(
      `${geometryName}: symbol ${sym} finns inte i kartfilen (${label}).`,
    );
  }
  if (!expectedTypes.includes(symbolType)) {
    throw new Error(
      `${geometryName}: symbol ${sym} passar inte för ${label} (typ ${symbolType}). Välj en symbol av rätt typ i exportdialogen.`,
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
  ocadFile: OcadFileData,
  geometryName: string,
): NewObjectSpec | null {
  switch (geometry.type) {
    case "Point": {
      assertSymbolType(
        ocadFile,
        mapping.point,
        [OCAD_POINT_SYMBOL],
        "punkt",
        geometryName,
      );
      const templateObj = findTemplateObject(ocadFile, mapping.point, OCAD_POINT_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.point)
        : defaultTObject12Template(mapping.point);
      const [x, y] = geometry.coordinates;
      return buildObjectSpec(template, [{ x, y }], OCAD_POINT_OBJECT);
    }
    case "LineString": {
      assertSymbolType(
        ocadFile,
        mapping.line,
        [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL],
        "linje",
        geometryName,
      );
      const templateObj = findTemplateObject(ocadFile, mapping.line, OCAD_LINE_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.line)
        : defaultTObject12Template(mapping.line);
      const coords = geometry.coordinates.map(([x, y]) => ({ x, y }));
      if (coords.length < 2) {
        throw new Error(`${geometryName}: linjen har för få punkter (minst 2 krävs).`);
      }
      return buildObjectSpec(template, coords, OCAD_LINE_OBJECT);
    }
    case "Polygon": {
      assertSymbolType(
        ocadFile,
        mapping.area,
        [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL],
        "yta",
        geometryName,
      );
      const templateObj = findTemplateObject(ocadFile, mapping.area, OCAD_AREA_OBJECT);
      const template = templateObj
        ? templateFromObject(templateObj, mapping.area)
        : defaultTObject12Template(mapping.area);
      const ring = geometry.ring;
      if (ring.length < 3) {
        throw new Error(`${geometryName}: polygonen har för få hörn (minst 3 krävs).`);
      }

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
        geometryName,
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
  targetBuffer: Buffer,
  geometries: SuggestionGeometry[],
  mapping: OcdSuggestionSymbolMapping,
  options?: AppendSuggestionsOptions,
): Promise<AppendSuggestionsResult> {
  const symbolBuffer = options?.symbolSourceBuffer ?? targetBuffer;
  const [targetFile, symbolFile] = await Promise.all([
    readOcad(targetBuffer, { quietWarnings: true }),
    symbolBuffer === targetBuffer
      ? Promise.resolve(null as OcadFileData | null)
      : readOcad(symbolBuffer, { quietWarnings: true }),
  ]);
  const symbolSource = symbolFile ?? targetFile;

  const version = normalizeSourceVersion(symbolSource.header.version);
  if (version !== 12 && version !== 18) {
    throw new Error(
      "Kartförslag i OCD-export stöds bara för OCAD 12 och OCAD 2018-filer.",
    );
  }

  const specs: NewObjectSpec[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const [index, geometry] of geometries.entries()) {
    if (geometry.type === "Point" && geometry.intent === "delete") {
      skipped++;
      warnings.push(`${geometryLabel(geometry, index)}: hoppades över vid OCD-export (raderingsmarkering).`);
      continue;
    }
    const label = geometryLabel(geometry, index);
    try {
      const spec = geometryToObjectSpec(geometry, mapping, symbolSource, label);
      if (!spec) {
        skipped++;
        warnings.push(`${label}: ogiltig geometri.`);
        continue;
      }
      specs.push(spec);
    } catch (err) {
      skipped++;
      warnings.push(err instanceof Error ? err.message : `${label}: kunde inte skapa OCAD-objekt.`);
    }
  }

  if (specs.length === 0) {
    const detail =
      warnings.length > 0
        ? warnings.slice(0, 5).join(" ")
        : "Kontrollera att markeringarna har giltig geometri.";
    throw new Error(`Inga kartförslag kunde omvandlas till OCAD-objekt. ${detail}`);
  }

  const result = appendNewObjects(targetBuffer, specs);
  return {
    buffer: result.buffer,
    appended: result.appended,
    skipped,
    warnings,
  };
}
