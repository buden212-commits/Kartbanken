/**
 * Kör: npm run test:integrate
 * Verifierar delete/modify/resize mot en riktig OCAD-fil.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import {
  copyMatchingObjectData,
  markObjectsDeletedByIndices,
} from "../src/lib/ocad/ocad-export-server";
import {
  findChangedObjectsSinceReference,
  readActiveObjectIndices,
  readObjectIndexEntry,
  validateOcadBufferStructure,
} from "../src/lib/ocad/ocad-integrate";
import { applyIntegrationChanges } from "../src/lib/checkout/integrate";
import type { OcadObjectChange } from "../src/lib/ocad/diff-types";
import { getRepoRoot } from "../src/lib/ocad/read";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function resolveFixture(): Promise<string> {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(getRepoRoot(), "Exempelfil", "Problem");
  const names = await readdir(dir);
  const checkout = names.find(
    (name) => name.toLowerCase().includes("utcheckning") && name.toLowerCase().endsWith(".ocd"),
  );
  if (!checkout) {
    throw new Error(`Ingen utcheckningsfil i ${dir}`);
  }
  return path.join(dir, checkout);
}

function dummyChange(
  changeType: OcadObjectChange["changeType"],
  objectIndex: number,
  checkinObjectIndex?: number,
): OcadObjectChange {
  return {
    changeType,
    objectIndex,
    ...(checkinObjectIndex != null ? { checkinObjectIndex } : {}),
    symbolNumber: 0,
    symbolName: "",
    type: "unknown",
    centroid: [0, 0],
    bbox: [0, 0, 0, 0],
    geometryHash: "",
  };
}

const fixturePath = await resolveFixture();
const source = await readFile(fixturePath);
const active = [...readActiveObjectIndices(source)].sort((a, b) => a - b);
assert(active.length > 3, "fixture needs several objects");

const targetIndex = active[0]!;
const otherIndex = active[1]!;

// --- delete mutates in place ---
const forDelete = Buffer.from(source);
assert(readActiveObjectIndices(forDelete).has(targetIndex), "target should be active before delete");
const deleteResult = markObjectsDeletedByIndices(forDelete, new Set([targetIndex]));
assert(deleteResult.deleted === 1, `expected 1 deleted, got ${deleteResult.deleted}`);
assert(!readActiveObjectIndices(forDelete).has(targetIndex), "target should be inactive after delete");
assert(readActiveObjectIndices(forDelete).has(otherIndex), "other object should remain");

// --- copy mutates in place ---
const head = Buffer.from(source);
const checkin = Buffer.from(source);
const checkinEntry = readObjectIndexEntry(checkin, otherIndex);
assert(!!checkinEntry, "expected index entry");
const size = Math.min(64, checkinEntry!.len > 0 ? 32 + 8 * checkinEntry!.len : 32);
assert(checkinEntry!.pos + size <= checkin.length, "object payload in bounds");
const pokeOffset = checkinEntry!.pos + 4;
const original = checkin[pokeOffset]!;
checkin[pokeOffset] = original ^ 0xff;

const copyResult = copyMatchingObjectData(head, checkin, new Set([otherIndex]));
assert(copyResult.copied === 1, `expected 1 copied, got ${copyResult.copied}`);
assert(copyResult.skipped === 0, `expected 0 skipped, got ${copyResult.skipped}`);
assert(head[pokeOffset] === (original ^ 0xff), "head buffer should receive checkin bytes");

// --- resize: different-sized objects become delete + append ---
const sized = active
  .map((index) => ({ index, entry: readObjectIndexEntry(source, index) }))
  .filter((row) => row.entry && row.entry.len > 0);
const small = sized.reduce((best, row) =>
  row.entry!.len < (best.entry?.len ?? Infinity) ? row : best,
);
const large = sized.reduce((best, row) =>
  row.entry!.len > (best.entry?.len ?? 0) ? row : best,
);
assert(small.index !== large.index && small.entry!.len !== large.entry!.len, "need two different object sizes");

const resizeHead = Buffer.from(source);
const resizeCheckin = Buffer.from(source);
const appliedResize = applyIntegrationChanges(resizeHead, resizeCheckin, [
  dummyChange("modified", small.index, large.index),
]);
assert(appliedResize.replaced === 1, `expected 1 replaced (size change), got ${appliedResize.replaced}`);
assert(appliedResize.copied === 0, "size mismatch must not copy in place");
assert(
  readActiveObjectIndices(appliedResize.buffer).size === active.length,
  "delete+append of a resized object should keep the object count",
);
validateOcadBufferStructure(appliedResize.buffer);

// --- remapped checkin index must not overwrite a different head object ---
const remapHead = Buffer.from(source);
const remapCheckin = Buffer.from(source);
const untouched = active.find((index) => index !== targetIndex && index !== otherIndex);
assert(untouched != null, "need a third object");
const beforeUntouched = Buffer.from(
  remapHead.subarray(
    readObjectIndexEntry(remapHead, untouched)!.pos,
    readObjectIndexEntry(remapHead, untouched)!.pos + 16,
  ),
);
const remapped = applyIntegrationChanges(remapHead, remapCheckin, [
  dummyChange("modified", targetIndex, otherIndex),
]);
const afterUntouched = Buffer.from(
  remapped.buffer.subarray(
    readObjectIndexEntry(remapped.buffer, untouched)!.pos,
    readObjectIndexEntry(remapped.buffer, untouched)!.pos + 16,
  ),
);
assert(beforeUntouched.equals(afterUntouched), "unrelated object must keep its bytes");

// --- head changed since the checkout export → conflict ---
const reference = Buffer.from(source);
const driftedHead = Buffer.from(source);
const driftedEntry = readObjectIndexEntry(driftedHead, targetIndex)!;
driftedHead[driftedEntry.pos + 4] = driftedHead[driftedEntry.pos + 4]! ^ 0xff;
const conflicts = findChangedObjectsSinceReference(driftedHead, reference, [targetIndex]);
assert(conflicts.length === 1, `expected 1 conflict, got ${conflicts.length}`);
assert(conflicts[0]?.reason === "changed_in_head", "drifted object must abort integration");

console.log("integrate delete/modify buffer mutation tests passed");
