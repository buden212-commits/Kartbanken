import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import {
  buildPreviewSvgPath,
  generateAndStorePreviewSvg,
} from "@/lib/ocad/svg";
import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile } from "@/lib/storage";
import {
  serveStoredFile,
  serveStoredFileAsDirectUrl,
} from "@/lib/storage/stream-response";
import { SVG_RESPONSE_SECURITY_HEADERS } from "@/lib/security/svg-sanitize";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

const PREVIEW_HEADERS = {
  ...SVG_RESPONSE_SECURITY_HEADERS,
  "Cache-Control": "private, max-age=3600",
};

async function servePreview(request: Request, storagePath: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const wantsDirect =
    url.searchParams.get("direct") === "1" ||
    (request.headers.get("accept") ?? "").includes("application/json");

  if (wantsDirect) {
    const direct = await serveStoredFileAsDirectUrl(storagePath);
    if (direct) return direct;
    // Fallback: strömma utan Content-Length (redirect kan strula med CORS i fetch).
    return serveStoredFile(storagePath, PREVIEW_HEADERS, { preferRedirect: false });
  }

  return serveStoredFile(storagePath, PREVIEW_HEADERS, { preferRedirect: true });
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const denied = assertVersionViewAccess(session, lookup.version);
  if (denied) return denied;

  const version = await prisma.mapVersion.findUnique({
    where: { id: lookup.version.id },
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  const cachedOnly = new URL(request.url).searchParams.get("cached") === "1";

  let previewSvgPath = version.previewSvgPath;
  if (previewSvgPath && (await fileExists(previewSvgPath))) {
    try {
      return await servePreview(request, previewSvgPath);
    } catch (err) {
      console.warn("Preview SVG kunde inte levereras:", previewSvgPath, err);
    }
  }

  if (cachedOnly) {
    return NextResponse.json(
      { error: "Kartbilden är inte redo ännu. Öppna området så kartan hinner laddas, och försök igen." },
      { status: 404 },
    );
  }

  previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
  try {
    const buffer = await readStoredFile(version.storagePath);
    await generateAndStorePreviewSvg(buffer, previewSvgPath);
    await prisma.mapVersion.update({
      where: { id: version.id },
      data: { previewSvgPath },
    });
    return await servePreview(request, previewSvgPath);
  } catch (err) {
    console.error("Preview SVG generation failed:", err);
    return NextResponse.json(
      { error: "Kunde inte generera kartpreview" },
      { status: 500 },
    );
  }
}
