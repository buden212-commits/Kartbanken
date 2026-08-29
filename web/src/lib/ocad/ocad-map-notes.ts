import { formatDateOnly } from "@/lib/format";

/** OCAD 9/10 File Info (Karta > Kartinformation). */
export const OCAD_STRING_FILE_INFO = 11;
/** OCAD 12+ Map notes (Karta > Kartinformation). */
export const OCAD_STRING_MAP_NOTES = 1061;

const HEADER_MIN_SIZE = 60;
const HEADER_STRING_INDEX_BLOCK_OFFSET = 32;
const STRING_INDEX_BLOCK_HEADER_SIZE = 4;
const STRING_INDEX_ENTRY_SIZE = 16;
const STRING_INDEX_ENTRIES_PER_BLOCK = 256;
const STRING_INDEX_POS_OFFSET = 0;
const STRING_INDEX_LEN_OFFSET = 4;
const STRING_INDEX_RECTYPE_OFFSET = 8;
const STRING_INDEX_BLOCK_BYTES =
  STRING_INDEX_BLOCK_HEADER_SIZE + STRING_INDEX_ENTRY_SIZE * STRING_INDEX_ENTRIES_PER_BLOCK;

const MAX_NOTES_CHARS = 30_000;

type StringSlot = {
  entryOffset: number;
  pos: number;
  len: number;
  recType: number;
};

export type MapNotesAuthor = {
  name?: string | null;
  email?: string | null;
};

export function displayMapNotesUserName(user: MapNotesAuthor): string {
  const name = sanitizeMapNotesText(user.name ?? "");
  if (name) return name;
  const email = (user.email ?? "").trim();
  if (email) return email.split("@")[0] || email;
  return "Okänd";
}

export function formatOcadMapNotesLine(input: {
  comment: string;
  userName: string;
  at?: Date;
}): string {
  const date = formatDateOnly(input.at ?? new Date());
  const user = sanitizeMapNotesText(input.userName) || "Okänd";
  const comment = sanitizeMapNotesText(input.comment);
  return `${date} ${user}: ${comment}`;
}

/**
 * Lägger till en rad i OCAD Kartinformation om kommentaren inte är tom.
 * Misslyckas tyst (returnerar original) om filen inte går att uppdatera.
 */
export function appendOcadMapNotesIfComment(
  buffer: Buffer,
  input: {
    comment: string | null | undefined;
    userName: string;
    at?: Date;
  },
): { buffer: Buffer; changed: boolean } {
  const comment = input.comment?.trim();
  if (!comment) {
    return { buffer, changed: false };
  }

  try {
    const line = formatOcadMapNotesLine({
      comment,
      userName: input.userName,
      at: input.at,
    });
    const grown = writeOcadMapNotesAppend(buffer, line);
    return { buffer: Buffer.from(grown), changed: true };
  } catch (err) {
    console.error("Kunde inte uppdatera OCAD-kartinformation:", err);
    return { buffer, changed: false };
  }
}

export function readOcadMapNotesText(buffer: Buffer): string | null {
  const slot = findMapNotesSlot(buffer);
  if (!slot || slot.pos <= 0) return null;
  const parsed = readParameterString(buffer, slot);
  return parsed?.first ?? null;
}

/** Tom sträng om filen saknar kartinformation. */
export function extractOcadMapNotes(buffer: Buffer): string {
  try {
    return (readOcadMapNotesText(buffer) ?? "").trim();
  } catch {
    return "";
  }
}

function sanitizeMapNotesText(value: string): string {
  return value.replace(/\0/g, "").replace(/[\t]+/g, " ").replace(/\r\n/g, "\n").trim();
}

function writeOcadMapNotesAppend(buffer: Buffer, line: string): Buffer {
  if (buffer.length < HEADER_MIN_SIZE || buffer.readUInt16LE(0) !== 0x0cad) {
    throw new Error("Ogiltig OCAD-fil");
  }

  let working: Buffer = Buffer.from(buffer);
  let slot = findMapNotesSlot(working);
  if (!slot) {
    working = Buffer.from(ensureStringIndexAndAllocateSlot(working));
    slot = findFreeStringSlot(working);
    if (!slot) {
      throw new Error("Kunde inte allokera plats för kartinformation");
    }
    const recType = mapNotesRecTypeForVersion(working.readInt16LE(4));
    working.writeInt32LE(recType, slot.entryOffset + STRING_INDEX_RECTYPE_OFFSET);
    slot = { ...slot, recType };
  }

  const parsed = slot.pos > 0 ? readParameterString(working, slot) : { first: "", rest: "" };
  const first = parsed?.first ?? "";
  const rest = parsed?.rest ?? "";
  const nextFirst = first ? `${first}\n${line}` : line;
  const clipped =
    nextFirst.length > MAX_NOTES_CHARS ? nextFirst.slice(nextFirst.length - MAX_NOTES_CHARS) : nextFirst;
  const encoded = encodeParameterString(clipped, rest);

  if (slot.pos > 0 && encoded.length + 1 <= slot.len) {
    encoded.copy(working, slot.pos);
    working[slot.pos + encoded.length] = 0;
    return working;
  }

  const grown = Buffer.alloc(working.length + encoded.length + 1);
  working.copy(grown, 0, 0, working.length);
  const newPos = working.length;
  encoded.copy(grown, newPos);
  grown[newPos + encoded.length] = 0;
  grown.writeInt32LE(newPos, slot.entryOffset + STRING_INDEX_POS_OFFSET);
  grown.writeInt32LE(encoded.length + 1, slot.entryOffset + STRING_INDEX_LEN_OFFSET);
  return grown;
}

