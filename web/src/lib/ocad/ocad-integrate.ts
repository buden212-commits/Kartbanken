import { createRequire } from "module";
import { encodeTdPoly } from "./ocad-object-create";

const require = createRequire(import.meta.url);
const FileHeader = require("ocad2geojson/src/ocad-reader/file-header") as new (
  reader: BufferReader,
) => OcadHeader;
const ObjectIndexBlock = require("ocad2geojson/src/ocad-reader/object-index") as new (
  reader: BufferReader,
  startIndex: number,
  version: number,
) => ObjectIndexBlockType;
const BufferReader = require("ocad2geojson/src/ocad-reader/buffer-reader") as new (
  buffer: Buffer,
) => BufferReader;

type BufferReader = {
  push: (offset: number) => void;
  pop: () => void;
  offset: number;
  buffer: Buffer;
};

type OcadHeader = {
  isValid: () => boolean;
  version: number;
  objectIndexBlock: number;
};

type ObjectIndexBlockType = {
  table: Array<{
    rc: unknown;
    pos: number;
    len: number;
    sym: number;
    objType: number;
    status: number;
    _index: number;
  }>;
  nextObjectIndexBlock: number;
};

const TObjectModule = require("ocad2geojson/src/ocad-reader/tobject") as {
  TObject: unknown;
  10: new (reader: BufferReader, objIndex: { objType: number; _index: number }) => unknown;
  11: new (reader: BufferReader, objIndex: { objType: number; _index: number }) => unknown;
  12: new (reader: BufferReader, objIndex: { objType: number; _index: number }) => unknown;
  2018: new (reader: BufferReader, objIndex: { objType: number; _index: number }) => unknown;
};

const OBJECT_INDEX_BLOCK_HEADER_SIZE = 4;
const OBJECT_INDEX_ENTRY_SIZE = 40;
const OBJECT_INDEX_ENTRIES_PER_BLOCK = 256;
const OBJECT_INDEX_POS_OFFSET = 16;
const OBJECT_INDEX_LEN_OFFSET = 20;
const OBJECT_INDEX_SYM_OFFSET = 24;
const OBJECT_INDEX_OBJTYPE_OFFSET = 28;
const OBJECT_INDEX_ENCRYPTED_OFFSET = 29;
const OBJECT_INDEX_STATUS_OFFSET = 30;
const OBJECT_INDEX_VIEWTYPE_OFFSET = 31;
const OBJECT_INDEX_COLOR_OFFSET = 32;

export type NewObjectSpec = {
  objectBytes: Buffer;
  sym: number;
  objType: number;
  /** Object index Color (SmallInt). Must be a valid color number — 0 crashes OCAD redraw on many maps. */
  color: number;
  len: number;
  rc: { minX: number; minY: number; maxX: number; maxY: number };
};

export type ObjectIndexEntryInfo = {
  objectIndex: number;
  entryOffset: number;
  blockStart: number;
  slotIndex: number;
  pos: number;
  len: number;
  status: number;
  sym: number;
  objType: number;
};

export type AppendObjectFailure = {
  checkinObjectIndex: number;
  reason: string;
};

export type AppendObjectsResult = {
  buffer: Buffer;
  appended: number;
  failed: AppendObjectFailure[];
  /** checkin objectIndex → new head objectIndex */
  indexMap: Record<number, number>;
};

/** OCAD reserved object size in bytes (see OCAD format spec). */
export function objectByteSizeFromLen(len: number): number {
  if (len <= 0) return 0;
  return 32 + 8 * len;
}

function readHeader(buffer: Buffer): OcadHeader {
  const reader = new BufferReader(buffer);
  const header = new FileHeader(reader);
  if (!header.isValid()) {
    throw new Error("Ogiltig OCAD-fil");
  }
  return header;
}

function parseEntryAt(buffer: Buffer, entryOffset: number, objectIndex: number): ObjectIndexEntryInfo {
  return {
    objectIndex,
    entryOffset,
    blockStart: 0,
    slotIndex: 0,
    pos: buffer.readInt32LE(entryOffset + OBJECT_INDEX_POS_OFFSET),
    len: buffer.readInt32LE(entryOffset + OBJECT_INDEX_LEN_OFFSET),
    status: buffer.readUInt8(entryOffset + OBJECT_INDEX_STATUS_OFFSET),
    sym: buffer.readInt32LE(entryOffset + OBJECT_INDEX_SYM_OFFSET),
    objType: buffer.readUInt8(entryOffset + OBJECT_INDEX_OBJTYPE_OFFSET),
  };
}

