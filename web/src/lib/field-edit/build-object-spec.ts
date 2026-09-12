import { createRequire } from "module";
import {
  computeCoordBounds,
  defaultTObject12Template,
  objectLenFromByteSize,
  OCAD_AREA_OBJECT,
  OCAD_AREA_SYMBOL,
  OCAD_LINE_OBJECT,
  OCAD_LINE_SYMBOL,
  OCAD_LINE_TEXT_SYMBOL,
  OCAD_POINT_OBJECT,
  OCAD_POINT_SYMBOL,
  OCAD_RECTANGLE_SYMBOL,
  type OcadCoord,
  type TObject12Template,
  writeTObject12,
} from "@/lib/ocad/ocad-object-create";
import type { NewObjectSpec } from "@/lib/ocad/ocad-integrate";
import type {
  FieldEditAdd,
  FieldEditGeometryKind,
  FieldEditModify,
  FieldEditVertexKind,
} from "./types";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<OcadFileData>;
};

type OcadFileData = {
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
    objIndex?: { status: number; _index: number; color?: number };
  }>;
  symbols: Array<{ symNum: number; type: number; colors?: number[] }>;
  colors?: Array<{ number: number } | undefined>;
};

const CORNER_Y_FLAG = 0x01;
const HOLE_Y_FLAG = 0x02;
const DASH_Y_FLAG = 0x08;

function yFlagsForVertexKind(kind: FieldEditVertexKind | undefined): number {
  if (kind === "corner") return CORNER_Y_FLAG;
  if (kind === "dash") return DASH_Y_FLAG;
  return 0;
}

/** Drop duplicate closing corner so we only close once when writing OCAD. */
function openRingForWrite(
  coordinates: [number, number][],
  vertexKinds?: FieldEditVertexKind[],
): { coordinates: [number, number][]; vertexKinds?: FieldEditVertexKind[] } {
  if (coordinates.length < 2) return { coordinates, vertexKinds };
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { coordinates, vertexKinds };
  }
  const open = coordinates.slice(0, -1);
  if (!vertexKinds || vertexKinds.length !== coordinates.length) {
    return { coordinates: open, vertexKinds };
  }
  return { coordinates: open, vertexKinds: vertexKinds.slice(0, -1) };
}

function isActiveObject(obj: { objIndex?: { status: number } }): boolean {
  const status = obj.objIndex?.status;
  return status != null && status > 0 && status < 3;
}

function objTypeForKind(kind: FieldEditGeometryKind): number {
  switch (kind) {
    case "line":
      return OCAD_LINE_OBJECT;
    case "area":
      return OCAD_AREA_OBJECT;
    default:
      return OCAD_POINT_OBJECT;
  }
}

function expectedSymbolTypes(kind: FieldEditGeometryKind): number[] {
  switch (kind) {
    case "line":
      return [OCAD_LINE_SYMBOL, OCAD_LINE_TEXT_SYMBOL];
    case "area":
      return [OCAD_AREA_SYMBOL, OCAD_RECTANGLE_SYMBOL];
    default:
      return [OCAD_POINT_SYMBOL];
  }
}

