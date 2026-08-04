import { randomUUID } from "crypto";
import * as blob from "./storage/blob";
import * as local from "./storage/local";

export type StorageBackend = "local" | "blob";

type StorageImpl = Pick<
  typeof local,
  "readStoredFile" | "deleteFile" | "fileExists" | "supportsClientUploads"
>;

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function hasBlobConfig(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL && process.env.BLOB_STORE_ID),
  );
}

function getBackend(): StorageBackend {
  const explicit = process.env.STORAGE_BACKEND?.toLowerCase();
  if (explicit === "blob") {
    if (!hasBlobConfig()) {
      throw new Error(
        "STORAGE_BACKEND=blob men BLOB_READ_WRITE_TOKEN saknas. Aktivera Vercel Blob i projektet.",
      );
    }
    return "blob";
  }
  if (explicit === "local") return "local";
  if (hasBlobConfig()) return "blob";
  if (isVercelRuntime()) {
    throw new Error(
      "Fillagring saknas på Vercel. Aktivera Vercel Blob (Storage → Blob) i Vercel Dashboard.",
    );
  }
  return "local";
}

let cachedImpl: StorageImpl | null = null;
let cachedBackend: StorageBackend | null = null;

function getImpl(): StorageImpl {
  if (!cachedImpl) {
    cachedBackend = getBackend();
    cachedImpl = cachedBackend === "blob" ? blob : local;
  }
  return cachedImpl;
}

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 104_857_600);

/** Vercel har ~4.5 MB request body-gräns — större filer laddas upp via Blob client upload. */
export const VERCEL_BODY_LIMIT_BYTES = 4_500_000;

export function getStorageBackend(): StorageBackend {
  if (!cachedBackend) getImpl();
  return cachedBackend!;
}

export function supportsClientUploads(): boolean {
  return getImpl().supportsClientUploads();
}

/** @deprecated Använd supportsClientUploads */
export function supportsPresignedUploads(): boolean {
  return supportsClientUploads();
}

export function shouldUseClientUpload(fileSizeBytes: number): boolean {
  return fileSizeBytes > VERCEL_BODY_LIMIT_BYTES;
}

/** @deprecated Använd shouldUseClientUpload */
export function shouldUsePresignedUpload(fileSizeBytes: number): boolean {
  return shouldUseClientUpload(fileSizeBytes);
}

/** Returnerar lagringsreferens (Blob-URL eller relativ sökväg) att spara i databasen. */
export async function uploadFile(
  storagePath: string,
  data: Buffer | Uint8Array,
): Promise<string> {
  if (getStorageBackend() === "blob") {
    const result = await blob.uploadFile(storagePath, data);
    return result.url;
  }
  await local.uploadFile(storagePath, data);
  return storagePath;
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return getImpl().readStoredFile(storagePath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  return getImpl().deleteFile(storagePath);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  return getImpl().fileExists(storagePath);
}

export function buildMapVersionPath(mapFileId: string, versionNumber: number): string {
  return `maps/${mapFileId}/v${versionNumber}/${randomUUID()}.ocd`;
}

export function buildCheckoutExportPath(mapFileId: string, checkoutId: string): string {
  return `maps/${mapFileId}/checkouts/${checkoutId}/subset-${randomUUID()}.ocd`;
}

export function buildCheckoutManifestPath(mapFileId: string, checkoutId: string): string {
  return `maps/${mapFileId}/checkouts/${checkoutId}/manifest-${randomUUID()}.json`;
}

export function buildCheckoutCheckinPath(mapFileId: string, checkoutId: string): string {
  return `maps/${mapFileId}/checkouts/${checkoutId}/checkin-${randomUUID()}.ocd`;
}

export function validateOcdUpload(
  filename: string,
  sizeBytes: number,
): { ok: true } | { ok: false; error: string } {
  if (!filename.toLowerCase().endsWith(".ocd")) {
    return { ok: false, error: "Endast .ocd-filer tillåts." };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Filen är för stor (max ${Math.round(MAX_UPLOAD_BYTES / 1_048_576)} MB).`,
    };
  }
  if (sizeBytes === 0) {
    return { ok: false, error: "Filen är tom." };
  }
  return { ok: true };
}
