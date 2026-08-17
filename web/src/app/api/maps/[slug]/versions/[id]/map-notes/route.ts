import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { ensureVersionMapNotes } from "@/lib/maps/version-map-notes";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 120;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const denied = assertVersionViewAccess(session, lookup.version);
  if (denied) return denied;

  const version = await prisma.mapVersion.findUnique({
    where: { id: lookup.version.id },
    select: {
      id: true,
      versionNumber: true,
      storagePath: true,
      mapNotes: true,
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  try {
    const mapNotes = await ensureVersionMapNotes(version);
    return NextResponse.json({
      versionNumber: version.versionNumber,
      mapNotes,
    });
  } catch (err) {
    console.error("Kunde inte läsa kartinformation:", err);
    return NextResponse.json(
      { error: "Kunde inte läsa kartinformation från filen" },
      { status: 500 },
    );
  }
}
