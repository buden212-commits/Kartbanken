import { createRequire } from "module";
import {
  measureObjectByteSize,
  readObjectIndexEntry,
} from "@/lib/ocad/ocad-integrate";
import {
  buildVersionWarning,
  normalizeSourceVersion,
  OCAD_EXPORT_VERSIONS,
  type CropBbox,
  type CropOcadOptions,
  type CropOcadResult,
} from "./ocad-export-shared";

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
  buffer: Buffer;
};

type OcadHeader = {
  isValid: () => boolean;
  version: number;
  objectIndexBlock: number;
};

type OcadPoint = {
  0: number;
  1: number;
  x?: number;
  y?: number;
};

type ObjectIndexEntry = {
  rc: {
    min: OcadPoint;
    max: OcadPoint;
  };
  pos: number;
  status: number;
};

type ObjectIndexBlockType = {
  table: ObjectIndexEntry[];
  nextObjectIndexBlock: number;
};

const HEADER_VERSION_OFFSET = 4;
const HEADER_CURRENT_FILE_VERSION_OFFSET = 20;
const OBJECT_INDEX_BLOCK_HEADER_SIZE = 4;
const OBJECT_INDEX_ENTRY_SIZE = 40;
const OBJECT_INDEX_LEN_OFFSET = 20;
const OBJECT_INDEX_SYM_OFFSET = 24;
const OBJECT_INDEX_OBJTYPE_OFFSET = 28;
const OBJECT_INDEX_STATUS_OFFSET = 30;

const SUPPORTED_SOURCE_VERSIONS = new Set([10, 11, 12, 18]);

function pointXY(point: OcadPoint): [number, number] {
  const x = typeof point.x === "number" ? point.x : point[0];
  const y = typeof point.y === "number" ? point.y : point[1];
  return [x, y];
}

function rectIntersectsBbox(rc: ObjectIndexEntry["rc"], bbox: CropBbox): boolean {
  const [minXRaw, minYRaw] = pointXY(rc.min);
  const [maxXRaw, maxYRaw] = pointXY(rc.max);

  const rcMinX = Math.min(minXRaw, maxXRaw);
  const rcMaxX = Math.max(minXRaw, maxXRaw);
  const rcMinY = Math.min(minYRaw, maxYRaw);
  const rcMaxY = Math.max(minYRaw, maxYRaw);

  if (![rcMinX, rcMaxX, rcMinY, rcMaxY].every(Number.isFinite)) {
    return false;
  }

  const minX = bbox.x;
  const minY = bbox.y;
  const maxX = bbox.x + bbox.width;
  const maxY = bbox.y + bbox.height;
  return rcMinX <= maxX && rcMaxX >= minX && rcMinY <= maxY && rcMaxY >= minY;
}

export function cropOcadBuffer(buffer: Buffer, options: CropOcadOptions): CropOcadResult {
  const reader = new BufferReader(buffer);
  const header = new FileHeader(reader);

  if (!header.isValid()) {
    throw new Error("Ogiltig OCAD-fil");
  }

  const sourceVersion = normalizeSourceVersion(header.version);
  if (!SUPPORTED_SOURCE_VERSIONS.has(sourceVersion)) {
    throw new Error(
      `OCAD version ${header.version} stöds inte för export. Stödda versioner: 10, 11, 12 och 2018.`,
    );
  }

  if (!OCAD_EXPORT_VERSIONS.some((v) => v.value === options.targetVersion)) {
    throw new Error("Ogiltig målversion för OCAD-export");
  }

  const output = Buffer.from(buffer);
  let keptObjects = 0;
  let removedObjects = 0;

  let objectIndexOffset = header.objectIndexBlock;
  let startIndex = 0;

  while (objectIndexOffset) {
    const blockStart = objectIndexOffset;
    reader.push(objectIndexOffset);
    const block = new ObjectIndexBlock(reader, startIndex, header.version);
    reader.pop();

    for (let i = 0; i < block.table.length; i++) {
      const entry = block.table[i];
      if (!entry?.pos || entry.status <= 0 || entry.status >= 3) continue;

      const entryOffset =
        blockStart + OBJECT_INDEX_BLOCK_HEADER_SIZE + i * OBJECT_INDEX_ENTRY_SIZE;
      const statusOffset = entryOffset + OBJECT_INDEX_STATUS_OFFSET;

      if (rectIntersectsBbox(entry.rc, options.bbox)) {
        keptObjects++;
      } else {
        output.writeUInt8(0, statusOffset);
        removedObjects++;
      }
    }

    startIndex += 256;
    objectIndexOffset = block.nextObjectIndexBlock;
  }

  if (keptObjects === 0) {
    throw new Error("Inga objekt i exportområdet. Flytta ramen och försök igen.");
  }

  const targetVersion = options.targetVersion;
  if (targetVersion !== sourceVersion) {
    output.writeInt16LE(targetVersion, HEADER_VERSION_OFFSET);
    output.writeInt32LE(targetVersion, HEADER_CURRENT_FILE_VERSION_OFFSET);
  }

  return {
    buffer: output,
    sourceVersion,
    targetVersion,
    keptObjects,
    removedObjects,
    versionWarning: buildVersionWarning(sourceVersion, targetVersion),
  };
}

