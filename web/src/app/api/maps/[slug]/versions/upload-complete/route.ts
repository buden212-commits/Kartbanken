import { logAction } from "@/lib/audit";
import { requireUpload } from "@/lib/auth/api";
import { notifyAdminOfNewUpload } from "@/lib/email";
import { runAfterResponse } from "@/lib/background";
import { sha256 } from "@/lib/hash";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { prisma } from "@/lib/prisma";
import {
  deleteFile,
  fileExists,
  readStoredFile,
  supportsClientUploads,
  validateOcdUpload,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireUpload();
  if (session instanceof NextResponse) return session;

  if (!supportsClientUploads()) {
    return NextResponse.json({ error: "Client upload är inte aktiverat" }, { status: 400 });
  }

  const { slug } = await params;
  const body = await request.json();
  const versionId = body.versionId as string | undefined;
  const blobUrl = body.blobUrl as string | undefined;

  if (!versionId) {
    return NextResponse.json({ error: "Ange versionId" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const version = await prisma.mapVersion.findFirst({
    where: { id: versionId, mapFileId: map.id },
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  if (version.contentHash) {
    return NextResponse.json({ error: "Versionen är redan slutförd" }, { status: 409 });
  }

  let storageRef = version.storagePath;
  if (blobUrl) {
    await prisma.mapVersion.update({
      where: { id: versionId },
      data: { storagePath: blobUrl },
    });
    storageRef = blobUrl;
  }

  const exists = await fileExists(storageRef);
  if (!exists) {
    return NextResponse.json(
      { error: "Filen hittades inte i lagringen. Ladda upp via Blob client upload först." },
      { status: 400 },
    );
  }

  const validation = validateOcdUpload(version.originalFilename, version.fileSizeBytes);
  if (!validation.ok) {
    await deleteFile(storageRef);
    await prisma.mapVersion.delete({ where: { id: versionId } });
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let contentHash: string;
  try {
    const buffer = await readStoredFile(storageRef);
    if (buffer.length !== version.fileSizeBytes) {
      return NextResponse.json(
        { error: "Filstorlek matchar inte. Försök ladda upp igen." },
        { status: 400 },
      );
    }
    contentHash = sha256(buffer);
  } catch (err) {
    console.error("Complete upload read failed:", err);
    return NextResponse.json({ error: "Kunde inte läsa uppladdad fil" }, { status: 500 });
  }

  const latest = await prisma.mapVersion.findFirst({
    where: {
      mapFileId: map.id,
      versionNumber: { lt: version.versionNumber },
    },
    orderBy: { versionNumber: "desc" },
  });

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { contentHash },
  });

  await logAction(session.user.id, "UPLOAD", "MapVersion", version.id, {
    mapSlug: slug,
    versionNumber: version.versionNumber,
    filename: version.originalFilename,
  });

  runAfterResponse(() =>
    processVersionAfterUpload(map.id, version.id, latest?.id ?? null),
  );

  void notifyAdminOfNewUpload({
    uploader: { name: session.user.name, email: session.user.email },
    map: { title: map.title, slug: map.slug },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      originalFilename: version.originalFilename,
      comment: version.comment,
      storagePath: storageRef,
    },
  }).catch((err) => {
    console.error("[email] Failed to send upload notification:", err);
  });

  return NextResponse.json(
    {
      id: version.id,
      versionNumber: version.versionNumber,
      contentHash,
      duplicateOfPrevious: latest?.contentHash === contentHash,
      previousVersionId: latest?.id ?? null,
    },
    { status: 201 },
  );
}
