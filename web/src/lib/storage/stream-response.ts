import { NextResponse } from "next/server";
import { createStoredFileAccessUrl, openStoredFileStream } from "@/lib/storage";

/**
 * Levererar en lagrad fil utan att buffra hela innehållet i functionsvar.
 * Mora Väst-preview är ~30–37 MB — över Vercels 4,5 MB-gräns för buffrade svar.
 *
 * Prefererar signerad Blob-URL (klienten hämtar direkt). Annars ström utan Content-Length
 * (Content-Length kan få plattformen att buffra och träffa samma gräns).
 */
export async function serveStoredFile(
  storageRef: string,
  headers: Record<string, string>,
  options?: { preferRedirect?: boolean },
): Promise<NextResponse> {
  const preferRedirect = options?.preferRedirect !== false;
  if (preferRedirect) {
    try {
      const accessUrl = await createStoredFileAccessUrl(storageRef);
      if (accessUrl) {
        return NextResponse.redirect(accessUrl, 307);
      }
    } catch (err) {
      console.warn("Kunde inte skapa signerad Blob-URL, strömmar istället:", storageRef, err);
    }
  }

  const file = await openStoredFileStream(storageRef);
  const responseHeaders = new Headers(headers);
  // Sätt inte Content-Length — det kan tvinga buffring och 4,5 MB-gränsen.
  responseHeaders.delete("Content-Length");
  return new NextResponse(file.stream, { headers: responseHeaders });
}

/** @deprecated Använd serveStoredFile */
export async function streamStoredFile(
  storageRef: string,
  headers: Record<string, string>,
): Promise<NextResponse> {
  return serveStoredFile(storageRef, headers, { preferRedirect: false });
}

/** JSON med tillfällig URL — för fetch() där CORS-redirect kan strula. */
export async function serveStoredFileAsDirectUrl(
  storageRef: string,
): Promise<NextResponse | null> {
  try {
    const accessUrl = await createStoredFileAccessUrl(storageRef);
    if (!accessUrl) return null;
    return NextResponse.json(
      { url: accessUrl },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    console.warn("Kunde inte skapa signerad Blob-URL:", storageRef, err);
    return null;
  }
}
