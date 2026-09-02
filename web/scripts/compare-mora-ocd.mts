import { readFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const { readOcad, ocadToSvg } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    header: {
      version: number;
      fileType: number;
      subVersion: number;
      subSubVersion: number;
      ocadMark: number;
    };
    objects: Array<{ sym?: number; objIndex?: { _index?: number } }>;
    symbols: Array<{ symNum?: number; type?: number; description?: string }>;
    warnings: string[];
    getBounds: () => number[];
    getCrs: () => Record<string, unknown>;
    parameterStrings?: Map<number, Array<{ filename?: string; _first?: string }>>;
  }>;
  ocadToSvg: (ocadFile: unknown, options: { document: Document; exportHidden?: boolean }) => Element;
};

const { DOMImplementation, XMLSerializer } = require("xmldom") as {
  DOMImplementation: new () => {
    createDocument: (ns: null, q: null, doc: null) => Document;
  };
  XMLSerializer: new () => { serializeToString: (node: Node) => string };
};

function fileTypeMeaning(fileType: number): string {
  if (fileType === 0) return "normal map";
  if (fileType === 1) return "course setting project";
  if (fileType === 8) return "server file";
  return `unknown (${fileType})`;
}

async function analyze(filePath: string) {
  const buffer = await readFile(filePath);
  const fileTypeByte = buffer.readUInt8(2);
  const versionWord = buffer.readInt16LE(4);
  const subVersion = buffer.readUInt8(6);
  const subSubVersion = buffer.readUInt8(7);

  const tParse = Date.now();
  let parseError: string | null = null;
  let ocadFile: Awaited<ReturnType<typeof readOcad>> | null = null;
  try {
    ocadFile = await readOcad(buffer, { quietWarnings: true });
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  const parseMs = Date.now() - tParse;

  let svgBytes: number | null = null;
  let svgError: string | null = null;
  let svgMs: number | null = null;
  if (ocadFile) {
    try {
      const t0 = Date.now();
      const document = new DOMImplementation().createDocument(null, null, null);
      const svgElement = ocadToSvg(ocadFile, { document, exportHidden: true }) as Element;
      const svg = new XMLSerializer().serializeToString(svgElement);
      svgBytes = Buffer.byteLength(svg, "utf8");
      svgMs = Date.now() - t0;
    } catch (err) {
      svgError = err instanceof Error ? err.message : String(err);
    }
  }

  const symbolTypes = new Map<number, number>();
  for (const s of ocadFile?.symbols ?? []) {
    const t = s.type ?? -1;
    symbolTypes.set(t, (symbolTypes.get(t) ?? 0) + 1);
  }

  const backgrounds: string[] = [];
  const params = ocadFile?.parameterStrings as unknown;
  if (params && typeof params === "object") {
    const entries =
      params instanceof Map
        ? [...params.entries()]
        : Object.entries(params as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (String(key) !== "8" && Number(key) !== 8) continue;
      const list = Array.isArray(value) ? value : [];
      for (const item of list.slice(0, 5)) {
        const row = item as { filename?: string; _first?: string };
        backgrounds.push(row.filename ?? row._first ?? String(item).slice(0, 80));
      }
    }
  }

  return {
    fileName: path.basename(filePath),
    bytes: buffer.length,
    mb: +(buffer.length / 1_048_576).toFixed(2),
    magicOk: buffer.readUInt16LE(0) === 0x0cad,
    fileTypeByte,
    fileTypeMeaning: fileTypeMeaning(fileTypeByte),
    versionWord,
    subVersion,
    subSubVersion,
    header: ocadFile
      ? {
          ocadMark: ocadFile.header.ocadMark,
          fileType: ocadFile.header.fileType,
          fileTypeMeaning: fileTypeMeaning(ocadFile.header.fileType),
          version: ocadFile.header.version,
          subVersion: ocadFile.header.subVersion,
          subSubVersion: ocadFile.header.subSubVersion,
        }
      : null,
    parseMs,
    parseError,
    objectCount: ocadFile?.objects?.length ?? null,
    symbolCount: ocadFile?.symbols?.length ?? null,
    symbolTypes: Object.fromEntries(symbolTypes),
    warningCount: ocadFile?.warnings?.length ?? null,
    warningsSample: (ocadFile?.warnings ?? []).slice(0, 8),
    bounds: ocadFile?.getBounds?.() ?? null,
    crs: ocadFile?.getCrs?.() ?? null,
    backgrounds,
    svgBytes,
    svgMb: svgBytes != null ? +(svgBytes / 1_048_576).toFixed(2) : null,
    svgMs,
    svgError,
  };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    files.push(
      "/workspace/Exempelfil/old_ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-2_BW_20240918_ocad12.ocd",
      "/workspace/Exempelfil/ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd",
    );
  }
  const reports = [];
  for (const f of files) {
    console.error("Analyzing", f);
    reports.push(await analyze(f));
  }
  console.log(JSON.stringify(reports, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