function resolveOcadVersion(version: number): 10 | 11 | 12 {
  if (version === 10) return 10;
  if (version === 11) return 11;
  return 12;
}

/** Actual serialized object size (falls back to reserved len-based size). */
export function measureObjectByteSize(buffer: Buffer, entry: ObjectIndexEntryInfo): number {
  const reader = new BufferReader(buffer);
  const header = readHeader(buffer);
  const version = resolveOcadVersion(header.version);
  const TObjectClass = TObjectModule[version] ?? TObjectModule[12];

  reader.push(entry.pos);
  try {
    new TObjectClass(reader, { objType: entry.objType, _index: entry.objectIndex });
    const measured = reader.offset - entry.pos;
    if (measured > 0) return measured;
  } catch {
    // fall through to reserved/available size
  }

  const reserved = objectByteSizeFromLen(entry.len);
  const available = Math.max(0, buffer.length - entry.pos);
  if (reserved > 0 && available > 0) {
    return Math.min(reserved, available);
  }
  return available;
}

export function readObjectIndexEntry(
  buffer: Buffer,
  objectIndex: number,
): ObjectIndexEntryInfo | null {
  const reader = new BufferReader(buffer);
  const header = readHeader(buffer);

  let blockStart = header.objectIndexBlock;
  let startIndex = 0;

  while (blockStart) {
    reader.push(blockStart);
    const block = new ObjectIndexBlock(reader, startIndex, header.version);
    reader.pop();

    for (let slotIndex = 0; slotIndex < block.table.length; slotIndex++) {
      const index = startIndex + slotIndex;
      if (index !== objectIndex) continue;

      const entryOffset =
        blockStart + OBJECT_INDEX_BLOCK_HEADER_SIZE + slotIndex * OBJECT_INDEX_ENTRY_SIZE;
      const info = parseEntryAt(buffer, entryOffset, objectIndex);
      info.blockStart = blockStart;
      info.slotIndex = slotIndex;
      return info;
    }

    startIndex += OBJECT_INDEX_ENTRIES_PER_BLOCK;
    blockStart = block.nextObjectIndexBlock;
  }

  return null;
}

type IndexSlot = {
  objectIndex: number;
  entryOffset: number;
  blockStart: number;
  slotIndex: number;
};

function iterateAllIndexSlots(buffer: Buffer, visit: (slot: IndexSlot) => void): void {
  const reader = new BufferReader(buffer);
  const header = readHeader(buffer);

  let blockStart = header.objectIndexBlock;
  let startIndex = 0;

  while (blockStart) {
    reader.push(blockStart);
    const block = new ObjectIndexBlock(reader, startIndex, header.version);
    reader.pop();

    for (let slotIndex = 0; slotIndex < block.table.length; slotIndex++) {
      const entryOffset =
        blockStart + OBJECT_INDEX_BLOCK_HEADER_SIZE + slotIndex * OBJECT_INDEX_ENTRY_SIZE;
      visit({
        objectIndex: startIndex + slotIndex,
        entryOffset,
        blockStart,
        slotIndex,
      });
    }

    startIndex += OBJECT_INDEX_ENTRIES_PER_BLOCK;
    blockStart = block.nextObjectIndexBlock;
  }
}

function isFreeIndexSlot(buffer: Buffer, entryOffset: number): boolean {
  const pos = buffer.readInt32LE(entryOffset + OBJECT_INDEX_POS_OFFSET);
  const status = buffer.readUInt8(entryOffset + OBJECT_INDEX_STATUS_OFFSET);
  return status === 0 || pos === 0;
}

function findFreeIndexSlot(buffer: Buffer): IndexSlot | null {
  let found: IndexSlot | null = null;
  iterateAllIndexSlots(buffer, (slot) => {
    if (found) return;
    if (isFreeIndexSlot(buffer, slot.entryOffset)) {
      found = slot;
    }
  });
  return found;
}

function findLastIndexBlockStart(buffer: Buffer): number {
  const reader = new BufferReader(buffer);
  const header = readHeader(buffer);

  let blockStart = header.objectIndexBlock;
  let last = blockStart;

  while (blockStart) {
    last = blockStart;
    reader.push(blockStart);
    const block = new ObjectIndexBlock(reader, 0, header.version);
    reader.pop();
    if (!block.nextObjectIndexBlock) break;
    blockStart = block.nextObjectIndexBlock;
  }

  return last;
}

