/**
 * Bind Blob-uppladdningar till server-auktoriserade sökvägar.
 */

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** Extraherar pathname från full Blob-URL eller returnerar oförändrad relativ sökväg. */
export function blobRefToPathname(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.replace(/^\/+/, "");
  }
  try {
    const url = new URL(trimmed);
    // Vercel Blob URL: https://….blob.vercel-storage.com/<pathname>
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return trimmed;
  }
}

export function pathnamesEqual(a: string, b: string): boolean {
  return blobRefToPathname(a) === blobRefToPathname(b);
}

export function isMapVersionPath(pathname: string, mapFileId: string, versionNumber: number): boolean {
  const re = new RegExp(
    `^maps/${escapeRe(mapFileId)}/v${versionNumber}/${UUID_RE}\\.ocd$`,
    "i",
  );
  return re.test(pathname);
}

export function isCheckoutCheckinPath(pathname: string, mapFileId: string, checkoutId: string): boolean {
  const re = new RegExp(
    `^maps/${escapeRe(mapFileId)}/checkouts/${escapeRe(checkoutId)}/checkin-${UUID_RE}\\.ocd$`,
    "i",
  );
  return re.test(pathname);
}

export function isSuggestionAttachmentPath(pathname: string, mapFileId: string): boolean {
  const re = new RegExp(
    `^maps/${escapeRe(mapFileId)}/suggestion-attachments/${UUID_RE}\\.(jpe?g|png|webp)$`,
    "i",
  );
  return re.test(pathname);
}

export function isVerifyComparePath(pathname: string, jobId: string, slot: "A" | "B"): boolean {
  // temp-compare paths — keep permissive of known builder format
  const lower = pathname.toLowerCase();
  return (
    lower.includes(`verify-compare/${jobId.toLowerCase()}`) ||
    lower.includes(`temp-compare/${jobId.toLowerCase()}`) ||
    (lower.includes(jobId.toLowerCase()) && (slot === "A" ? lower.includes("-a") || lower.includes("/a/") : lower.includes("-b") || lower.includes("/b/")))
  );
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
