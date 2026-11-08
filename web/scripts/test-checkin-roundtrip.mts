/**
 * Kör: npm run test:checkin-roundtrip
 *
 * Jämför två versioner av samma karta (Exempelfil/Jämförelse/v11.ocd och v12.ocd),
 * tillämpar diffen som en incheckning och kontrollerar att resultatet hänger ihop.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import { applyIntegrationChanges } from "../src/lib/checkout/integrate";
import { compareOcadObjects } from "../src/lib/ocad/diff";
import {
  collectActiveIndexEntries,
  findChangedObjectsSinceReference,
  readActiveObjectIndices,
  validateOcadBufferStructure,
} from "../src/lib/ocad/ocad-integrate";
import { parseOcadBuffer, getRepoRoot } from "../src/lib/ocad/read";
import { cropOcadBuffer } from "../src/lib/ocad/ocad-export-server";
import { defaultOcadExportVersion } from "../src/lib/ocad/ocad-export-shared";
import { readOcadFileInfo } from "../src/lib/ocad/ocad-file-info";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function objectKey(symbolNumber: number, geometryHash: string, text = ""): string {
  return `${symbolNumber}\t${geometryHash}\t${text}`;
}

function countKeys(objects: Array<{ symbolNumber: number; geometryHash: string; text?: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const key = objectKey(object.symbolNumber, object.geometryHash, object.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function resolvePair(): Promise<{ older: string; newer: string }> {
  const dir = path.join(getRepoRoot(), "Exempelfil", "Jämförelse");
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".ocd")).sort();
  const v11 = names.find((name) => name.toLowerCase() === "v11.ocd");
  const v12 = names.find((name) => name.toLowerCase() === "v12.ocd");
  if (v11 && v12) {
    return { older: path.join(dir, v11), newer: path.join(dir, v12) };
  }
  if (names.length < 2) {
    throw new Error(`Behöver minst två .ocd-filer i ${dir}`);
  }
  return { older: path.join(dir, names[0]!), newer: path.join(dir, names[1]!) };
}

const pair = await resolvePair();
console.log(`roundtrip: ${pair.older}`);
console.log(`roundtrip: ${pair.newer}`);

const [olderBuf, newerBuf] = await Promise.all([readFile(pair.older), readFile(pair.newer)]);
const olderInfo = readOcadFileInfo(olderBuf);
const newerInfo = readOcadFileInfo(newerBuf);
assert(olderInfo.objectFormat === newerInfo.objectFormat, "comparison files must share an object format");
assert(olderInfo.activeObjects > 0 && newerInfo.activeObjects > 0, "both files need objects");
console.log(
  `headers: v${olderInfo.version} ${olderInfo.activeObjects} objekt → v${newerInfo.version} ${newerInfo.activeObjects} objekt, skala ${olderInfo.scaleParams?.scale ?? "?"}`,
);

const [olderParsed, newerParsed] = await Promise.all([
  parseOcadBuffer(olderBuf, path.basename(pair.older)),
  parseOcadBuffer(newerBuf, path.basename(pair.newer)),
]);
const mapScale = olderParsed.mapScale ?? newerParsed.mapScale ?? olderInfo.scaleParams?.scale;

const diff = compareOcadObjects(
  olderParsed.objects,
  newerParsed.objects,
  { fileNameA: olderParsed.fileName, fileNameB: newerParsed.fileName },
  { mapScale, exactModified: true, matchByObjectIndex: true },
);

console.log(
  `diff: +${diff.added} −${diff.removed} ~${diff.modified} =${diff.unchanged} (${diff.durationMs} ms)`,
);

assert(
  diff.unchanged + diff.removed + diff.modified === olderParsed.objects.length,
  `older objects must be accounted for: ${diff.unchanged}+${diff.removed}+${diff.modified} vs ${olderParsed.objects.length}`,
);
assert(
  diff.unchanged + diff.added + diff.modified === newerParsed.objects.length,
  `newer objects must be accounted for: ${diff.unchanged}+${diff.added}+${diff.modified} vs ${newerParsed.objects.length}`,
);
assert(diff.totalChanges === diff.added + diff.removed + diff.modified, "totalChanges mismatch");

const symbolChanges = diff.changes.filter((change) => change.previousSymbolNumber != null);
console.log(`symbol changes paired as modified: ${symbolChanges.length}`);

console.log("applying integration changes…");
const applyStarted = Date.now();
const applied = applyIntegrationChanges(olderBuf, newerBuf, diff.changes);
console.log(
  `applied in ${Date.now() - applyStarted} ms (copied=${applied.copied} replaced=${applied.replaced} appended=${applied.appended} deleted=${applied.deleted})`,
);
validateOcadBufferStructure(applied.buffer);
const expectedActive = olderInfo.activeObjects - applied.deleted + applied.appended;
const resultActive = readActiveObjectIndices(applied.buffer).size;
assert(
  resultActive === expectedActive,
  `active objects after apply: ${resultActive}, expected ${expectedActive} (copied=${applied.copied} replaced=${applied.replaced} appended=${applied.appended} deleted=${applied.deleted})`,
);

const removedOrModified = new Set(
  diff.changes
    .filter((change) => change.changeType === "removed" || change.changeType === "modified")
    .map((change) => change.objectIndex),
);
const beforeEntries = collectActiveIndexEntries(olderBuf);
const afterEntries = collectActiveIndexEntries(applied.buffer);
let preserved = 0;
for (const [index, before] of beforeEntries) {
  if (removedOrModified.has(index)) continue;
  const after = afterEntries.get(index);
  if (!after) continue;
  const n = Math.min(32, before.len > 0 ? 32 : 16);
  if (before.pos + n <= olderBuf.length && after.pos + n <= applied.buffer.length) {
    assert(
      olderBuf.subarray(before.pos, before.pos + n).equals(applied.buffer.subarray(after.pos, after.pos + n)),
      `object ${index} outside the diff was rewritten`,
    );
    preserved += 1;
  }
}
assert(preserved > 0, "expected unchanged objects to keep their bytes");

const conflicts = findChangedObjectsSinceReference(olderBuf, olderBuf, removedOrModified);
assert(conflicts.length === 0, "a file does not conflict with itself");

// Cropped checkout: objects outside a bbox around the first changes stay untouched in a subset export.
if (diff.changes.length > 0) {
  const sample = diff.changes.slice(0, 20);
  const minX = Math.min(...sample.map((c) => c.bbox[0])) - 500;
  const minY = Math.min(...sample.map((c) => c.bbox[1])) - 500;
  const maxX = Math.max(...sample.map((c) => c.bbox[2])) + 500;
  const maxY = Math.max(...sample.map((c) => c.bbox[3])) + 500;
  const cropped = cropOcadBuffer(olderBuf, {
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    targetVersion: defaultOcadExportVersion(olderInfo.version),
  });
  assert(cropped.keptObjectIndices.length > 0, "crop should keep some objects");
  if (cropped.keptObjectIndices.length < olderInfo.activeObjects) {
    console.log(
      `crop around first changes kept ${cropped.keptObjectIndices.length} / ${olderInfo.activeObjects} objects`,
    );
  }
}

const olderKeys = countKeys(olderParsed.objects);
const newerKeys = countKeys(newerParsed.objects);
let keyDelta = 0;
for (const [key, count] of newerKeys) {
  keyDelta += Math.abs(count - (olderKeys.get(key) ?? 0));
}
for (const [key, count] of olderKeys) {
  if (!newerKeys.has(key)) keyDelta += count;
}
assert(keyDelta > 0, "the two comparison files should actually differ");
console.log(`geometry/symbol multiset delta: ${keyDelta}`);

console.log("checkin roundtrip tests passed");