function mapNotesRecTypeForVersion(version: number): number {
  return version >= 12 ? OCAD_STRING_MAP_NOTES : OCAD_STRING_FILE_INFO;
}

function findMapNotesSlot(buffer: Buffer): StringSlot | null {
  let notes: StringSlot | null = null;
  let fileInfo: StringSlot | null = null;
  iterateStringSlots(buffer, (slot) => {
    if (slot.recType === OCAD_STRING_MAP_NOTES && !notes) notes = slot;
    if (slot.recType === OCAD_STRING_FILE_INFO && !fileInfo) fileInfo = slot;
  });
  return notes ?? fileInfo;
}

function findFreeStringSlot(buffer: Buffer): StringSlot | null {
  let found: StringSlot | null = null;
  iterateStringSlots(buffer, (slot) => {
    if (!found && slot.recType <= 0) found = slot;
  });
  return found;
}

function iterateStringSlots(buffer: Buffer, visit: (slot: StringSlot) => void): void {
  let block = buffer.readUInt32LE(HEADER_STRING_INDEX_BLOCK_OFFSET);
  const seen = new Set<number>();
  while (block > 0 && block + STRING_INDEX_BLOCK_BYTES <= buffer.length && !seen.has(block)) {
    seen.add(block);
    for (let i = 0; i < STRING_INDEX_ENTRIES_PER_BLOCK; i++) {
      const entryOffset = block + STRING_INDEX_BLOCK_HEADER_SIZE + i * STRING_INDEX_ENTRY_SIZE;
      visit({
        entryOffset,
        pos: buffer.readInt32LE(entryOffset + STRING_INDEX_POS_OFFSET),
        len: buffer.readInt32LE(entryOffset + STRING_INDEX_LEN_OFFSET),
        recType: buffer.readInt32LE(entryOffset + STRING_INDEX_RECTYPE_OFFSET),
      });
    }
    block = buffer.readInt32LE(block);
  }
}

function ensureStringIndexAndAllocateSlot(buffer: Buffer): Buffer {
  const existingBlock = buffer.readUInt32LE(HEADER_STRING_INDEX_BLOCK_OFFSET);
  if (existingBlock > 0) {
    const free = findFreeStringSlot(buffer);
    if (free) return buffer;
    return appendStringIndexBlock(buffer);
  }

  const grown = Buffer.alloc(buffer.length + STRING_INDEX_BLOCK_BYTES);
  buffer.copy(grown, 0, 0, buffer.length);
  const blockStart = buffer.length;
  grown.writeUInt32LE(blockStart, HEADER_STRING_INDEX_BLOCK_OFFSET);
  return grown;
}

function appendStringIndexBlock(buffer: Buffer): Buffer {
  let lastBlock = 0;
  let block = buffer.readUInt32LE(HEADER_STRING_INDEX_BLOCK_OFFSET);
  const seen = new Set<number>();
  while (block > 0 && block + STRING_INDEX_BLOCK_BYTES <= buffer.length && !seen.has(block)) {
    seen.add(block);
    lastBlock = block;
    const next = buffer.readInt32LE(block);
    if (!next) break;
    block = next;
  }

  const grown = Buffer.from(buffer);
  const linked = Buffer.alloc(grown.length + STRING_INDEX_BLOCK_BYTES);
  grown.copy(linked, 0, 0, grown.length);
  const newBlockStart = grown.length;
  if (lastBlock > 0) {
    linked.writeInt32LE(newBlockStart, lastBlock);
  } else {
    linked.writeUInt32LE(newBlockStart, HEADER_STRING_INDEX_BLOCK_OFFSET);
  }
  return linked;
}

function readParameterString(
  buffer: Buffer,
  slot: StringSlot,
): { first: string; rest: string } | null {
  if (slot.pos <= 0 || slot.pos >= buffer.length) return null;
  const limit = Math.min(buffer.length, slot.pos + Math.max(slot.len, 1));
  let end = slot.pos;
  while (end < limit && buffer[end] !== 0) end++;
  const raw = buffer.subarray(slot.pos, end).toString("utf8");
  const tab = raw.indexOf("\t");
  if (tab < 0) return { first: raw, rest: "" };
  return { first: raw.slice(0, tab), rest: raw.slice(tab) };
}

function encodeParameterString(first: string, rest: string): Buffer {
  return Buffer.from(`${first}${rest}`, "utf8");
}
