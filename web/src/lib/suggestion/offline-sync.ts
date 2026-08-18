import { uploadSuggestionAttachment } from "@/lib/upload-client";
import {
  deleteSuggestionDraft,
  fileFromDraftPhoto,
  isNetworkError,
  listSuggestionDrafts,
  mergeSuggestionDraft,
  type SuggestionDraftRecord,
} from "@/lib/suggestion/offline-drafts";

export type SyncDraftResult =
  | { ok: true; suggestionId: string }
  | { ok: false; queued: boolean; error: string };

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; id?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function syncCreateDraft(draft: SuggestionDraftRecord): Promise<SyncDraftResult> {
  if (draft.markings.length < 1) {
    return { ok: false, queued: false, error: "Lägg till minst en markering på kartan" };
  }
  if (draft.comment.trim().length < 2) {
    return { ok: false, queued: false, error: "Beskrivning krävs (minst 2 tecken)" };
  }

  let attachmentPath: string | undefined;
  const photo = fileFromDraftPhoto(draft);
  if (photo) {
    const uploadRes = await uploadSuggestionAttachment(draft.mapSlug, photo);
    if (!uploadRes.ok) {
      throw new Error(await readErrorMessage(uploadRes, "Kunde inte ladda upp bilden"));
    }
    const uploadData = (await uploadRes.json()) as { attachmentPath?: string };
    attachmentPath = uploadData.attachmentPath;
  }

  const res = await fetch(`/api/maps/${draft.mapSlug}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mapVersionId: draft.versionId,
      category: draft.category,
      locationConfidence: draft.locationConfidence,
      title: draft.title.trim() || undefined,
      comment: draft.comment.trim(),
      geometries: draft.markings,
      attachmentPath,
      clientDraftId: draft.clientDraftId,
    }),
  });
  const data = (await res.json()) as { error?: string; id?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.error ?? "Kunde inte spara kartförslaget");
  }

  await deleteSuggestionDraft(draft.id);
  return { ok: true, suggestionId: data.id };
}

async function syncEditDraft(draft: SuggestionDraftRecord): Promise<SyncDraftResult> {
  const suggestionId = draft.suggestionId ?? draft.serverId;
  if (!suggestionId) {
    return { ok: false, queued: false, error: "Saknar id för kartförslaget" };
  }
  if (draft.comment.trim().length < 2) {
    return { ok: false, queued: false, error: "Beskrivning krävs (minst 2 tecken)" };
  }

  const body: Record<string, unknown> = {
    category: draft.category,
    locationConfidence: draft.locationConfidence,
    title: draft.title.trim() || null,
    comment: draft.comment.trim(),
  };
  const geometry = draft.markings[0] ?? draft.currentGeometry;
  if (geometry) body.geometry = geometry;

  const res = await fetch(`/api/maps/${draft.mapSlug}/suggestions/${suggestionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string; id?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Kunde inte uppdatera förslaget");
  }

  await deleteSuggestionDraft(draft.id);
  return { ok: true, suggestionId };
}

export async function syncSuggestionDraft(draft: SuggestionDraftRecord): Promise<SyncDraftResult> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await mergeSuggestionDraft(
        draft.id,
        { wantsSync: true, lastError: null },
        () => draft,
      );
      return {
        ok: false,
        queued: true,
        error: "Sparat på enheten. Skickas när nätet kommer tillbaka.",
      };
    }

    const result = draft.kind === "edit" ? await syncEditDraft(draft) : await syncCreateDraft(draft);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte synka kartförslaget";
    const queued = isNetworkError(err);
    await mergeSuggestionDraft(
      draft.id,
      {
        wantsSync: queued || draft.wantsSync,
        lastError: queued ? null : message,
      },
      () => draft,
    );
    return {
      ok: false,
      queued,
      error: queued ? "Sparat på enheten. Skickas när nätet kommer tillbaka." : message,
    };
  }
}

export async function flushPendingSuggestionDrafts(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const drafts = await listSuggestionDrafts();
  const pending = drafts
    .filter((draft) => draft.wantsSync)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  for (const draft of pending) {
    await syncSuggestionDraft(draft);
  }
}
