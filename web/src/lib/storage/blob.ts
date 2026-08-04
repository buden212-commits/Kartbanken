import { del, get, head, put, type PutBlobResult } from "@vercel/blob";

function getToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

function isBlobUrl(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

function contentTypeForPath(storagePath: string): string {
  if (storagePath.endsWith(".svg")) return "image/svg+xml";
  if (storagePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function toPutBody(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function blobPrivateOptions() {
  const token = getToken();
  return token ? { access: "private" as const, token } : { access: "private" as const };
}

function blobHeadOptions() {
  const token = getToken();
  return token ? { token } : {};
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadFile(
  storagePath: string,
  data: Buffer | Uint8Array,
): Promise<PutBlobResult> {
  return put(storagePath, toPutBody(data), {
    ...blobPrivateOptions(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentTypeForPath(storagePath),
    multipart: toPutBody(data).length > 20 * 1024 * 1024,
  });
}

export async function readStoredFile(storageRef: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const target = isBlobUrl(storageRef)
        ? storageRef
        : await resolvePathnameToUrl(storageRef);
      const result = await get(target, blobPrivateOptions());

      if (result?.statusCode === 200 && result.stream) {
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < 3) await sleep(400 * (attempt + 1));
  }

  console.error("readStoredFile failed:", storageRef, lastError);
  throw new Error(`Fil saknas i Blob: ${storageRef}`);
}

async function resolvePathnameToUrl(pathname: string): Promise<string> {
  const meta = await head(pathname, blobHeadOptions());
  return meta.url;
}

export async function deleteFile(storageRef: string): Promise<void> {
  try {
    const target = isBlobUrl(storageRef)
      ? storageRef
      : await resolvePathnameToUrl(storageRef).catch(() => storageRef);
    await del(target, blobHeadOptions());
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) return;
    throw err;
  }
}

export async function fileExists(storageRef: string): Promise<boolean> {
  try {
    await head(storageRef, blobHeadOptions());
    return true;
  } catch {
    if (isBlobUrl(storageRef)) return false;
    try {
      await head(await resolvePathnameToUrl(storageRef), blobHeadOptions());
      return true;
    } catch {
      return false;
    }
  }
}

export function supportsClientUploads(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL && process.env.BLOB_STORE_ID),
  );
}
