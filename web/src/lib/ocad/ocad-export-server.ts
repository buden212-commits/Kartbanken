import { createRequire } from "module";
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

export type { CropOcadOptions, CropOcadResult, OcadExportVersion } from "./ocad-export-shared";
