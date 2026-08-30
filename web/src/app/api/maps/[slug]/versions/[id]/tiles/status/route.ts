import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { canUpload } from "@/lib/auth/permissions";
import { runAfterResponse } from "@/lib/background";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import {
  claimTilePyramidBuild,
  markTilePyramidPending,
  readTileManifest,
} from "@/lib/ocad/tile-status";
import { fileExists } from "@/lib/storage";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
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
        tileStatus: true,
        tileError: true,
        tileManifestPath: true,
      },
    });

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

    if (status === "PENDING" || status === "ERROR" || (status === "READY" && !manifest)) {
      const claim = await claimTilePyramidBuild(version.id);
      if (claim.claimed) {
        status = "PROCESSING";
        const versionId = version.id;
        runAfterResponse(async () => {
          const { buildTilePyramidForVersion } = await import("@/lib/ocad/tile-generate");
          await buildTilePyramidForVersion(versionId);
        });
      } else {
        status = claim.status === "MISSING" ? status : claim.status;
      }
    }

    return NextResponse.json({
      status,
      error: version.tileError,
      manifest,
    });
  } catch (err) {
    console.error("Tile status failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte hämta tile-status" },
      { status: 500 },
    );
  }
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    if (!canUpload(session.user.role)) {
      return NextResponse.json({ error: "Otillräcklig behörighet" }, { status: 403 });
    }

    const { slug, id } = await params;
    const lookup = await getMapVersionOr404(slug, id);
    if (lookup instanceof NextResponse) return lookup;

    const denied = assertVersionViewAccess(session, lookup.version);
    if (denied) return denied;

    const versionId = lookup.version.id;
    await markTilePyramidPending(versionId);
    runAfterResponse(async () => {
      const { rebuildTilePyramid } = await import("@/lib/ocad/tile-generate");
      await rebuildTilePyramid(versionId);
    });

    return NextResponse.json({ status: "PROCESSING" });
  } catch (err) {
    console.error("Tile rebuild failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte bygga om tiles" },
      { status: 500 },
    );
  }
}
