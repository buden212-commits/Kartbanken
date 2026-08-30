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
  buildTilePyramidForVersion,
  claimTilePyramidBuild,
  readTileManifest,
  rebuildTilePyramid,
} from "@/lib/ocad/tile-generate";
import { fileExists } from "@/lib/storage";

export const maxDuration = 300;

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
      runAfterResponse(() => buildTilePyramidForVersion(version.id));
    } else {
      status = claim.status === "MISSING" ? status : claim.status;
    }
  }

  return NextResponse.json({
    status,
    error: version.tileError,
    manifest,
  });
}

export async function POST(_request: Request, { params }: RouteParams) {
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

  runAfterResponse(() => rebuildTilePyramid(lookup.version.id));

  return NextResponse.json({ status: "PROCESSING" });
}
