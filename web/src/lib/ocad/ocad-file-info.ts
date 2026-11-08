import { createRequire } from "module";
import { collectActiveIndexEntries } from "./ocad-integrate";

const require = createRequire(import.meta.url);
const BufferReader = require("ocad2geojson/src/ocad-reader/buffer-reader") as new (
  buffer: Buffer,
) => { push: (offset: number) => void; pop: () => void };
const FileHeader = require("ocad2geojson/src/ocad-reader/file-header") as new (
  reader: unknown,
) => { isValid: () => boolean; version: number; objectIndexBlock: number; stringIndexBlock: number };
const StringIndexBlock = require("ocad2geojson/src/ocad-reader/string-index") as new (
  reader: unknown,
) => {
  nextStringIndexBlock: number;
  getStrings: (reader: unknown) => Record<string, Array<{ values: Record<string, unknown> }>>;
};

/** OCAD object byte layouts: 10, 11 and 12 (= 2018 and later). */
export type OcadObjectFormat = 10 | 11 | 12;

export function ocadObjectFormat(version: number): OcadObjectFormat | null {
  if (version === 10) return 10;
  if (version === 11) return 11;
  if (version === 12 || version === 18 || version >= 2018) return 12;
  return null;
}

export function ocadVersionLabel(version: number): string {
  if (version === 18) return "2018";
  return String(version);
}

export type OcadScaleParams = {
  scale: number;
  offsetX: number;
  offsetY: number;
  angle: number;
};

export type OcadFileInfo = {
  version: number;
  objectFormat: OcadObjectFormat | null;
  activeObjects: number;
  scaleParams: OcadScaleParams | null;
};

function numberParam(values: Record<string, unknown>, key: string): number {
  const raw = values[key];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) ? value : 0;
}

/** Scale/georef parameter string (record type 1039) without parsing objects/symbols. */
function readScaleParams(buffer: Buffer, stringIndexBlock: number): OcadScaleParams | null {
  const reader = new BufferReader(buffer);
  let offset = stringIndexBlock;
  let guard = 0;
  while (offset && offset < buffer.length && guard++ < 10_000) {
    reader.push(offset);
    const block = new StringIndexBlock(reader);
    reader.pop();
    const strings = block.getStrings(reader);
    const scalePar = strings["1039"]?.[0]?.values;
    if (scalePar) {
      return {
        scale: numberParam(scalePar, "m"),
        offsetX: numberParam(scalePar, "x"),
        offsetY: numberParam(scalePar, "y"),
        angle: numberParam(scalePar, "a"),
      };
    }
    offset = block.nextStringIndexBlock;
  }
  return null;
}

/** Cheap structural read: header, object index and scale parameters. Throws on invalid files. */
export function readOcadFileInfo(buffer: Buffer): OcadFileInfo {
  if (!buffer?.byteLength) throw new Error("Filen är tom");
  const header = new FileHeader(new BufferReader(buffer));
  if (!header.isValid()) throw new Error("Filen är inte en OCAD-fil");
  if (!header.objectIndexBlock || header.objectIndexBlock >= buffer.length) {
    throw new Error("OCAD-filen saknar objektindex");
  }

  let scaleParams: OcadScaleParams | null = null;
  try {
    scaleParams = header.stringIndexBlock ? readScaleParams(buffer, header.stringIndexBlock) : null;
  } catch {
    scaleParams = null;
  }

  const entries = collectActiveIndexEntries(buffer);
  for (const entry of entries.values()) {
    if (entry.pos >= buffer.length) {
      throw new Error("OCAD-filen är trasig (objekt pekar utanför filen) — spara om den i OCAD");
    }
  }

  return {
    version: header.version,
    objectFormat: ocadObjectFormat(header.version),
    activeObjects: entries.size,
    scaleParams,
  };
}
