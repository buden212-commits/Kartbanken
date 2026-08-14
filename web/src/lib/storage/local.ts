import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");

function resolvePath(storagePath: string): string {
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, storagePath);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
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

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await unlink(resolvePath(storagePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await readFile(resolvePath(storagePath));
    return true;
  } catch {
    return false;
  }
}

export function supportsClientUploads(): boolean {
  return false;
}
