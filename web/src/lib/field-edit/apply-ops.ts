import { createRequire } from "module";
import {
  computeCoordBounds,
  defaultTObject12Template,
  objectLenFromByteSize,
  OCAD_POINT_OBJECT,
  OCAD_POINT_SYMBOL,
  type OcadCoord,
  type TObject12Template,
  writeTObject12,
} from "@/lib/ocad/ocad-object-create";
import { appendNewObjects, type NewObjectSpec } from "@/lib/ocad/ocad-integrate";
import { markObjectsDeletedByIndices } from "@/lib/ocad/ocad-export-server";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { pointInPolygon } from "@/lib/checkout/overlap";
import { parseSelectionJson, CheckoutSelectionType, type CheckoutSelectionGeometry } from "@/lib/checkout/types";
import type { FieldEditOps } from "./types";

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
      objIndex?: { status: number; _index: number; color?: number };
    }>;
    symbols: Array<{ symNum: number; type: number; colors?: number[] }>;
    colors?: Array<{ number: number } | undefined>;
  }>;
};

type OcadFileData = Awaited<ReturnType<typeof readOcad>>;

function pointInSelectionGeometry(
  x: number,
  y: number,
  geometry: CheckoutSelectionGeometry,
): boolean {
  if (geometry.type === CheckoutSelectionType.BBOX) {
    const bbox = geometry.bbox;
    return x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY;
  }
  return pointInPolygon(x, y, geometry.ring);
}

function isActiveObject(obj: { objIndex?: { status: number } }): boolean {
  const status = obj.objIndex?.status;
  return status != null && status > 0 && status < 3;
}

function templateFromObject(
  obj: OcadFileData["objects"][number],
  sym: number,
): TObject12Template {
  return {
    sym,
    otp: OCAD_POINT_OBJECT,
    unicode: obj.unicode ?? true,
    ang: obj.ang ?? 0,
    col: obj.col ?? -1,
    lineWidth: obj.lineWidth ?? 0,
    diamFlags: obj.diamFlags ?? 0,
    serverObjectId: obj.serverObjectId ?? 0,
    height: obj.height ?? 0,
    creationDate: obj.creationDate ?? defaultTObject12Template(sym, OCAD_POINT_OBJECT).creationDate,
    multirepresentationId: obj.multirepresentationId ?? 0,
    modificationDate:
      obj.modificationDate ?? defaultTObject12Template(sym, OCAD_POINT_OBJECT).modificationDate,
    nText: 0,
    nObjectString: 0,
    nDatabaseString: 0,
    objectStringType: obj.objectStringType ?? 0,
    res1: obj.res1 ?? 0,
  };
}

function resolveObjectColor(ocadFile: OcadFileData, sym: number, preferred?: number | null): number {
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

function buildPointSpec(
  ocadFile: OcadFileData,
  x: number,
  y: number,
  symbolNumber: number,
): NewObjectSpec {
  const symbol = ocadFile.symbols.find((entry) => entry.symNum === symbolNumber);
  if (!symbol) {
    throw new Error(`Symbol ${symbolNumber} finns inte i kartfilen`);
  }
  if (symbol.type !== OCAD_POINT_SYMBOL) {
    throw new Error(`Symbol ${symbolNumber} är inte en punkt-symbol`);
  }

  const templateObj =
    ocadFile.objects.find(
      (obj) => isActiveObject(obj) && obj.sym === symbolNumber && obj.objType === OCAD_POINT_OBJECT,
    ) ??
    ocadFile.objects.find((obj) => isActiveObject(obj) && obj.objType === OCAD_POINT_OBJECT) ??
    null;

  const template = templateObj
    ? templateFromObject(templateObj, symbolNumber)
    : defaultTObject12Template(symbolNumber, OCAD_POINT_OBJECT);
  const color = resolveObjectColor(ocadFile, symbolNumber, templateObj?.col ?? template.col);
  const coords: OcadCoord[] = [{ x, y }];
  const objectTemplate: TObject12Template = {
    ...template,
    otp: OCAD_POINT_OBJECT,
    col: color > 0 ? color : template.col,
  };
  const objectBytes = writeTObject12(objectTemplate, coords);
  const bounds = computeCoordBounds(coords);
  return {
    objectBytes,
    sym: symbolNumber,
    objType: OCAD_POINT_OBJECT,
    color,
    len: objectLenFromByteSize(objectBytes.length),
    rc: bounds,
  };
}

export type ApplyFieldEditResult = {
  buffer: Buffer;
  deletedCount: number;
  addedCount: number;
};

export async function validateFieldEditOps(
  headBuffer: Buffer,
  fileName: string,
  selectionJson: string,
  ops: FieldEditOps,
): Promise<string | null> {
  const selection = parseSelectionJson(selectionJson);
  const parsed = await parseOcadBuffer(headBuffer, fileName);
  const scoped = new Set(
    filterObjectsInSelection(parsed.objects, selection.geometry).map((obj) => obj.objectIndex),
  );

  for (const objectIndex of ops.deletes) {
    if (!scoped.has(objectIndex)) {
      return `Objekt ${objectIndex} ligger utanför det utcheckade området`;
    }
  }

  for (const add of ops.adds) {
    if (!pointInSelectionGeometry(add.x, add.y, selection.geometry)) {
      return `Ny punkt (${Math.round(add.x)}, ${Math.round(add.y)}) ligger utanför området`;
    }
  }

  if (ops.deletes.length === 0 && ops.adds.length === 0) {
    return "Inga ändringar att publicera";
  }

  return null;
}

export async function applyFieldEditOps(
  headBuffer: Buffer,
  ops: FieldEditOps,
): Promise<ApplyFieldEditResult> {
  let working = Buffer.from(headBuffer);
  const deleteResult = markObjectsDeletedByIndices(working, new Set(ops.deletes));

  if (ops.adds.length === 0) {
    return {
      buffer: working,
      deletedCount: deleteResult.deleted,
      addedCount: 0,
    };
  }

  const ocadFile = await readOcad(working, { quietWarnings: true });
  const specs = ops.adds.map((add) => buildPointSpec(ocadFile, add.x, add.y, add.symbolNumber));
  const appendResult = appendNewObjects(working, specs);

  return {
    buffer: Buffer.from(appendResult.buffer),
    deletedCount: deleteResult.deleted,
    addedCount: appendResult.appended,
  };
}