function iterateActiveObjectEntries(
  buffer: Buffer,
  callback: (entry: ObjectIndexEntry, statusOffset: number, objectIndex: number) => void,
): void {
  const reader = new BufferReader(buffer);
  const header = new FileHeader(reader);
  if (!header.isValid()) {
    throw new Error("Ogiltig OCAD-fil");
  }

  let objectIndexOffset = header.objectIndexBlock;
  let startIndex = 0;

  while (objectIndexOffset) {
    const blockStart = objectIndexOffset;
    reader.push(objectIndexOffset);
    const block = new ObjectIndexBlock(reader, startIndex, header.version);
    reader.pop();

    for (let i = 0; i < block.table.length; i++) {
      const entry = block.table[i];
      if (!entry?.pos || entry.status <= 0 || entry.status >= 3) continue;

      const entryOffset =
        blockStart + OBJECT_INDEX_BLOCK_HEADER_SIZE + i * OBJECT_INDEX_ENTRY_SIZE;
      const statusOffset = entryOffset + OBJECT_INDEX_STATUS_OFFSET;
      callback(entry, statusOffset, startIndex + i);
    }

    startIndex += 256;
    objectIndexOffset = block.nextObjectIndexBlock;
  }
}

/** Marks OCAD objects deleted by their object index (mutates buffer in place). */
export function markObjectsDeletedByIndices(
  buffer: Buffer,
  objectIndices: Set<number>,
): { deleted: number } {
  let deleted = 0;

  iterateActiveObjectEntries(buffer, (_entry, statusOffset, objectIndex) => {
    if (objectIndices.has(objectIndex)) {
      buffer.writeUInt8(0, statusOffset);
      deleted++;
    }
  });

  return { deleted };
}

/**
 * Keeps only the given object indices; all other active objects are marked deleted.
 * Returns a new buffer suitable for downloading a focused .ocd of problem objects.
 */
export function exportObjectsByIndices(
  sourceBuffer: Buffer,
  objectIndices: Set<number>,
): { buffer: Buffer; keptObjects: number; removedObjects: number } {
  if (objectIndices.size === 0) {
    throw new Error("Inga objekt angivna för export");
  }

  const output = Buffer.from(sourceBuffer);
  let keptObjects = 0;
  let removedObjects = 0;

  iterateActiveObjectEntries(output, (_entry, statusOffset, objectIndex) => {
    if (objectIndices.has(objectIndex)) {
      keptObjects++;
    } else {
      output.writeUInt8(0, statusOffset);
      removedObjects++;
    }
  });

  if (keptObjects === 0) {
    throw new Error("Inga av de angivna objekten fanns i filen");
  }

  return { buffer: output, keptObjects, removedObjects };
}

type ObjectEntryRef = {
  pos: number;
  sizeEstimate: number;
  statusOffset: number;
};

function collectObjectEntries(buffer: Buffer): Map<number, ObjectEntryRef> {
  const map = new Map<number, ObjectEntryRef>();
  iterateActiveObjectEntries(buffer, (entry, statusOffset, objectIndex) => {
    map.set(objectIndex, {
      pos: entry.pos,
      sizeEstimate: Math.max(0, pointXY(entry.rc.max)[0] - pointXY(entry.rc.min)[0]),
      statusOffset,
    });
  });
  return map;
}

