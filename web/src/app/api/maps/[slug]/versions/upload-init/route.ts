import { requireUpload } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  buildMapVersionPath,
  supportsClientUploads,
  validateOcdUpload,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireUpload();
  if (session instanceof NextResponse) return session;

  if (!supportsClientUploads()) {
    return NextResponse.json(
      { error: "Client upload kräver Vercel Blob. Använd FormData-uppladdning lokalt." },
      { status: 400 },
    );
  }

  const { slug } = await params;
  const body = await request.json();
  const filename = body.filename as string | undefined;
  const size = body.size as number | undefined;
  const comment = (body.comment as string | undefined)?.trim() || null;

  if (!filename || !size) {
    return NextResponse.json({ error: "Ange filename och size" }, { status: 400 });
  }

  const validation = validateOcdUpload(filename, size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const latest = await prisma.mapVersion.findFirst({
    where: { mapFileId: map.id },
    orderBy: { versionNumber: "desc" },
  });

  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const storagePath = buildMapVersionPath(map.id, versionNumber);

  const version = await prisma.mapVersion.create({
    data: {
      mapFileId: map.id,
      versionNumber,
      storagePath,
      originalFilename: filename,
      fileSizeBytes: size,
      uploadedById: session.user.id,
      comment,
      parseStatus: "PENDING",
    },
  });

  return NextResponse.json({
    versionId: version.id,
    storagePath,
    versionNumber,
  });
}
