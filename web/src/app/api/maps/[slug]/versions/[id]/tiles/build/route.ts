import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import {
  claimTilePyramidBuild,
  tileBuildProgressFromVersion,
} from "@/lib/ocad/tile-status";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

/**
 * Runs one build chunk inline. Background work scheduled with `after()` gets
 * killed once the response is sent, so the client drives the build by calling
 * this endpoint repeatedly while polling status for progress.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const { slug, id } = await params;
    const lookup = await getMapVersionOr404(slug, id);
    if (lookup instanceof NextResponse) return lookup;

    const denied = assertVersionViewAccess(session, lookup.version);
    if (denied) return denied;

    const versionId = lookup.version.id;
    const claim = await claimTilePyramidBuild(versionId);

    if (!claim.claimed) {
      return NextResponse.json({ status: claim.status, busy: true });
    }

    const { runNextTileBuildChunk } = await import("@/lib/ocad/tile-generate");
    try {
      await runNextTileBuildChunk(versionId);
    } catch (err) {
      console.error("Tile build chunk failed:", versionId, err);
    }

    const version = await prisma.mapVersion.findUnique({
      where: { id: versionId },
      select: {
        tileStatus: true,
        tileError: true,
        tileBuildTotal: true,
        tileBuildDone: true,
        tileBuildCurrentZ: true,
        tileBuildMaxZPregen: true,
      },
    });

    return NextResponse.json({
      status: version?.tileStatus ?? "ERROR",
      error: version?.tileError ?? null,
      busy: false,
      progress: version ? tileBuildProgressFromVersion(version) : null,
    });
  } catch (err) {
    console.error("Tile build failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte bygga karttiles" },
      { status: 500 },
    );
  }
}
