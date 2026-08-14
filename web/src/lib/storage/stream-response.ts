import { NextResponse } from "next/server";
import { openStoredFileStream } from "@/lib/storage";

/** Streamar en lagrad fil. Undviker Vercels 4,5 MB-gräns för buffrade function-svar. */
export async function streamStoredFile(
  storageRef: string,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const file = await openStoredFileStream(storageRef);
  const responseHeaders = new Headers(headers);
  if (file.size != null && !responseHeaders.has("Content-Length")) {
    responseHeaders.set("Content-Length", String(file.size));
  }
  return new NextResponse(file.stream, { headers: responseHeaders });
}
