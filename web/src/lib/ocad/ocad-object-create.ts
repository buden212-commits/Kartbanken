/**
 * Minimal OCAD 12 / 2018 TObject writer for appending kartförslag geometries.
 * Based on ocad2geojson's TObject12 reader (read-only upstream).
 */

export const OCAD_POINT_OBJECT = 1;
export const OCAD_LINE_OBJECT = 2;
export const OCAD_AREA_OBJECT = 3;

export const OCAD_POINT_SYMBOL = 1;
export const OCAD_LINE_SYMBOL = 2;
export const OCAD_AREA_SYMBOL = 3;
export const OCAD_RECTANGLE_SYMBOL = 7;
/** Line-text symbol (type 6) — usable for line kartförslag. */
export const OCAD_LINE_TEXT_SYMBOL = 6;

/** Bytes before the Poly coordinate array in OCAD 12 / 2018 TObject (see ocad2geojson TObject12). */
export const TOBJECT12_HEADER_SIZE = 56;

export type OcadCoord = {
  x: number;
  y: number;
  xFlags?: number;
  yFlags?: number;
};

export type TObject12Template = {
  sym: number;
  otp: number;
  unicode: boolean;
  ang: number;
  col: number;
  lineWidth: number;
  diamFlags: number;
  serverObjectId: number;
  height: number;
  creationDate: number;
  multirepresentationId: number;
  modificationDate: number;
  nText: number;
  nObjectString: number;
  nDatabaseString: number;
  objectStringType: number;
  res1: number;
};

export function encodeTdPoly(x: number, y: number, xFlags = 0, yFlags = 0): [number, number] {
  const ix = Math.round(x);
  const iy = Math.round(y);
  return [(ix << 8) | (xFlags & 0xff), (iy << 8) | (yFlags & 0xff)];
}

export function objectLenFromByteSize(byteSize: number): number {
  if (byteSize <= 32) return 1;
  return Math.max(1, Math.ceil((byteSize - 32) / 8));
}

export function computeCoordBounds(coords: OcadCoord[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const coord of coords) {
    minX = Math.min(minX, coord.x);
    minY = Math.min(minY, coord.y);
    maxX = Math.max(maxX, coord.x);
    maxY = Math.max(maxY, coord.y);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

export function writeTObject12(template: TObject12Template, coords: OcadCoord[]): Buffer {
  const nItem = coords.length;
  const size =
    TOBJECT12_HEADER_SIZE + nItem * 8 +
    template.nText * (template.unicode ? 2 : 4) +
    template.nObjectString * (template.unicode ? 2 : 4) +
    template.nDatabaseString * (template.unicode ? 2 : 4);

  const buffer = Buffer.alloc(size);
  let offset = 0;

  const writeInt32 = (value: number) => {
    buffer.writeInt32LE(value, offset);
    offset += 4;
  };
  const writeUInt32 = (value: number) => {
    buffer.writeUInt32LE(value, offset);
    offset += 4;
  };
  const writeInt16 = (value: number) => {
    buffer.writeInt16LE(value, offset);
    offset += 2;
  };
  const writeUInt16 = (value: number) => {
    buffer.writeUInt16LE(value, offset);
    offset += 2;
  };
  const writeByte = (value: number) => {
    buffer.writeUInt8(value & 0xff, offset);
    offset += 1;
  };
  const writeDouble = (value: number) => {
    buffer.writeDoubleLE(value, offset);
    offset += 8;
  };

  writeInt32(template.sym);
  writeByte(template.otp);
  writeByte(template.unicode ? 1 : 0);
  writeInt16(template.ang);
  writeInt32(template.col);
  writeInt16(template.lineWidth);
  writeInt16(template.diamFlags);
  writeInt32(template.serverObjectId);
  writeInt32(template.height);
  writeDouble(template.creationDate);
  writeUInt32(template.multirepresentationId);
  writeDouble(template.modificationDate);
  writeUInt32(nItem);
  writeUInt16(template.nText);
  writeUInt16(template.nObjectString);
  writeUInt16(template.nDatabaseString);
  writeByte(template.objectStringType);
  writeByte(template.res1);

  for (const coord of coords) {
    const [encodedX, encodedY] = encodeTdPoly(
      coord.x,
      coord.y,
      coord.xFlags ?? 0,
      coord.yFlags ?? 0,
    );
    writeInt32(encodedX);
    writeInt32(encodedY);
  }

  return buffer.subarray(0, offset);
}

export function defaultTObject12Template(sym: number): TObject12Template {
  const now = Date.now() / 86400000 + 2415018.5;
  return {
    sym,
    otp: 0,
    unicode: true,
    ang: 0,
    col: -1,
    lineWidth: 0,
    diamFlags: 0,
    serverObjectId: 0,
    height: 0,
    creationDate: now,
    multirepresentationId: 0,
    modificationDate: now,
    nText: 0,
    nObjectString: 0,
    nDatabaseString: 0,
    objectStringType: 0,
    res1: 0,
  };
}
