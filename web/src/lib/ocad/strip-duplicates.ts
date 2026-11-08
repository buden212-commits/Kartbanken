import {
  duplicateDedupIndexSets,
  findExactDuplicateGroups,
} from "./exact-duplicates";
import { markObjectsDeletedByIndices } from "./ocad-export-server";
import { parseOcadBuffer } from "./read";

export type StripExactDuplicatesResult = {
  /** Original buffer when nothing was removed; otherwise a mutated copy. */
  buffer: Buffer;
  extrasRemoved: number;
  groupCount: number;
};

/** Swedish note appended to the version comment when extras were stripped. */
export function duplicateStripComment(extrasRemoved: number, groupCount: number): string {
  return `Borttagna dubbletter: ${extrasRemoved} extra objekt i ${groupCount} grupp${groupCount === 1 ? "" : "er"}`;
}

export function appendDuplicateStripComment(
  comment: string | null | undefined,
  extrasRemoved: number,
  groupCount: number,
): string | null {
  if (extrasRemoved <= 0) return comment?.trim() ? comment.trim() : null;
  const note = duplicateStripComment(extrasRemoved, groupCount);
  const trimmed = comment?.trim();
  return trimmed ? `${trimmed} — ${note}` : note;
}

/**
 * Soft-delete extra copies in each exact-duplicate group (keep lowest objectIndex).
 * Returns the original buffer when there are no extras.
 */
export async function stripExactDuplicatesFromBuffer(
  buffer: Buffer,
  fileName = "map.ocd",
): Promise<StripExactDuplicatesResult> {
  const summary = await parseOcadBuffer(buffer, fileName);
  const groups = findExactDuplicateGroups(summary.objects);
  const { extras } = duplicateDedupIndexSets(groups);
  if (extras.size === 0) {
    return { buffer, extrasRemoved: 0, groupCount: 0 };
  }

  const working = Buffer.from(buffer);
  const { deleted } = markObjectsDeletedByIndices(working, extras);
  if (deleted === 0) {
    return { buffer, extrasRemoved: 0, groupCount: 0 };
  }

  return {
    buffer: working,
    extrasRemoved: deleted,
    groupCount: groups.length,
  };
}
