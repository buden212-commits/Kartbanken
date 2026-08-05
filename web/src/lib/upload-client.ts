"use client";

import { upload } from "@vercel/blob/client";

const BLOB_UPLOAD_ROUTE = "/api/blob/upload";

const BODY_LIMIT_BYTES = 4_500_000;

/** Direkt FormData-uppladdning (lokal lagring / små filer). */
export async function uploadViaFormData(
  url: string,
  fields: Record<string, string | File>,
): Promise<Response> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return fetch(url, { method: "POST", body: formData });
}

async function uploadMapVersionViaBlobClient(
  mapSlug: string,
  file: File,
  comment?: string,
): Promise<Response> {
  const extra: Record<string, string> = comment ? { comment } : {};

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
    body: JSON.stringify({ versionId: init.versionId, blobUrl: blob.url }),
  });
}

export async function uploadMapVersion(
  mapSlug: string,
  file: File,
  comment?: string,
): Promise<Response> {
  const extra: Record<string, string> = comment ? { comment } : {};

  if (file.size > BODY_LIMIT_BYTES) {
    return uploadMapVersionViaBlobClient(mapSlug, file, comment);
  }

  const res = await uploadViaFormData(`/api/maps/${mapSlug}/versions`, { file, ...extra });
  if (res.status === 413) {
    const data = (await res.clone().json().catch(() => ({}))) as {
      clientUploadRequired?: boolean;
    };
    if (data.clientUploadRequired) {
      return uploadMapVersionViaBlobClient(mapSlug, file, comment);
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
