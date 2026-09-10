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

async function pollImportPartialJob(
  mapSlug: string,
  jobId: string,
  onProgress?: (progress: ImportPartialUploadProgress) => void,
): Promise<Response> {
  const started = Date.now();
  const maxMs = 14 * 60 * 1000;

  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await fetch(`/api/maps/${mapSlug}/import-partial/${jobId}`);
    const data = (await res.json().catch(() => ({}))) as ImportPartialPollPayload;
    if (!res.ok) {
      onProgress?.({
        status: "error",
        label: "Analysen misslyckades",
        detail: data.error ?? `HTTP ${res.status}`,
      });
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (data.status === "ok" && data.analysis) {
      onProgress?.({ status: "ok", label: "Klar", detail: "Analysen är färdig." });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (data.status === "error") {
      onProgress?.({
        status: "error",
        label: "Analysen misslyckades",
        detail: data.error ?? "Okänt fel",
      });
      return new Response(JSON.stringify(data), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    onProgress?.({
      status: "analyzing",
      label: data.progress?.label ?? "Analyserar delkartan…",
      detail: data.progress?.detail,
    });
  }

  const timeout = {
    error: "Analysen tog för lång tid. Försök igen — stora kartor kan behöva flera försök.",
  };
  onProgress?.({ status: "error", label: "Timeout", detail: timeout.error });
  return new Response(JSON.stringify(timeout), {
    status: 504,
    headers: { "Content-Type": "application/json" },
  });
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
    const data = (await res.clone().json().catch(() => ({}))) as {
      clientUploadRequired?: boolean;
    };
    if (data.clientUploadRequired) {
      return uploadImportPartialViaBlob(mapSlug, file, onProgress);
    }
  }

  if (!res.ok) return res;

  const data = (await res.json()) as ImportPartialPollPayload;
  if (data.status === "ok" && data.analysis) {
    onProgress?.({ status: "ok", label: "Klar" });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!data.jobId) {
    return new Response(JSON.stringify({ error: "Saknar jobId i svar" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  onProgress?.({
    status: "analyzing",
    label: data.progress?.label ?? "Analyserar delkartan…",
    detail: data.progress?.detail ?? "Parsar och jämför mot den stora kartan…",
  });
  return pollImportPartialJob(mapSlug, data.jobId, onProgress);
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
    if (!res.ok) return res;
    const data = (await res.json()) as ImportPartialPollPayload;
    if (data.status === "ok" && data.analysis) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (data.jobId) {
      onProgress?.({
        status: "analyzing",
        label: data.progress?.label ?? "Analyserar delkartan…",
        detail: data.progress?.detail,
      });
      return pollImportPartialJob(mapSlug, data.jobId, onProgress);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!initRes.ok) return initRes;

  const init = (await initRes.json()) as { jobId: string; storagePath: string };
  onProgress?.({
    status: "uploading",
    label: "Laddar upp delkartan",
    detail: "Skickar filen till lagringen…",
  });
  await upload(init.storagePath, file, {
    access: "private",
    handleUploadUrl: BLOB_UPLOAD_ROUTE,
    clientPayload: JSON.stringify({
      kind: "importPartial",
      jobId: init.jobId,
      slug: mapSlug,
    }),
  });

  onProgress?.({
    status: "analyzing",
    label: "Startar analys",
    detail: "Filen är uppladdad — jämför mot den stora kartan…",
  });
  const startRes = await fetch(`/api/maps/${mapSlug}/import-partial`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: init.jobId }),
  });
  if (!startRes.ok) return startRes;

  const started = (await startRes.json()) as ImportPartialPollPayload;
  if (started.status === "ok" && started.analysis) {
    return new Response(JSON.stringify(started), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  onProgress?.({
    status: "analyzing",
    label: started.progress?.label ?? "Analyserar delkartan…",
    detail: started.progress?.detail,
  });
  return pollImportPartialJob(mapSlug, init.jobId, onProgress);
}
