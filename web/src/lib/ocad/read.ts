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
    options?: { applyCrs?: boolean },
  ) => { features: Feature<Geometry, { sym: number; objectIndex: number; text?: string }>[] };
};

type OcadObjectProperties = {
  sym: number;
  objectIndex: number;
  text?: string;
};

export async function parseOcadBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<OcadParseSummary> {
  const started = Date.now();
  const ocadFile = await readOcad(buffer, { quietWarnings: true });
  const geojson = ocadToGeoJson(ocadFile, { applyCrs: false });
  const symbolNames = buildSymbolNameMap(ocadFile.symbols);
  const objects = normalizeFromGeoJson(
    geojson.features as Feature<Geometry, OcadObjectProperties>[],
    symbolNames,
  );

  return summarizeParseResult({
    fileName,
    fileSizeBytes: buffer.byteLength,
    parseDurationMs: Date.now() - started,
    ocadFile,
    objects,
  });
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
