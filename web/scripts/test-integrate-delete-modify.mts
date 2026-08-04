/**
 * Kör: npx tsx scripts/test-integrate-delete-modify.mts
 * Verifierar att delete/modify faktiskt muterar head-buffern (inte bara räknar).
 */
import {
  copyMatchingObjectData,
  markObjectsDeletedByIndices,
} from "../src/lib/ocad/ocad-export-server";
import { readActiveObjectIndices, readObjectIndexEntry } from "../src/lib/ocad/ocad-integrate";
import { parseOcadBuffer } from "../src/lib/ocad/read";
import { readFile } from "fs/promises";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const fixturePath =
  process.argv[2] ??
  "C:/Users/jonas/Downloads/Mora-Väst-med-Venjan-checkout-cmscwepq (1).ocd";

const source = await readFile(fixturePath);
const summary = await parseOcadBuffer(source, "fixture.ocd");
assert(summary.objectCount > 2, "fixture needs objects");

const active = [...readActiveObjectIndices(source)].sort((a, b) => a - b);
const targetIndex = active[0]!;
const otherIndex = active[1]!;

// --- delete mutates in place ---
const forDelete = Buffer.from(source);
const beforeDelete = readActiveObjectIndices(forDelete);
assert(beforeDelete.has(targetIndex), "target should be active before delete");

const deleteResult = markObjectsDeletedByIndices(forDelete, new Set([targetIndex]));
assert(deleteResult.deleted === 1, `expected 1 deleted, got ${deleteResult.deleted}`);

const afterDelete = readActiveObjectIndices(forDelete);
assert(!afterDelete.has(targetIndex), "target should be inactive after delete on same buffer");
assert(afterDelete.has(otherIndex), "other object should remain");

// --- copy mutates in place ---
const head = Buffer.from(source);
const checkin = Buffer.from(source);
const headEntry = readObjectIndexEntry(head, otherIndex);
const checkinEntry = readObjectIndexEntry(checkin, otherIndex);
assert(!!headEntry && !!checkinEntry, "expected index entries");

// Flip first data byte in checkin object payload (after OCAD object header) if size allows.
const size = Math.min(64, checkinEntry!.len > 0 ? 32 + 8 * checkinEntry!.len : 32);
assert(checkinEntry!.pos + size <= checkin.length, "object payload in bounds");
const pokeOffset = checkinEntry!.pos + 4;
const original = checkin[pokeOffset]!;
checkin[pokeOffset] = original ^ 0xff;

const copyResult = copyMatchingObjectData(head, checkin, new Set([otherIndex]));
assert(copyResult.copied === 1, `expected 1 copied, got ${copyResult.copied}`);
assert(copyResult.skipped === 0, `expected 0 skipped, got ${copyResult.skipped}`);
assert(head[pokeOffset] === (original ^ 0xff), "head buffer should receive checkin bytes");

console.log("integrate delete/modify buffer mutation tests passed");
