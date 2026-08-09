import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { isGeoreferencedCrs, parseOcadCrsFromSvg } from "@/lib/ocad/crs";
import { buildGeoreferencedGeoTiff } from "@/lib/ocad/geotiff-export";
import type { ExportFrame } from "@/lib/ocad/map-export";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import sharp from "sharp";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type ExportGeoTiffBody = {
  frame: ExportFrame;
  imageBase64: string;
};

function parseBody(body: unknown): ExportGeoTiffBody {
  if (!body || typeof body !== "object") {
    throw new Error("Ogiltig exportförfrågan");
  }
  const record = body as ExportGeoTiffBody;
  const { frame, imageBase64 } = record;
  if (!frame || typeof imageBase64 !== "string") {
    throw new Error("Bild och exportområde krävs");
  }
  const values = [frame.centerX, frame.centerY, frame.widthUnits, frame.heightUnits];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("Exportområdet har ogiltiga värden");
  }
  if (frame.widthUnits <= 0 || frame.heightUnits <= 0) {
    throw new Error("Exportområdet har ogiltig storlek");
  }
  return { frame, imageBase64 };
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const denied = assertVersionViewAccess(session, lookup.version);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  let parsed: ExportGeoTiffBody;
  try {
    parsed = parseBody(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ogiltig begäran" },
      { status: 400 },
    );
  }

  const version = await prisma.mapVersion.findUnique({
    where: { id: lookup.version.id },
    select: { previewSvgPath: true },
  });
  if (!version?.previewSvgPath) {
    return NextResponse.json({ error: "Kartpreview saknas" }, { status: 404 });
  }

  let svgText: string;
  try {
    const buffer = await readStoredFile(version.previewSvgPath);
    svgText = buffer.toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Kunde inte läsa kartpreview" }, { status: 500 });
  }

  const crs = parseOcadCrsFromSvg(svgText);
  if (!isGeoreferencedCrs(crs)) {
    return NextResponse.json(
      { error: "Kartan saknar georeferering — GeoTIFF-export kräver EPSG-koordinater i filen." },
      { status: 400 },
    );
  }

  const base64 = parsed.imageBase64.replace(/^data:image\/\w+;base64,/, "");
  let pngBuffer: Buffer;
  try {
    pngBuffer = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "Ogiltig bilddata" }, { status: 400 });
  }

  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tifBuffer = buildGeoreferencedGeoTiff({
    rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    frame: parsed.frame,
    crs,
  });

  await logAction(session.user.id, "MAP_GEOTIFF_EXPORT", "MapVersion", id, {
    mapSlug: slug,
    epsg: crs.epsg,
  });

  const safeTitle = lookup.map.title.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "karta";
  return new NextResponse(new Uint8Array(tifBuffer), {
    headers: {
      "Content-Type": "image/tiff",
      "Content-Disposition": `attachment; filename="${safeTitle}-georef.tif"`,
      "Cache-Control": "private, no-store",
    },
  });
}
