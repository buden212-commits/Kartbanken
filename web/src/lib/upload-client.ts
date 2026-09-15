"use client";

import { upload } from "@vercel/blob/client";

const BLOB_UPLOAD_ROUTE = "/api/blob/upload";

const BODY_LIMIT_BYTES = 4_500_000;

export type UploadMapVersionOptions = {
  forceDespiteCheckouts?: boolean;
  forceDuplicate?: boolean;
};

/** Direkt FormData-uppladdning (lokal lagring / små filer). */
export async function uploadViaFormData(
  url: string,
  fields: Record<string, string | File | boolean>,
): Promise<Response> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "boolean") {
      formData.set(key, value ? "true" : "false");
    } else {
      formData.set(key, value);
    }
  }
  return fetch(url, { method: "POST", body: formData });
}

async function uploadMapVersionViaBlobClient(
  mapSlug: string,
  file: File,
  comment?: string,
  options: UploadMapVersionOptions = {},
): Promise<Response> {
  const extra: Record<string, string> = comment ? { comment } : {};
  if (options.forceDespiteCheckouts) extra.forceDespiteCheckouts = "true";
  if (options.forceDuplicate) extra.forceDuplicate = "true";

  const initRes = await fetch(`/api/maps/${mapSlug}/versions/upload-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      ...extra,
    }),
  });

  if (initRes.status === 400) {
    return uploadViaFormData(`/api/maps/${mapSlug}/versions`, { file, ...extra });
  }

  if (!initRes.ok) return initRes;

  const init = (await initRes.json()) as { versionId: string; storagePath: string };

  const blob = await upload(init.storagePath, file, {
    access: "private",
    handleUploadUrl: BLOB_UPLOAD_ROUTE,
    clientPayload: JSON.stringify({
      kind: "mapVersion",
      versionId: init.versionId,
      slug: mapSlug,
    }),
  });

  return fetch(`/api/maps/${mapSlug}/versions/upload-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      versionId: init.versionId,
      blobUrl: blob.url,
      forceDespiteCheckouts: options.forceDespiteCheckouts ?? false,
      forceDuplicate: options.forceDuplicate ?? false,
    }),
  });
}

export async function uploadMapVersion(
  mapSlug: string,
  file: File,
  comment?: string,
  options: UploadMapVersionOptions = {},
): Promise<Response> {
  const extra: Record<string, string | File | boolean> = comment ? { comment } : {};
  if (options.forceDespiteCheckouts) extra.forceDespiteCheckouts = true;
  if (options.forceDuplicate) extra.forceDuplicate = true;

  if (file.size > BODY_LIMIT_BYTES) {
    return uploadMapVersionViaBlobClient(mapSlug, file, comment, options);
  }

  const res = await uploadViaFormData(`/api/maps/${mapSlug}/versions`, { file, ...extra });
  if (res.status === 413) {
    const data = (await res.clone().json().catch(() => ({}))) as {
      clientUploadRequired?: boolean;
    };
    if (data.clientUploadRequired) {
      return uploadMapVersionViaBlobClient(mapSlug, file, comment, options);
    }
  }

  return res;
}

export async function uploadVerifyCompare(
  fileA: File,
  fileB: File,
): Promise<Response> {
  const maxSize = Math.max(fileA.size, fileB.size);

  if (maxSize > BODY_LIMIT_BYTES) {
    const initRes = await fetch("/api/verify/compare/upload-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileNameA: fileA.name,
        sizeA: fileA.size,
        fileNameB: fileB.name,
        sizeB: fileB.size,
      }),
    });

    if (initRes.status === 400) {
      return uploadViaFormData("/api/verify/compare", { fileA, fileB });
    }

    if (!initRes.ok) return initRes;

    const init = (await initRes.json()) as {
      jobId: string;
      pathA: string;
      pathB: string;
    };

    await upload(init.pathA, fileA, {
      access: "private",
      handleUploadUrl: BLOB_UPLOAD_ROUTE,
      clientPayload: JSON.stringify({
        kind: "verifyCompare",
        jobId: init.jobId,
        slot: "A",
      }),
    });

    await upload(init.pathB, fileB, {
      access: "private",
      handleUploadUrl: BLOB_UPLOAD_ROUTE,
      clientPayload: JSON.stringify({
        kind: "verifyCompare",
        jobId: init.jobId,
        slot: "B",
      }),
    });

    return fetch("/api/verify/compare/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: init.jobId }),
    });
  }

  return uploadViaFormData("/api/verify/compare", { fileA, fileB });
}

