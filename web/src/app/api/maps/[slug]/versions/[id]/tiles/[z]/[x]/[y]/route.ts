import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import {
  generateOnDemandTile,
  readTileManifest,
} from "@/lib/ocad/tile-generate";
import { isValidTileCoord } from "@/lib/ocad/tile-math";
import { buildTilePath } from "@/lib/ocad/tile-paths";
import { fileExists, readStoredFile } from "@/lib/storage";

export const maxDuration = 300;

type RouteParams = {
  params: Promise<{ slug: string; id: string; z: string; x: string; y: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id, z: zRaw, x: xRaw, y: yRaw } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const denied = assertVersionViewAccess(session, lookup.version);
  if (denied) return denied;

  const z = Number(zRaw);
  const x = Number(xRaw);
  const y = Number(yRaw);

  const version = await prisma.mapVersion.findUnique({
    where: { id: lookup.version.id },
    select: {
      id: true,
      mapFileId: true,
      versionNumber: true,
      storagePath: true,
      tileStatus: true,
      tileManifestPath: true,
    },
  });

  if (!version?.tileManifestPath || version.tileStatus !== "READY") {
    return NextResponse.json({ error: "Tiles är inte klara" }, { status: 409 });
  }

  let manifest;
  try {
    manifest = await readTileManifest(version.tileManifestPath);
  } catch {
    return NextResponse.json({ error: "Tile-manifest saknas" }, { status: 404 });
  }

  if (!isValidTileCoord(z, x, y, manifest.maxZ)) {
    return NextResponse.json({ error: "Ogiltig tile" }, { status: 400 });
  }

  const tilePath = buildTilePath(version.mapFileId, version.versionNumber, z, x, y);

  try {
    if (await fileExists(tilePath)) {
      const buf = await readStoredFile(tilePath);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400, immutable",
          "Content-Length": String(buf.byteLength),
        },
      });
    }
  } catch (err) {
    console.warn("Tile read failed, regenerating:", tilePath, err);
  }

  // Pregen levels should exist; regenerate from SVG path via on-demand for any z
  try {
    const ocdBuffer = await readStoredFile(version.storagePath);
    const webp = await generateOnDemandTile({
      ocdBuffer,
      manifest,
      mapFileId: version.mapFileId,
      versionNumber: version.versionNumber,
      z,
      x,
      y,
    });
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Length": String(webp.byteLength),
      },
    });
  } catch (err) {
    console.error("On-demand tile failed:", tilePath, err);
    return NextResponse.json({ error: "Kunde inte generera tile" }, { status: 500 });
  }
}
