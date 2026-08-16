import { requireSession } from "@/lib/auth/api";
import { canCheckout } from "@/lib/auth/permissions";
import {
  importPartialPreviewPath,
  readImportPartialJob,
} from "@/lib/checkout/import-partial";
import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string; jobId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const { slug, jobId } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const job = await readImportPartialJob(jobId);
  if (!job || job.userId !== session.user.id || job.mapFileId !== map.id) {
    return NextResponse.json({ error: "Importjobbet hittades inte" }, { status: 404 });
  }

  const path = job.previewSvgPath ?? importPartialPreviewPath(jobId);
  if (!(await fileExists(path))) {
    return NextResponse.json(
      { error: "Förhandsvisning av delkartan saknas ännu." },
      { status: 404 },
    );
  }

  const svg = await readStoredFile(path);
  return new NextResponse(new Uint8Array(svg), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
