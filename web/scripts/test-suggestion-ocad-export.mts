/**
 * Kör: npx tsx scripts/test-suggestion-ocad-export.mts
 * Validerar att export av endast kartförslag ger läsbara OCAD-objekt
 * med giltig otp och Color (undviker OCAD DrawObjectsCmykColor-krasch).
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { markAllActiveObjectsDeleted, applyOcadTargetVersion } from "../src/lib/ocad/ocad-export-server";
import { appendSuggestionsToOcadBuffer } from "../src/lib/ocad/ocad-suggestion-export";
import { readActiveObjectIndices, readObjectIndexEntry, measureObjectByteSize } from "../src/lib/ocad/ocad-integrate";
import type { SuggestionGeometry } from "../src/lib/suggestion/types";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (input: Buffer, options?: { quietWarnings?: boolean }) => Promise<{
    header: { version: number };
    objects: Array<{
      sym: number;
      objType: number;
      otp: number;
      col: number;
      nItem: number;
      coordinates: Array<{ 0: number; 1: number; xFlags: number; yFlags: number }>;
      objIndex?: { status: number; color: number; len: number; pos: number; _index: number };
    }>;
    symbols: Array<{ symNum: number; type: number }>;
    colors?: Array<{ number: number } | undefined>;
    getBounds: () => [number, number, number, number];
  }>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  const fixture =
    process.argv[2] ??
    "/workspace/Exempelfil/ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd";

  const sourceBuffer = fs.readFileSync(fixture);
  const source = await readOcad(sourceBuffer, { quietWarnings: true });
  console.log("source version", source.header.version, "objects", source.objects.length);

  const colorNumbers = new Set(
    (source.colors ?? [])
      .filter((c): c is { number: number } => !!c && Number.isFinite(c.number))
      .map((c) => c.number),
  );
  assert(!colorNumbers.has(0), "fixture unexpectedly has color 0");

  const point = source.symbols.find((s) => s.type === 1);
  const line = source.symbols.find((s) => s.type === 2);
  const area = source.symbols.find((s) => s.type === 3);
  assert(!!point && !!line && !!area, "missing symbol types");

  const [minX, minY, maxX, maxY] = source.getBounds();
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const geometries: SuggestionGeometry[] = [
    { type: "Point", coordinates: [cx, cy] },
    {
      type: "LineString",
      coordinates: [
        [cx - 5000, cy],
        [cx + 5000, cy],
      ],
    },
    {
      type: "Polygon",
      ring: [
        [cx - 3000, cy - 3000],
        [cx + 3000, cy - 3000],
        [cx + 3000, cy + 3000],
        [cx - 3000, cy + 3000],
      ],
    },
    {
      type: "Bbox",
      bbox: { minX: cx - 2000, minY: cy - 2000, maxX: cx + 2000, maxY: cy + 2000 },
    },
  ];

  const cleared = markAllActiveObjectsDeleted(sourceBuffer);
  applyOcadTargetVersion(cleared.buffer, source.header.version, source.header.version === 18 ? 18 : 12);

  const appendResult = await appendSuggestionsToOcadBuffer(
    cleared.buffer,
    geometries,
    { point: point!.symNum, line: line!.symNum, area: area!.symNum },
    { symbolSourceBuffer: sourceBuffer },
  );

  assert(appendResult.appended === 4, `expected 4 objects, got ${appendResult.appended}`);

  const out = await readOcad(appendResult.buffer, { quietWarnings: true });
  assert(out.objects.length === 4, `expected 4 readable objects, got ${out.objects.length}`);

  for (const obj of out.objects) {
    const entry = readObjectIndexEntry(appendResult.buffer, obj.objIndex!._index);
    assert(entry != null, "missing index entry");
    const measured = measureObjectByteSize(appendResult.buffer, entry!);
    const indexColor = obj.objIndex!.color;

    console.log("exported obj", {
      index: obj.objIndex?._index,
      sym: obj.sym,
      objType: obj.objType,
      otp: obj.otp,
      col: obj.col,
      indexColor,
      len: entry!.len,
      measured,
      reserved: 32 + 8 * entry!.len,
    });

    assert(obj.otp === obj.objType, `otp ${obj.otp} !== objType ${obj.objType}`);
    assert(obj.otp >= 1 && obj.otp <= 7, `otp out of range: ${obj.otp}`);
    assert(indexColor !== 0, "index Color must not be 0 (triggers OCAD DrawObjectsCmykColor)");
    assert(colorNumbers.has(indexColor), `index Color ${indexColor} missing from color table`);
    assert(obj.col === indexColor || obj.col === -1, `TObject.col ${obj.col} vs index Color ${indexColor}`);
    assert(measured <= 32 + 8 * entry!.len, `object bytes ${measured} exceed reserved ${32 + 8 * entry!.len}`);
  }

  const active = readActiveObjectIndices(appendResult.buffer);
  assert(active.size === appendResult.appended, `active ${active.size} !== appended ${appendResult.appended}`);

  const outPath = path.join("/tmp", "suggestion-export-test.ocd");
  fs.writeFileSync(outPath, appendResult.buffer);
  console.log("wrote", outPath);
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