function appendObjectIndexBlock(buffer: Buffer): { buffer: Buffer; slot: IndexSlot } {
  const lastBlockStart = findLastIndexBlockStart(buffer);
  const newBlockStart = buffer.length;

  const linked = Buffer.from(buffer);
  linked.writeInt32LE(newBlockStart, lastBlockStart);

  const emptyBlock = Buffer.alloc(
    OBJECT_INDEX_BLOCK_HEADER_SIZE + OBJECT_INDEX_ENTRY_SIZE * OBJECT_INDEX_ENTRIES_PER_BLOCK,
  );
  const extended = Buffer.concat([linked, emptyBlock]);

  const reader = new BufferReader(extended);
  const header = readHeader(extended);
  let blockStart = header.objectIndexBlock;
  let start = 0;
  while (blockStart) {
    if (blockStart === newBlockStart) {
      return {
        buffer: extended,
        slot: {
          objectIndex: start,
          entryOffset: newBlockStart + OBJECT_INDEX_BLOCK_HEADER_SIZE,
          blockStart: newBlockStart,
          slotIndex: 0,
        },
      };
    }
    reader.push(blockStart);
    const block = new ObjectIndexBlock(reader, start, header.version);
    reader.pop();
    start += OBJECT_INDEX_ENTRIES_PER_BLOCK;
    blockStart = block.nextObjectIndexBlock;
  }

  throw new Error("Kunde inte allokera nytt object index block");
}

function allocateIndexSlot(buffer: Buffer): { buffer: Buffer; slot: IndexSlot } {
  const free = findFreeIndexSlot(buffer);
  if (free) {
    return { buffer, slot: free };
  }
  const appended = appendObjectIndexBlock(buffer);
  return { buffer: Buffer.from(appended.buffer), slot: appended.slot };
}

function copyObjectBytes(source: Buffer, entry: ObjectIndexEntryInfo): Buffer | null {
  const size = measureObjectByteSize(source, entry);
  if (size <= 0 || entry.pos <= 0 || entry.pos + size > source.length) {
    return null;
  }
  return Buffer.from(source.subarray(entry.pos, entry.pos + size));
}

/**
 * Appends objects from checkin into head by copying raw object bytes and
 * registering them in head's object index (reusing deleted slots or new blocks).
 */
export function appendObjectsFromCheckin(
  headBuffer: Buffer,
  checkinBuffer: Buffer,
  checkinObjectIndices: number[],
): AppendObjectsResult {
  let buffer = Buffer.from(headBuffer);
  const failed: AppendObjectFailure[] = [];
  const indexMap: Record<number, number> = {};
  let appended = 0;

  for (const checkinIndex of checkinObjectIndices) {
    const checkinEntry = readObjectIndexEntry(checkinBuffer, checkinIndex);
    if (!checkinEntry) {
      failed.push({
        checkinObjectIndex: checkinIndex,
        reason: "Objektet saknas i checkin-filens index.",
      });
      continue;
    }

    if (checkinEntry.status <= 0 || checkinEntry.status >= 3) {
      failed.push({
        checkinObjectIndex: checkinIndex,
        reason: "Objektet är markerat som borttaget i checkin-filen.",
      });
      continue;
    }

    const objectBytes = copyObjectBytes(checkinBuffer, checkinEntry);
    if (!objectBytes) {
      failed.push({
        checkinObjectIndex: checkinIndex,
        reason: "Kunde inte läsa objektets rådata från checkin-filen.",
      });
      continue;
    }

    const allocated = allocateIndexSlot(buffer);
    buffer = Buffer.from(allocated.buffer);
    const slot = allocated.slot;

    const newPos = buffer.length;
    buffer = Buffer.concat([buffer, objectBytes]);

    const sourceEntryBytes = checkinBuffer.subarray(
      checkinEntry.entryOffset,
      checkinEntry.entryOffset + OBJECT_INDEX_ENTRY_SIZE,
    );
    sourceEntryBytes.copy(buffer, slot.entryOffset);
    buffer.writeInt32LE(newPos, slot.entryOffset + OBJECT_INDEX_POS_OFFSET);
    buffer.writeUInt8(1, slot.entryOffset + OBJECT_INDEX_STATUS_OFFSET);

    indexMap[checkinIndex] = slot.objectIndex;
    appended++;
  }

  return { buffer, appended, failed, indexMap };
}