/**
 * Copies raw object bytes from checkin to head when object indices match.
 * Works when object size is unchanged; new objects cannot be appended (MVP limitation).
 */
export type CopyObjectSkipReason =
  | "missing_in_head"
  | "missing_in_checkin"
  | "size_mismatch";

export type CopyObjectSkipDetail = {
  objectIndex: number;
  reason: CopyObjectSkipReason;
};

const COPY_SKIP_REASON_TEXT: Record<CopyObjectSkipReason, string> = {
  missing_in_head: "Objektet finns inte i aktuella versionen (saknat objectIndex).",
  missing_in_checkin: "Objektet finns inte i checkin-filen.",
  size_mismatch:
    "Objektets lagrade storlek skiljer sig — byte-kopiering stöds bara när storleken är oförändrad.",
};

export function copySkipReasonText(reason: CopyObjectSkipReason): string {
  return COPY_SKIP_REASON_TEXT[reason];
}

/** Copies checkin object bytes into headBuffer in place when sizes allow. */
export function copyMatchingObjectData(
  headBuffer: Buffer,
  checkinBuffer: Buffer,
  objectIndices: Set<number>,
): { copied: number; skipped: number; skippedItems: CopyObjectSkipDetail[] } {
  const headEntries = collectObjectEntries(headBuffer);
  const checkinEntries = collectObjectEntries(checkinBuffer);

  let copied = 0;
  let skipped = 0;
  const skippedItems: CopyObjectSkipDetail[] = [];

  for (const index of objectIndices) {
    const headEntry = headEntries.get(index);
    const checkinEntry = checkinEntries.get(index);
    if (!headEntry) {
      skipped++;
      skippedItems.push({ objectIndex: index, reason: "missing_in_head" });
      continue;
    }
    if (!checkinEntry) {
      skipped++;
      skippedItems.push({ objectIndex: index, reason: "missing_in_checkin" });
      continue;
    }

    const headIndexInfo = readObjectIndexEntry(headBuffer, index);
    const checkinIndexInfo = readObjectIndexEntry(checkinBuffer, index);
    if (!headIndexInfo || !checkinIndexInfo) {
      skipped++;
      skippedItems.push({ objectIndex: index, reason: "missing_in_checkin" });
      continue;
    }

    const headSize = measureObjectByteSize(headBuffer, headIndexInfo);
    const checkinSize = measureObjectByteSize(checkinBuffer, checkinIndexInfo);

    // Same-size overwrite only — growing/shrinking objects need a fuller rewrite.
    if (headSize !== checkinSize || headSize <= 0) {
      skipped++;
      skippedItems.push({ objectIndex: index, reason: "size_mismatch" });
      continue;
    }

    if (
      headEntry.pos + headSize > headBuffer.length ||
      checkinEntry.pos + checkinSize > checkinBuffer.length
    ) {
      skipped++;
      skippedItems.push({ objectIndex: index, reason: "size_mismatch" });
      continue;
    }

    checkinBuffer.copy(headBuffer, headEntry.pos, checkinEntry.pos, checkinEntry.pos + checkinSize);
    // Keep index metadata (sym/objType/len) aligned with checkin.
    if (headIndexInfo.len !== checkinIndexInfo.len) {
      headBuffer.writeInt32LE(
        checkinIndexInfo.len,
        headIndexInfo.entryOffset + OBJECT_INDEX_LEN_OFFSET,
      );
    }
    if (headIndexInfo.sym !== checkinIndexInfo.sym) {
      headBuffer.writeInt32LE(
        checkinIndexInfo.sym,
        headIndexInfo.entryOffset + OBJECT_INDEX_SYM_OFFSET,
      );
    }
    if (headIndexInfo.objType !== checkinIndexInfo.objType) {
      headBuffer.writeUInt8(
        checkinIndexInfo.objType,
        headIndexInfo.entryOffset + OBJECT_INDEX_OBJTYPE_OFFSET,
      );
    }
    copied++;
  }

  return { copied, skipped, skippedItems };
}

export type { CropOcadOptions, CropOcadResult, OcadExportVersion } from "./ocad-export-shared";
