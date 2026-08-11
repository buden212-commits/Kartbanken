import type { OcadObjectChange } from "./diff-types";

export const CHANGES_LIST_PAGE_SIZE = 200;
export const DEFAULT_MAX_STORED_CHANGES = 50_000;

export type StoredChangesMeta = {
  totalChanges: number;
  changesTruncated: boolean;
  maxChangesApplied: number | null;
};

export function resolveMaxStoredChanges(override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }

  const raw = Number(process.env.DIFF_MAX_STORED_CHANGES ?? DEFAULT_MAX_STORED_CHANGES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_STORED_CHANGES;
}

export function limitStoredChanges(
  changes: OcadObjectChange[],
  maxStored?: number,
): { changes: OcadObjectChange[] } & StoredChangesMeta {
  const limit = resolveMaxStoredChanges(maxStored);
  const totalChanges = changes.length;

  if (totalChanges <= limit) {
    return {
      changes,
      totalChanges,
      changesTruncated: false,
      maxChangesApplied: null,
    };
  }

  return {
    changes: changes.slice(0, limit),
    totalChanges,
    changesTruncated: true,
    maxChangesApplied: limit,
  };
}

export function changeIndicesByKind(changes: OcadObjectChange[]): {
  added: number[];
  removed: number[];
  modified: number[];
} {
  const added: number[] = [];
  const removed: number[] = [];
  const modified: number[] = [];

  for (const change of changes) {
    if (change.changeType === "added") added.push(change.objectIndex);
    else if (change.changeType === "removed") removed.push(change.objectIndex);
    else modified.push(change.objectIndex);
  }

  return { added, removed, modified };
}
