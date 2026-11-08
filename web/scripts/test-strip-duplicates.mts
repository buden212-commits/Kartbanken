/**
 * Kör: npm run test:strip-duplicates
 * v12.ocd har kända exakta dubbletter — rensningen ska lämna ett objekt per grupp.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import {
  duplicateDedupIndexSets,
  findExactDuplicateGroups,
} from "../src/lib/ocad/exact-duplicates";
import { readActiveObjectIndices } from "../src/lib/ocad/ocad-integrate";
import { getRepoRoot, parseOcadBuffer } from "../src/lib/ocad/read";
import { stripExactDuplicatesFromBuffer } from "../src/lib/ocad/strip-duplicates";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function resolveV12(): Promise<string> {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(getRepoRoot(), "Exempelfil", "Jämförelse");
  const names = await readdir(dir);
  const v12 = names.find((name) => name.toLowerCase() === "v12.ocd");
  if (!v12) throw new Error(`v12.ocd saknas i ${dir}`);
  return path.join(dir, v12);
}

const fixturePath = await resolveV12();
const source = await readFile(fixturePath);
const parsed = await parseOcadBuffer(source, path.basename(fixturePath));
const groups = findExactDuplicateGroups(parsed.objects);
assert(groups.length > 0, "v12.ocd ska innehålla minst en dubblettgrupp");

const extraCount = groups.reduce((sum, group) => sum + (group.count - 1), 0);
const { keepers, extras } = duplicateDedupIndexSets(groups);
assert(extras.size === extraCount, "extras ska vara alla utom lägst index i varje grupp");

const activeBefore = readActiveObjectIndices(source).size;
const stripped = await stripExactDuplicatesFromBuffer(source, path.basename(fixturePath));
assert(stripped.extrasRemoved > 0, "förväntade extra kopior att rensas");
assert(stripped.extrasRemoved === extras.size, "antal raderade ska matcha extras");
assert(stripped.groupCount === groups.length, "groupCount ska matcha skanningen");

const activeAfter = readActiveObjectIndices(stripped.buffer).size;
assert(
  activeAfter === activeBefore - stripped.extrasRemoved,
  `aktiva efter rensning ${activeAfter}, väntat ${activeBefore - stripped.extrasRemoved}`,
);

const afterParsed = await parseOcadBuffer(stripped.buffer, "stripped.ocd");
const afterGroups = findExactDuplicateGroups(afterParsed.objects);
assert(afterGroups.length === 0, `förväntade 0 dubblettgrupper efter rensning, fick ${afterGroups.length}`);

const afterActive = new Set(afterParsed.objects.map((object) => object.objectIndex));
for (const index of keepers) {
  assert(afterActive.has(index), `keeper ${index} ska finnas kvar`);
}
for (const index of extras) {
  assert(!afterActive.has(index), `extra ${index} ska vara borta`);
}

const noop = await stripExactDuplicatesFromBuffer(stripped.buffer, "already-clean.ocd");
assert(noop.extrasRemoved === 0, "andra körningen ska inte ta bort mer");
assert(noop.buffer === stripped.buffer, "ren buffer ska återanvändas");

console.log(
  `strip-duplicates: ${groups.length} grupper, ${stripped.extrasRemoved} extra bort, ${activeAfter} objekt kvar`,
);
console.log("strip-duplicates tests passed");
