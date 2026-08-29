import {
  DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
  type SuggestionLocationConfidenceValue,
} from "@/lib/suggestion/types";

export const SUGGESTION_DRAFT_DB = "kartportalen-drafts";
export const SUGGESTION_DRAFT_STORE = "suggestionDrafts";
export const SUGGESTION_DRAFT_DB_VERSION = 1;

export type SuggestionDraftKind = "create" | "edit";

export type SuggestionDraftRecord = {
  id: string;
  kind: SuggestionDraftKind;
  mapSlug: string;
  versionId: string;
  suggestionId: string | null;
  clientDraftId: string;
  markings: SuggestionGeometry[];
  currentGeometry: SuggestionGeometry | null;
  polygonPoints: [number, number][];
  linePoints: [number, number][];
  category: SuggestionCategoryValue;
  locationConfidence: SuggestionLocationConfidenceValue;
  title: string;
  comment: string;
  photoBlob: Blob | null;
  photoName: string | null;
  photoType: string | null;
  serverId: string | null;
  wantsSync: boolean;
  updatedAt: number;
  lastError: string | null;
};

export function createSuggestionDraftId(mapSlug: string, versionId: string): string {
  return `create:${mapSlug}:${versionId}`;
}

export function editSuggestionDraftId(suggestionId: string): string {
  return `edit:${suggestionId}`;
}

export function newClientDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "NetworkError" || err.name === "AbortError") return true;
  }
  if (err instanceof Error) {
    return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(
      err.message,
    );
  }
  return false;
}

export function emptyCreateDraft(input: {
  mapSlug: string;
  versionId: string;
}): SuggestionDraftRecord {
  return {
    id: createSuggestionDraftId(input.mapSlug, input.versionId),
    kind: "create",
    mapSlug: input.mapSlug,
    versionId: input.versionId,
    suggestionId: null,
    clientDraftId: newClientDraftId(),
    markings: [],
    currentGeometry: null,
    polygonPoints: [],
    linePoints: [],
    category: "FEL_I_TERRANG",
    locationConfidence: DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
    title: "",
    comment: "",
    photoBlob: null,
    photoName: null,
    photoType: null,
    serverId: null,
    wantsSync: false,
    updatedAt: Date.now(),
    lastError: null,
  };
}

export function emptyEditDraft(input: {
  mapSlug: string;
  versionId: string;
  suggestionId: string;
}): SuggestionDraftRecord {
  return {
    id: editSuggestionDraftId(input.suggestionId),
    kind: "edit",
    mapSlug: input.mapSlug,
    versionId: input.versionId,
    suggestionId: input.suggestionId,
    clientDraftId: newClientDraftId(),
    markings: [],
    currentGeometry: null,
    polygonPoints: [],
    linePoints: [],
    category: "FEL_I_TERRANG",
    locationConfidence: DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
    title: "",
    comment: "",
    photoBlob: null,
    photoName: null,
    photoType: null,
    serverId: input.suggestionId,
    wantsSync: false,
    updatedAt: Date.now(),
    lastError: null,
  };
}

export function draftHasContent(draft: SuggestionDraftRecord): boolean {
  return (
    draft.markings.length > 0 ||
    draft.currentGeometry != null ||
    draft.polygonPoints.length > 0 ||
    draft.linePoints.length > 0 ||
    draft.title.trim().length > 0 ||
    draft.comment.trim().length > 0 ||
    draft.photoBlob != null ||
    draft.wantsSync
  );
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SUGGESTION_DRAFT_DB, SUGGESTION_DRAFT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUGGESTION_DRAFT_STORE)) {
        db.createObjectStore(SUGGESTION_DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Kunde inte öppna IndexedDB"));
  });
}

async function withDraftLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return fn();
  return locks.request("kartportalen-suggestion-drafts", fn);
}

export async function getSuggestionDraft(id: string): Promise<SuggestionDraftRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SUGGESTION_DRAFT_STORE, "readonly");
      const request = tx.objectStore(SUGGESTION_DRAFT_STORE).get(id);
      request.onsuccess = () => resolve((request.result as SuggestionDraftRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Kunde inte läsa utkast"));
    });
  } finally {
    db.close();
  }
}

export async function listSuggestionDrafts(): Promise<SuggestionDraftRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SUGGESTION_DRAFT_STORE, "readonly");
      const request = tx.objectStore(SUGGESTION_DRAFT_STORE).getAll();
      request.onsuccess = () => resolve((request.result as SuggestionDraftRecord[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error("Kunde inte lista utkast"));
    });
  } finally {
    db.close();
  }
}

export async function putSuggestionDraft(draft: SuggestionDraftRecord): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SUGGESTION_DRAFT_STORE, "readwrite");
      tx.objectStore(SUGGESTION_DRAFT_STORE).put({ ...draft, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Kunde inte spara utkast"));
    });
  } finally {
    db.close();
  }
}

export async function mergeSuggestionDraft(
  id: string,
  patch: Partial<SuggestionDraftRecord>,
  fallback: () => SuggestionDraftRecord,
): Promise<SuggestionDraftRecord> {
  return withDraftLock(async () => {
    const existing = (await getSuggestionDraft(id)) ?? fallback();
    const next: SuggestionDraftRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      kind: existing.kind,
      clientDraftId: existing.clientDraftId,
      mapSlug: patch.mapSlug ?? existing.mapSlug,
      versionId: patch.versionId ?? existing.versionId,
      updatedAt: Date.now(),
    };
    await putSuggestionDraft(next);
    return next;
  });
}

export async function deleteSuggestionDraft(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SUGGESTION_DRAFT_STORE, "readwrite");
      tx.objectStore(SUGGESTION_DRAFT_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Kunde inte radera utkast"));
    });
  } finally {
    db.close();
  }
}

export function fileFromDraftPhoto(draft: SuggestionDraftRecord): File | null {
  if (!draft.photoBlob) return null;
  return new File([draft.photoBlob], draft.photoName || "foto.jpg", {
    type: draft.photoType || draft.photoBlob.type || "image/jpeg",
  });
}
