import { logAction } from "@/lib/audit";
import { requireUpload } from "@/lib/auth/api";
import { sha256 } from "@/lib/hash";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { prisma } from "@/lib/prisma";
import {
  buildMapVersionPath,
  deleteFile,
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
          "Kunde inte läsa uppladdningen. Filen kan vara för stor — OCAD-filer på 20+ MB kräver att servergränsen är höjd (max 100 MB).",
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

  const comment = formData.get("comment")?.toString().trim() || null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = sha256(buffer);

  const latest = await prisma.mapVersion.findFirst({
    where: { mapFileId: map.id },
    orderBy: { versionNumber: "desc" },
  });

  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const storagePath = buildMapVersionPath(map.id, versionNumber);

  try {
    await uploadFile(storagePath, buffer);

    const version = await prisma.mapVersion.create({
      data: {
        mapFileId: map.id,
        versionNumber,
        storagePath,
        originalFilename: file.name,
        fileSizeBytes: file.size,
        contentHash,
        uploadedById: session.user.id,
        comment,
        parseStatus: "PENDING",
      },
    });

    await logAction(session.user.id, "UPLOAD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber,
      filename: file.name,
    });

    // Parsning + diff mot föregående version körs i bakgrunden
    void processVersionAfterUpload(map.id, version.id, latest?.id ?? null).catch(
      console.error,
    );

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
