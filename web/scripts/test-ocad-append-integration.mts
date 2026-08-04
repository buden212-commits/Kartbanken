/**
 * Kör: npx tsx scripts/test-ocad-append-integration.mts
 * Verifierar append av nytt objekt genom att klona export och simulera checkin med extra objekt.
 */
import { readFile } from "fs/promises";
import { compareOcadObjects } from "../src/lib/ocad/diff";
import { appendObjectsFromCheckin } from "../src/lib/ocad/ocad-integrate";
import { parseOcadBuffer } from "../src/lib/ocad/read";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const exportPath = "C:/Users/jonas/Downloads/Mora-Väst-med-Venjan-checkout-cmscwepq (1).ocd";
const checkinPath = "C:/Users/jonas/Downloads/Mora-Väst-med-Venjan-checkout-cmscwepq.ocd";

const [exportBuf, checkinBuf] = await Promise.all([readFile(exportPath), readFile(checkinPath)]);

const [exportSummary, checkinSummary] = await Promise.all([
  parseOcadBuffer(exportBuf, "export.ocd"),
  parseOcadBuffer(checkinBuf, "checkin.ocd"),
]);

const diff = compareOcadObjects(
  exportSummary.objects,
  checkinSummary.objects,
  { fileNameA: "export", fileNameB: "checkin" },
  { toleranceMeters: 2, matchByObjectIndex: true },
);

const addedIndices = diff.changes
  .filter((change) => change.changeType === "added")
  .map((change) => change.objectIndex);

assert(addedIndices.length > 0, "expected added objects in fixture");

const result = appendObjectsFromCheckin(exportBuf, checkinBuf, addedIndices);
assert(result.appended === addedIndices.length, `expected ${addedIndices.length} appended`);
assert(result.failed.length === 0, "expected no append failures");

const integrated = await parseOcadBuffer(result.buffer, "integrated.ocd");
assert(
  integrated.objectCount === exportSummary.objectCount + addedIndices.length,
  `expected object count ${exportSummary.objectCount + addedIndices.length}, got ${integrated.objectCount}`,
);

console.log("ocad append integration tests passed");
