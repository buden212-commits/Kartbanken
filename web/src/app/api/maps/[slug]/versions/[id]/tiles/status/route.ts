import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import {
  markTilePyramidPending,
  readTileManifest,
  tileBuildProgressFromVersion,
} from "@/lib/ocad/tile-status";
import { fileExists } from "@/lib/storage";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function loadTileStatusVersion(versionId: string) {
  return prisma.mapVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      tileStatus: true,
      tileError: true,
      tileManifestPath: true,
      tileBuildTotal: true,
      tileBuildDone: true,
      tileBuildCurrentZ: true,
      tileBuildMaxZPregen: true,
      tileBuildStartedAt: true,
      tileBuildStage: true,
    },
  });
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const { slug, id } = await params;
    const lookup = await getMapVersionOr404(slug, id);
    if (lookup instanceof NextResponse) return lookup;

    const denied = assertVersionViewAccess(session, lookup.version);
    if (denied) return denied;

    const version = await loadTileStatusVersion(lookup.version.id);

    if (!version) {
      return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
    }

    let status = version.tileStatus;
    let manifest = null;

    if (status === "READY" && version.tileManifestPath) {
      try {
        if (await fileExists(version.tileManifestPath)) {
          manifest = await readTileManifest(version.tileManifestPath);
        } else {
          status = "PENDING";
        }
      } catch {
        status = "ERROR";
      }
    }

    return NextResponse.json({
      status,
      error: version.tileError,
      manifest,
      progress: tileBuildProgressFromVersion(version),
    });
  } catch (err) {
    console.error("Tile status failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte hämta tile-status" },
      { status: 500 },
    );
  }
}

/** Reset so the next build request starts a fresh pyramid ("Försök igen"). */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const { slug, id } = await params;
    const lookup = await getMapVersionOr404(slug, id);
    if (lookup instanceof NextResponse) return lookup;

    const denied = assertVersionViewAccess(session, lookup.version);
    if (denied) return denied;

    await markTilePyramidPending(lookup.version.id);

    return NextResponse.json({ status: "PENDING" });
  } catch (err) {
    console.error("Tile reset failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte bygga om tiles" },
      { status: 500 },
    );
  }
}