async function uploadCheckoutCheckinViaBlob(
  mapSlug: string,
  checkoutId: string,
  file: File,
  comment?: string,
): Promise<Response> {
  const initRes = await fetch(
    `/api/maps/${mapSlug}/checkouts/${checkoutId}/checkin/upload-init`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        ...(comment ? { comment } : {}),
      }),
    },
  );

  if (initRes.status === 400) {
    return uploadViaFormData(`/api/maps/${mapSlug}/checkouts/${checkoutId}/checkin`, {
      file,
      ...(comment ? { comment } : {}),
    });
  }

  if (!initRes.ok) return initRes;

  const init = (await initRes.json()) as { storagePath: string };

  const blob = await upload(init.storagePath, file, {
    access: "private",
    handleUploadUrl: BLOB_UPLOAD_ROUTE,
    clientPayload: JSON.stringify({
      kind: "checkoutCheckin",
      checkoutId,
      slug: mapSlug,
    }),
  });

  return fetch(`/api/maps/${mapSlug}/checkouts/${checkoutId}/checkin/upload-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      ...(comment ? { comment } : {}),
    }),
  });
}

export async function uploadCheckoutCheckin(
  mapSlug: string,
  checkoutId: string,
  file: File,
  comment?: string,
): Promise<Response> {
  if (file.size > BODY_LIMIT_BYTES) {
    return uploadCheckoutCheckinViaBlob(mapSlug, checkoutId, file, comment);
  }

  const res = await uploadViaFormData(`/api/maps/${mapSlug}/checkouts/${checkoutId}/checkin`, {
    file,
    ...(comment ? { comment } : {}),
  });

  if (res.status === 413) {
    return uploadCheckoutCheckinViaBlob(mapSlug, checkoutId, file, comment);
  }

  return res;
}

async function uploadSuggestionAttachmentViaBlob(
  mapSlug: string,
  file: File,
): Promise<Response> {
  const initRes = await fetch(
    `/api/maps/${mapSlug}/suggestions/attachment/upload-init`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
      }),
    },
  );

  if (initRes.status === 400) {
    return uploadViaFormData(`/api/maps/${mapSlug}/suggestions/attachment`, { file });
  }

  if (!initRes.ok) return initRes;

  const init = (await initRes.json()) as { storagePath: string };

  const blob = await upload(init.storagePath, file, {
    access: "private",
    handleUploadUrl: BLOB_UPLOAD_ROUTE,
    clientPayload: JSON.stringify({
      kind: "suggestionAttachment",
      slug: mapSlug,
    }),
  });

  return fetch(`/api/maps/${mapSlug}/suggestions/attachment/upload-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl: blob.url }),
  });
}

export async function uploadSuggestionAttachment(
  mapSlug: string,
  file: File,
): Promise<Response> {
  if (file.size > BODY_LIMIT_BYTES) {
    return uploadSuggestionAttachmentViaBlob(mapSlug, file);
  }

  const res = await uploadViaFormData(`/api/maps/${mapSlug}/suggestions/attachment`, { file });

  if (res.status === 413) {
    const data = (await res.clone().json().catch(() => ({}))) as {
      clientUploadRequired?: boolean;
    };
    if (data.clientUploadRequired) {
      return uploadSuggestionAttachmentViaBlob(mapSlug, file);
    }
  }

  return res;
}

export type ImportPartialUploadProgress = {
  label: string;
  detail?: string;
  status: "uploading" | "analyzing" | "ok" | "error";
};

