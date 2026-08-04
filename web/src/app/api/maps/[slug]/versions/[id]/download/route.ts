import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
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

  try {
    const data = await readStoredFile(version.storagePath);

    await logAction(session.user.id, "DOWNLOAD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber: version.versionNumber,
    });

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(version.originalFilename)}"`,
        "Content-Length": String(data.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ error: "Filen kunde inte läsas" }, { status: 500 });
  }
}
