/**
 * Verifierar att Kartinformation (string 1061/11) får en ny rad vid kommentar.
 * Kör: npx tsx scripts/test-ocad-map-notes.mts
 */
import {
  appendOcadMapNotesIfComment,
  formatOcadMapNotesLine,
  readOcadMapNotesText,
} from "../src/lib/ocad/ocad-map-notes";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const HEADER_SIZE = 60;
const STRING_INDEX_BLOCK_BYTES = 4 + 256 * 16;

function makeEmptyOcad(version = 12): Buffer {
  const blockStart = HEADER_SIZE;
  const buffer = Buffer.alloc(blockStart + STRING_INDEX_BLOCK_BYTES);
  buffer.writeUInt16LE(0x0cad, 0);
  buffer.writeInt16LE(version, 4);
  buffer.writeUInt32LE(blockStart, 32);
  return buffer;
}

const empty = makeEmptyOcad();
const skipped = appendOcadMapNotesIfComment(empty, { comment: "   ", userName: "Anna" });
assert(!skipped.changed, "Tom kommentar ska inte ändra filen");
assert(skipped.buffer.equals(empty), "Tom kommentar ska returnera samma buffer");

const first = appendOcadMapNotesIfComment(empty, {
  comment: "Justerat stigar",
  userName: "Anna Andersson",
  at: new Date("2026-08-17T12:00:00+02:00"),
});
assert(first.changed, "Kommentar ska skriva kartinformation");
const firstText = readOcadMapNotesText(first.buffer);
const expectedFirst = formatOcadMapNotesLine({
  comment: "Justerat stigar",
  userName: "Anna Andersson",
  at: new Date("2026-08-17T12:00:00+02:00"),
});
assert(firstText === expectedFirst, `Första raden fel: ${JSON.stringify(firstText)}`);
assert(expectedFirst.includes("Anna Andersson"), "Rad ska innehålla användare");
assert(expectedFirst.includes("Justerat stigar"), "Rad ska innehålla kommentar");

const second = appendOcadMapNotesIfComment(first.buffer, {
  comment: "Nya höjdkurvor",
  userName: "Bo",
  at: new Date("2026-08-18T12:00:00+02:00"),
});
const secondText = readOcadMapNotesText(second.buffer) ?? "";
assert(secondText.includes("Justerat stigar"), "Befintlig text ska behållas");
assert(secondText.includes("Nya höjdkurvor"), "Ny rad ska läggas till");
assert(secondText.split("\n").length === 2, "Två rader förväntades");

const longComment = "x".repeat(200);
const long = appendOcadMapNotesIfComment(empty, {
  comment: longComment,
  userName: "C",
  at: new Date("2026-08-17T12:00:00+02:00"),
});
assert((readOcadMapNotesText(long.buffer) ?? "").includes(longComment), "Lång kommentar ska rymmas");

console.log("ocad-map-notes: ok");
