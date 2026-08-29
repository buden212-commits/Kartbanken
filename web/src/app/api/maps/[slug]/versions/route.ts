import { logAction } from "@/lib/audit";
import { requireUpload } from "@/lib/auth/api";
import { queueNotifyAdminOfNewUpload } from "@/lib/email";
import { runAfterResponse } from "@/lib/background";
import { sha256 } from "@/lib/hash";
import { assertMapAllowsUpload, checkVersionUploadGuards } from "@/lib/maps/upload-guards";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { appendOcadMapNotesIfComment, displayMapNotesUserName, extractOcadMapNotes } from "@/lib/ocad/ocad-map-notes";
import { prisma } from "@/lib/prisma";
import type { Role as RoleType } from "@/lib/roles";
import {
  buildMapVersionPath,
  deleteFile,
  shouldUseClientUpload,
  uploadFile,
  validateOcdUpload,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireUpload();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("formData parse failed:", err);
    return NextResponse.json(
      {
        error:
          "Kunde inte läsa uppladdningen. Stora filer (>4 MB) kräver Blob client upload via upload-init.",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil uppladdad" }, { status: 400 });
  }

  const validation = validateOcdUpload(file.name, file.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (shouldUseClientUpload(file.size)) {
    return NextResponse.json(
      {
        error: "Filen är för stor för direktuppladdning. Använd upload-init/upload-complete.",
        clientUploadRequired: true,
      },
      { status: 413 },
    );
  }

  const comment = formData.get("comment")?.toString().trim() || null;
  const forceDespiteCheckouts = formData.get("forceDespiteCheckouts") === "true";
  const forceDuplicate = formData.get("forceDuplicate") === "true";
  const uploaded = Buffer.from(await file.arrayBuffer());
  const notes = appendOcadMapNotesIfComment(uploaded, {
    comment,
    userName: displayMapNotesUserName({
      name: session.user.name,
      email: session.user.email,
    }),
  });
  const buffer = Buffer.from(notes.buffer);
  const contentHash = sha256(buffer);

  const mapRecord = await prisma.mapFile.findUnique({
    where: { id: map.id },
    select: { id: true, archivedAt: true },
  });
  if (!mapRecord) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const archiveGuard = await assertMapAllowsUpload(
    mapRecord.id,
    mapRecord.archivedAt,
    session.user.role as RoleType,
  );
  if (!archiveGuard.ok) {
    return NextResponse.json({ error: archiveGuard.error, code: archiveGuard.code }, { status: 403 });
  }

  const latest = await prisma.mapVersion.findFirst({
    where: { mapFileId: map.id },
    orderBy: { versionNumber: "desc" },
  });

  const uploadGuard = await checkVersionUploadGuards(map.id, contentHash, latest, {
    role: session.user.role as RoleType,
    forceDespiteCheckouts,
    forceDuplicate,
  });
  if (!uploadGuard.ok) {
    return NextResponse.json(
      {
        error: uploadGuard.error,
        code: uploadGuard.code,
        activeCheckoutCount: uploadGuard.activeCheckoutCount,
      },
      { status: 409 },
    );
  }

  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const storagePath = buildMapVersionPath(map.id, versionNumber);

  try {
    const storedRef = await uploadFile(storagePath, buffer);

    const version = await prisma.mapVersion.create({
      data: {
        mapFileId: map.id,
        versionNumber,
        storagePath: storedRef,
        originalFilename: file.name,
        fileSizeBytes: buffer.byteLength,
        contentHash,
        uploadedById: session.user.id,
        comment,
        mapNotes: extractOcadMapNotes(buffer),
        parseStatus: "PENDING",
      },
    });

    await logAction(session.user.id, "UPLOAD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber,
      filename: file.name,
    });

    runAfterResponse(() =>
      processVersionAfterUpload(map.id, version.id, latest?.id ?? null),
    );

    queueNotifyAdminOfNewUpload({
      uploader: { name: session.user.name, email: session.user.email },
      map: { title: map.title, slug: map.slug },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        originalFilename: file.name,
        comment,
        storagePath: storedRef,
      },
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
  } catch (err) {
    await deleteFile(storagePath);
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Uppladdning misslyckades" }, { status: 500 });
  }
}