function templateFromObject(
  obj: OcadFileData["objects"][number],
  sym: number,
  objType: number,
): TObject12Template {
  return {
    sym,
    otp: objType,
    unicode: obj.unicode ?? true,
    ang: obj.ang ?? 0,
    col: obj.col ?? -1,
    lineWidth: obj.lineWidth ?? 0,
    diamFlags: obj.diamFlags ?? 0,
    serverObjectId: obj.serverObjectId ?? 0,
    height: obj.height ?? 0,
    creationDate: obj.creationDate ?? defaultTObject12Template(sym, objType).creationDate,
    multirepresentationId: obj.multirepresentationId ?? 0,
    modificationDate:
      obj.modificationDate ?? defaultTObject12Template(sym, objType).modificationDate,
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
  return (
    ocadFile.objects.find(
      (obj) => isActiveObject(obj) && obj.sym === sym && obj.objType === objType,
    ) ??
    ocadFile.objects.find((obj) => isActiveObject(obj) && obj.objType === objType) ??
    null
  );
}

function resolveObjectColor(
  ocadFile: OcadFileData,
  sym: number,
  preferred?: number | null,
): number {
  if (preferred != null && Number.isFinite(preferred) && preferred > 0) {
    return Math.round(preferred);
  }
  const symbol = ocadFile.symbols.find((entry) => entry.symNum === sym);
  const fromSymbol = symbol?.colors?.find((value) => Number.isFinite(value) && value > 0);
  if (fromSymbol != null) return Math.round(fromSymbol);
  const fromObject = ocadFile.objects.find(
    (obj) => isActiveObject(obj) && obj.sym === sym && obj.col != null && obj.col > 0,
  );
  if (fromObject) return Math.round(fromObject.col);
  return 1;
}

function assertSymbolType(
  ocadFile: OcadFileData,
  sym: number,
  kind: FieldEditGeometryKind,
  label: string,
): void {
  const symbol = ocadFile.symbols.find((entry) => entry.symNum === sym);
  if (!symbol) {
    throw new Error(`${label}: symbol ${sym} finns inte i kartfilen`);
  }
  if (!expectedSymbolTypes(kind).includes(symbol.type)) {
    throw new Error(`${label}: symbol ${sym} passar inte för ${kind}`);
  }
}

function buildObjectSpec(
  template: TObject12Template,
  coords: OcadCoord[],
  objType: number,
  color: number,
  sym: number,
): NewObjectSpec {
  const objectTemplate: TObject12Template = {
    ...template,
    otp: objType,
    col: color > 0 ? color : template.col,
  };
  const objectBytes = writeTObject12(objectTemplate, coords);
  const bounds = computeCoordBounds(coords);
  return {
    objectBytes,
    sym,
    objType,
    color,
    len: objectLenFromByteSize(objectBytes.length),
    rc: bounds,
  };
}

function coordsForKind(
  kind: FieldEditGeometryKind,
  coordinates: [number, number][],
  vertexKinds?: FieldEditVertexKind[],
  holes?: [number, number][][],
): OcadCoord[] {
  if (kind === "point") {
    const [x, y] = coordinates[0] ?? [0, 0];
    return [{ x, y }];
  }
  if (kind === "line") {
    if (coordinates.length < 2) {
      throw new Error("Linjen har för få punkter");
    }
    return coordinates.map(([x, y], index) => ({
      x,
      y,
      yFlags: yFlagsForVertexKind(vertexKinds?.[index]),
    }));
  }
  const opened = openRingForWrite(coordinates, vertexKinds);
  if (opened.coordinates.length < 3) {
    throw new Error("Ytan har för få hörn");
  }
  const coords: OcadCoord[] = opened.coordinates.map(([x, y], index) => ({
    x,
    y,
    yFlags: yFlagsForVertexKind(opened.vertexKinds?.[index]),
  }));
  if (!(coords[0]!.yFlags! & CORNER_Y_FLAG) && !opened.vertexKinds?.[0]) {
    coords[0]!.yFlags = CORNER_Y_FLAG;
  }
  const [fx, fy] = opened.coordinates[0]!;
  coords.push({
    x: fx,
    y: fy,
    yFlags: coords[0]!.yFlags ?? CORNER_Y_FLAG,
  });

  for (const hole of holes ?? []) {
    const holeOpen = openRingForWrite(hole);
    if (holeOpen.coordinates.length < 3) continue;
    for (let i = 0; i < holeOpen.coordinates.length; i++) {
      const [x, y] = holeOpen.coordinates[i]!;
      coords.push({
        x,
        y,
        yFlags: i === 0 ? HOLE_Y_FLAG : 0,
      });
    }
    const [hx, hy] = holeOpen.coordinates[0]!;
    coords.push({
      x: hx,
      y: hy,
      yFlags: HOLE_Y_FLAG,
    });
  }

  return coords;
}

export function buildSpecFromGeometry(
  ocadFile: OcadFileData,
  kind: FieldEditGeometryKind,
  symbolNumber: number,
  coordinates: [number, number][],
  label: string,
  vertexKinds?: FieldEditVertexKind[],
  holes?: [number, number][][],
): NewObjectSpec {
  assertSymbolType(ocadFile, symbolNumber, kind, label);
  const objType = objTypeForKind(kind);
  const templateObj = findTemplateObject(ocadFile, symbolNumber, objType);
  const template = templateObj
    ? templateFromObject(templateObj, symbolNumber, objType)
    : defaultTObject12Template(symbolNumber, objType);
  const color = resolveObjectColor(ocadFile, symbolNumber, templateObj?.col ?? template.col);
  const coords = coordsForKind(kind, coordinates, vertexKinds, holes);
  return buildObjectSpec(template, coords, objType, color, symbolNumber);
}

export function buildSpecFromAdd(ocadFile: OcadFileData, add: FieldEditAdd): NewObjectSpec {
  switch (add.kind) {
    case "point":
      return buildSpecFromGeometry(
        ocadFile,
        "point",
        add.symbolNumber,
        [[add.x, add.y]],
        "Ny punkt",
      );
    case "line":
      return buildSpecFromGeometry(
        ocadFile,
        "line",
        add.symbolNumber,
        add.coordinates,
        "Ny linje",
        add.vertexKinds,
      );
    case "area":
      return buildSpecFromGeometry(
        ocadFile,
        "area",
        add.symbolNumber,
        add.ring,
        "Ny yta",
        add.vertexKinds,
        add.holes,
      );
  }
}

export function buildSpecFromModify(ocadFile: OcadFileData, modify: FieldEditModify): NewObjectSpec {
  return buildSpecFromGeometry(
    ocadFile,
    modify.geometryKind,
    modify.symbolNumber,
    modify.coordinates,
    `Ändrat objekt ${modify.objectIndex}`,
    modify.vertexKinds,
    modify.holes,
  );
}

export async function readOcadFileData(buffer: Buffer): Promise<OcadFileData> {
  return readOcad(buffer, { quietWarnings: true });
}
