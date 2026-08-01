import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");

function resolvePath(storagePath: string): string {
  const full = path.resolve(STORAGE_ROOT, storagePath);
  const root = path.resolve(STORAGE_ROOT);
  if (!full.startsWith(root)) {
    throw new Error("Ogiltig lagringssökväg");
  }
  return full;
}

export async function uploadFile(
  storagePath: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const fullPath = resolvePath(storagePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(resolvePath(storagePath));
}

export function getStorageAbsolutePath(storagePath: string): string {
  return resolvePath(storagePath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await unlink(resolvePath(storagePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function buildMapVersionPath(mapFileId: string, versionNumber: number): string {
  return `maps/${mapFileId}/v${versionNumber}/${randomUUID()}.ocd`;
}

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 104_857_600);

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
