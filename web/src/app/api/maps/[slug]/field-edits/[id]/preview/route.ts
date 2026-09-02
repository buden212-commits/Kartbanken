import { requireFieldEdit } from "@/lib/auth/api";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode } from "@/lib/checkout/types";
import { buildFieldEditPreviewPath } from "@/lib/field-edit/subset-preview";
import { generateAndStorePreviewSvg } from "@/lib/ocad/svg";
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
    return serveStoredFile(storagePath, PREVIEW_HEADERS, { preferRedirect: false });
  }

  return serveStoredFile(storagePath, PREVIEW_HEADERS, { preferRedirect: true });
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 });
  }

  const previewPath = buildFieldEditPreviewPath(map.id, id);
  if (await fileExists(previewPath)) {
    try {
      return await servePreview(request, previewPath);
    } catch (err) {
      console.warn("Field edit preview delivery failed:", err);
    }
  }

  if (!checkout.exportStoragePath) {
    return NextResponse.json({ error: "Delkarta saknas för fältredigeringen" }, { status: 404 });
  }

  try {
    const buffer = await readStoredFile(checkout.exportStoragePath);
    await generateAndStorePreviewSvg(buffer, previewPath);
    return await servePreview(request, previewPath);
  } catch (err) {
    console.error("Field edit preview generation failed:", err);
    return NextResponse.json({ error: "Kunde inte generera kartpreview" }, { status: 500 });
  }
}
