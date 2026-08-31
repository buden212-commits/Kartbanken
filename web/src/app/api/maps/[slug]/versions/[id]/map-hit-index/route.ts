import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { loadMapHitIndexFromOcd } from "@/lib/ocad/map-hit-index";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

/** Lightweight spatial index for map feature snap (banläggning Klipp). */
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
    select: { storagePath: true, originalFilename: true },
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  try {
    const buffer = await readStoredFile(version.storagePath);
    const index = await loadMapHitIndexFromOcd(
      buffer,
      version.originalFilename,
    );
    return NextResponse.json(
      { index, count: index.length },
      {
        headers: {
          "Cache-Control": "private, max-age=3600",
        },
      },
    );
  } catch (err) {
    console.error("map-hit-index failed:", err);
    return NextResponse.json(
      { error: "Kunde inte bygga kartindex" },
      { status: 500 },
    );
  }
}