function writeObjectIndexRc(
  buffer: Buffer,
  entryOffset: number,
  rc: NewObjectSpec["rc"],
): void {
  const [minXEnc, minYEnc] = encodeTdPoly(rc.minX, rc.minY);
  const [maxXEnc, maxYEnc] = encodeTdPoly(rc.maxX, rc.maxY);
  buffer.writeInt32LE(minXEnc, entryOffset);
  buffer.writeInt32LE(minYEnc, entryOffset + 4);
  buffer.writeInt32LE(maxXEnc, entryOffset + 8);
  buffer.writeInt32LE(maxYEnc, entryOffset + 12);
}

function normalizeIndexColor(color: number): number {
  if (!Number.isFinite(color)) return 1;
  const rounded = Math.round(color);
  // SmallInt range; 0 is invalid on typical ISOM palettes (colors start at 1).
  if (rounded === 0) return 1;
  return Math.max(-32768, Math.min(32767, rounded));
}

/** Appends newly serialized object bytes and registers them in the object index. */
export function appendNewObjects(
  headBuffer: Buffer,
  objects: NewObjectSpec[],
): { buffer: Buffer; appended: number; objectIndices: number[] } {
  if (objects.length === 0) {
    return { buffer: headBuffer, appended: 0, objectIndices: [] };
  }

  let buffer = Buffer.from(headBuffer);
  const objectIndices: number[] = [];
  let appended = 0;

  for (const spec of objects) {
    const allocated = allocateIndexSlot(buffer);
    buffer = Buffer.from(allocated.buffer);
    const slot = allocated.slot;

    const newPos = buffer.length;
    buffer = Buffer.concat([buffer, spec.objectBytes]);

    // Skriv hela indexposten explicit — efter soft-delete finns inga aktiva
    // mallposter, och Color=0 (nollfyllning) gör att OCAD kraschar i redraw.
    buffer.fill(0, slot.entryOffset, slot.entryOffset + OBJECT_INDEX_ENTRY_SIZE);
    writeObjectIndexRc(buffer, slot.entryOffset, spec.rc);
    buffer.writeInt32LE(newPos, slot.entryOffset + OBJECT_INDEX_POS_OFFSET);
    buffer.writeInt32LE(spec.len, slot.entryOffset + OBJECT_INDEX_LEN_OFFSET);
    buffer.writeInt32LE(spec.sym, slot.entryOffset + OBJECT_INDEX_SYM_OFFSET);
    buffer.writeUInt8(spec.objType, slot.entryOffset + OBJECT_INDEX_OBJTYPE_OFFSET);
    buffer.writeUInt8(0, slot.entryOffset + OBJECT_INDEX_ENCRYPTED_OFFSET);
    buffer.writeUInt8(1, slot.entryOffset + OBJECT_INDEX_STATUS_OFFSET);
    buffer.writeUInt8(0, slot.entryOffset + OBJECT_INDEX_VIEWTYPE_OFFSET);
    buffer.writeInt16LE(
      normalizeIndexColor(spec.color),
      slot.entryOffset + OBJECT_INDEX_COLOR_OFFSET,
    );

    objectIndices.push(slot.objectIndex);
    appended++;
  }

  return { buffer, appended, objectIndices };
}

export function readActiveObjectIndices(buffer: Buffer): Set<number> {
  const indices = new Set<number>();
  iterateAllIndexSlots(buffer, (slot) => {
    const status = buffer.readUInt8(slot.entryOffset + OBJECT_INDEX_STATUS_OFFSET);
    const pos = buffer.readInt32LE(slot.entryOffset + OBJECT_INDEX_POS_OFFSET);
    if (status > 0 && status < 3 && pos > 0) {
      indices.add(slot.objectIndex);
    }
  });
  return indices;
}

/**
 * Lightweight structural check (header + object index). Avoids full GeoJSON parse,
 * which OOMs on large maps like Mora Väst during admin integration.
 */
export function validateOcadBufferStructure(buffer: Buffer): {
  version: number;
  activeObjects: number;
  bytes: number;
} {
  if (!buffer?.byteLength) {
    throw new Error("Tom OCAD-buffer efter sammanslagning");
  }
  const header = readHeader(buffer);
  if (!header.objectIndexBlock || header.objectIndexBlock <= 0) {
    throw new Error("OCAD-filen saknar objektindex efter sammanslagning");
  }
  const activeObjects = readActiveObjectIndices(buffer).size;
  return {
    version: header.version,
    activeObjects,
    bytes: buffer.byteLength,
  };
}
