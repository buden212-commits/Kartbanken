import type { FieldEditOps } from "./types";
import { parseFieldEditOps, serializeFieldEditOps } from "./types";

const PREFIX = "kartbanken-field-edit-";

function storageKey(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export function loadLocalFieldEditOps(sessionId: string): FieldEditOps | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    return parseFieldEditOps(raw);
  } catch {
    return null;
  }
}

export function saveLocalFieldEditOps(sessionId: string, ops: FieldEditOps): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(sessionId), serializeFieldEditOps(ops));
  } catch {
    // quota exceeded — server sync remains fallback
  }
}

export function clearLocalFieldEditOps(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    // ignore
  }
}

export function mergeInitialOps(sessionId: string, serverOps: FieldEditOps): FieldEditOps {
  const local = loadLocalFieldEditOps(sessionId);
  return local ?? serverOps;
}