export type UploadImportPartialOptions = {
  onProgress?: (progress: ImportPartialUploadProgress) => void;
};

type ImportPartialPollPayload = {
  jobId?: string;
  fileName?: string;
  status?: "pending" | "analyzing" | "ok" | "error";
  progress?: { label?: string; detail?: string } | null;
  analysis?: unknown;
  error?: string;
};

async function readResponsePayload(res: Response): Promise<ImportPartialPollPayload & Record<string, unknown>> {
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as ImportPartialPollPayload & Record<string, unknown>;
  } catch {
    const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 180);
    return {
      error:
        snippet ||
        (res.ok
          ? "Servern svarade utan giltig JSON."
          : `Servern svarade med fel (HTTP ${res.status}). Försök igen — stora kartor kan ta flera minuter.`),
    };
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Startar synkron analys (PUT) parallellt med GET-polling så progress syns under tiden.
 */
async function analyzeAndPollImportPartial(
  mapSlug: string,
  jobId: string,
  onProgress?: (progress: ImportPartialUploadProgress) => void,
): Promise<Response> {
  const started = Date.now();
  const maxMs = 14 * 60 * 1000;
  const analyzeState: {
    error: string | null;
    done: ImportPartialPollPayload | null;
  } = { error: null, done: null };

  const analyzePromise = fetch(`/api/maps/${mapSlug}/import-partial`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  })
    .then(async (res) => {
      const data = await readResponsePayload(res);
      if (!res.ok) {
        analyzeState.error = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        return data;
      }
      analyzeState.done = data;
      return data;
    })
    .catch((err) => {
      analyzeState.error = err instanceof Error ? err.message : "Analysanropet misslyckades";
      return { error: analyzeState.error } as ImportPartialPollPayload;
    });

  onProgress?.({
    status: "analyzing",
    label: "Startar analys",
    detail: "Parsar och jämför mot den stora kartan…",
  });

  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const res = await fetch(`/api/maps/${mapSlug}/import-partial/${jobId}`);
    const data = await readResponsePayload(res);

    if (!res.ok && res.status !== 404) {
      // Tillfälliga plattformsfel under lång körning — fortsätt om analysen fortfarande jobbar.
      if (analyzeState.error) {
        onProgress?.({
          status: "error",
          label: "Analysen misslyckades",
          detail: analyzeState.error,
        });
        return jsonResponse({ error: analyzeState.error, jobId }, 400);
      }
      onProgress?.({
        status: "analyzing",
        label: "Analyserar delkartan…",
        detail: typeof data.error === "string" ? data.error : "Väntar på svar från servern…",
      });
      continue;
    }

    if (data.status === "ok" && data.analysis) {
      onProgress?.({ status: "ok", label: "Klar", detail: "Analysen är färdig." });
      return jsonResponse(data, 200);
    }

    if (data.status === "error") {
      const message = typeof data.error === "string" ? data.error : "Okänt fel";
      onProgress?.({ status: "error", label: "Analysen misslyckades", detail: message });
      return jsonResponse({ ...data, error: message }, 400);
    }

    if (analyzeState.done?.status === "ok" && analyzeState.done.analysis) {
      onProgress?.({ status: "ok", label: "Klar", detail: "Analysen är färdig." });
      return jsonResponse(analyzeState.done, 200);
    }

    if (analyzeState.error && data.status !== "analyzing") {
      onProgress?.({
        status: "error",
        label: "Analysen misslyckades",
        detail: analyzeState.error,
      });
      return jsonResponse({ error: analyzeState.error, jobId }, 400);
    }

    onProgress?.({
      status: "analyzing",
      label: data.progress?.label ?? "Analyserar delkartan…",
      detail: data.progress?.detail,
    });
  }

  // Sista chansen: vänta in PUT om den fortfarande pågår.
  const finalAnalyze = await Promise.race([
    analyzePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  if (finalAnalyze && finalAnalyze.status === "ok" && finalAnalyze.analysis) {
    onProgress?.({ status: "ok", label: "Klar", detail: "Analysen är färdig." });
    return jsonResponse(finalAnalyze, 200);
  }

  const timeout = {
    error: "Analysen tog för lång tid. Försök igen — stora kartor kan behöva flera försök.",
    jobId,
  };
  onProgress?.({ status: "error", label: "Timeout", detail: timeout.error });
  return jsonResponse(timeout, 504);
}

export async function uploadImportPartial(
  mapSlug: string,
  file: File,
  options: UploadImportPartialOptions = {},
): Promise<Response> {
  const { onProgress } = options;
  onProgress?.({
    status: "uploading",
    label: "Laddar upp delkartan",
    detail: file.name,
  });

  if (file.size > BODY_LIMIT_BYTES) {
    return uploadImportPartialViaBlob(mapSlug, file, onProgress);
  }

  const res = await uploadViaFormData(`/api/maps/${mapSlug}/import-partial`, { file });
  if (res.status === 413) {
    const data = await readResponsePayload(res.clone());
    if (data.clientUploadRequired) {
      return uploadImportPartialViaBlob(mapSlug, file, onProgress);
    }
  }

  const data = await readResponsePayload(res);
  if (!res.ok) {
    return jsonResponse(
      { error: typeof data.error === "string" ? data.error : `Uppladdning misslyckades (HTTP ${res.status})` },
      res.status,
    );
  }

  if (data.status === "ok" && data.analysis && data.jobId) {
    onProgress?.({ status: "ok", label: "Klar" });
    return jsonResponse(data, 200);
  }
  if (!data.jobId || typeof data.jobId !== "string") {
    return jsonResponse({ error: "Saknar jobId i svar från servern" }, 500);
  }

  return analyzeAndPollImportPartial(mapSlug, data.jobId, onProgress);
}

async function uploadImportPartialViaBlob(
  mapSlug: string,
  file: File,
  onProgress?: (progress: ImportPartialUploadProgress) => void,
): Promise<Response> {
  const initRes = await fetch(`/api/maps/${mapSlug}/import-partial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size }),
  });

  if (initRes.status === 400) {
    const res = await uploadViaFormData(`/api/maps/${mapSlug}/import-partial`, { file });
    const data = await readResponsePayload(res);
    if (!res.ok) {
      return jsonResponse(
        { error: typeof data.error === "string" ? data.error : `Uppladdning misslyckades (HTTP ${res.status})` },
        res.status,
      );
    }
    if (data.status === "ok" && data.analysis) {
      return jsonResponse(data, 200);
    }
    if (typeof data.jobId === "string") {
      return analyzeAndPollImportPartial(mapSlug, data.jobId, onProgress);
    }
    return jsonResponse({ error: "Saknar jobId i svar från servern" }, 500);
  }

  const initData = await readResponsePayload(initRes);
  if (!initRes.ok) {
    return jsonResponse(
      {
        error:
          typeof initData.error === "string"
            ? initData.error
            : `Kunde inte förbereda uppladdning (HTTP ${initRes.status})`,
      },
      initRes.status,
    );
  }

  const jobId = typeof initData.jobId === "string" ? initData.jobId : null;
  const storagePath = typeof initData.storagePath === "string" ? initData.storagePath : null;
  if (!jobId || !storagePath) {
    return jsonResponse({ error: "Saknar jobId/storagePath i svar från servern" }, 500);
  }

  onProgress?.({
    status: "uploading",
    label: "Laddar upp delkartan",
    detail: "Skickar filen till lagringen…",
  });
  try {
    await upload(storagePath, file, {
      access: "private",
      handleUploadUrl: BLOB_UPLOAD_ROUTE,
      clientPayload: JSON.stringify({
        kind: "importPartial",
        jobId,
        slug: mapSlug,
      }),
    });
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : "Kunde inte ladda upp filen till lagringen",
      },
      500,
    );
  }

  return analyzeAndPollImportPartial(mapSlug, jobId, onProgress);
}
