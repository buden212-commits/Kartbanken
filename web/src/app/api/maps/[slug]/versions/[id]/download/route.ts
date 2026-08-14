import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import { fileExists } from "@/lib/storage";
import { streamStoredFile } from "@/lib/storage/stream-response";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireDownload();
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

  if (!(await fileExists(version.storagePath))) {
    return NextResponse.json({ error: "Filen kunde inte läsas" }, { status: 500 });
  }

  try {
    await logAction(session.user.id, "DOWNLOAD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber: version.versionNumber,
    });

    return await streamStoredFile(version.storagePath, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(version.originalFilename)}"`,
    });
  } catch {
    return NextResponse.json({ error: "Filen kunde inte läsas" }, { status: 500 });
  }
}
