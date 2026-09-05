import { readdir, readFile } from "fs/promises";
import path from "path";
import { createRequire } from "module";
import {
  buildSymbolNameMap,
  normalizeFromGeoJson,
  summarizeParseResult,
} from "./normalize";
import type { OcadParseSummary } from "./types";
import type { Feature, Geometry } from "geojson";

const require = createRequire(import.meta.url);
const { readOcad, ocadToGeoJson } = require("ocad2geojson") as {
  readOcad: (
    input: string | Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    header: { version: number };
    objects: unknown[];
    symbols: Array<{ symNum: number; description?: string }>;
    warnings: string[];
    getBounds: (projection?: (v: number[]) => number[]) => number[];
  }>;
  ocadToGeoJson: (
    ocadFile: unknown,
    options?: {
      applyCrs?: boolean;
      generateSymbolElements?: boolean;
      exportHidden?: boolean;
    },
  ) => { features: Feature<Geometry, { sym: number; objectIndex: number; text?: string }>[] };
};

type OcadObjectProperties = {
  sym: number;
  objectIndex: number;
  text?: string;
};

export type ParsedOcadBuffer = {
  summary: OcadParseSummary;
  /** Rå ocad2geojson-fil — återanvänds för SVG-rendering utan ny inläsning. */
  ocadFile: unknown;
};

export async function parseOcadBufferWithFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedOcadBuffer> {
  const started = Date.now();
  const ocadFile = await readOcad(buffer, { quietWarnings: true });
  // generateSymbolElements must stay false: decorative symbol parts become GeoJSON
  // features without objectIndex and would pollute diffs (tens of thousands of fakes).
  // exportHidden: true so objects the user can edit in OCAD are included in comparisons.
  const geojson = ocadToGeoJson(ocadFile, {
    applyCrs: false,
    generateSymbolElements: false,
    exportHidden: true,
  });
  const symbolNames = buildSymbolNameMap(ocadFile.symbols);
  const objects = normalizeFromGeoJson(
    geojson.features as Feature<Geometry, OcadObjectProperties>[],
    symbolNames,
  );

  return {
    summary: summarizeParseResult({
      fileName,
      fileSizeBytes: buffer.byteLength,
      parseDurationMs: Date.now() - started,
      ocadFile,
      objects,
    }),
    ocadFile,
  };
}

export async function parseOcadBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<OcadParseSummary> {
  const { summary } = await parseOcadBufferWithFile(buffer, fileName);
  return summary;
}

export async function parseOcadFile(filePath: string): Promise<OcadParseSummary> {
  const buffer = await readFile(filePath);
  return parseOcadBuffer(buffer, path.basename(filePath));
}

export async function findExampleOcdFile(repoRoot: string): Promise<string> {
  const exampleDir = path.join(repoRoot, "Exempelfil");
  const entries = await readdir(exampleDir);
  const ocd = entries.find((name) => name.toLowerCase().endsWith(".ocd"));
  if (!ocd) {
    throw new Error(`Ingen .ocd-fil hittades i ${exampleDir}`);
  }
  return path.join(exampleDir, ocd);
}

export function getRepoRoot(): string {
  return path.resolve(process.cwd(), "..");
}
