import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import { cropOcadBuffer } from "@/lib/ocad/ocad-export-server";
import {
  svgExportFrameToGeoBbox,
  type OcadExportVersion,
  type SvgExportFrame,
} from "@/lib/ocad/ocad-export-shared";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { createRequire } from "module";
import { NextResponse } from "next/server";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    getBounds: () => [number, number, number, number];
  }>;
};

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type ExportOcdRequest = {
  svgFrame: SvgExportFrame;
  ocadVersion: OcadExportVersion;
};

function parseExportRequest(body: unknown): ExportOcdRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Ogiltig exportförfrågan");
  }

  const { svgFrame, ocadVersion } = body as ExportOcdRequest;
  if (!svgFrame || typeof svgFrame !== "object") {
    throw new Error("Exportområde saknas");
  }

  const values = [
    svgFrame.centerX,
    svgFrame.centerY,
    svgFrame.widthUnits,
    svgFrame.heightUnits,
    ocadVersion,
  ];

  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("Exportområdet har ogiltiga värden");
  }

  if (svgFrame.widthUnits <= 0 || svgFrame.heightUnits <= 0) {
    throw new Error("Exportområdet har ogiltig storlek");
  }

  return { svgFrame, ocadVersion };
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const version = await prisma.mapVersion.findFirst({
    where: { id, mapFileId: map.id },
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  let exportRequest: ExportOcdRequest;
  try {
    exportRequest = parseExportRequest(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ogiltig exportförfrågan" },
      { status: 400 },
    );
  }

  try {
    const sourceBuffer = await readStoredFile(version.storagePath);
    const ocadFile = await readOcad(sourceBuffer, { quietWarnings: true });
    const bbox = svgExportFrameToGeoBbox(exportRequest.svgFrame, ocadFile.getBounds());

    const result = cropOcadBuffer(sourceBuffer, {
      bbox,
      targetVersion: exportRequest.ocadVersion,
    });

    const baseName = version.originalFilename.replace(/\.ocd$/i, "") || "karta";
    const fileName = `${baseName}-export-v${exportRequest.ocadVersion}.ocd`;

    await logAction(session.user.id, "EXPORT_OCD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber: version.versionNumber,
      ocadVersion: exportRequest.ocadVersion,
      keptObjects: result.keptObjects,
      removedObjects: result.removedObjects,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(result.buffer.byteLength),
      "X-Ocad-Kept-Objects": String(result.keptObjects),
      "X-Ocad-Removed-Objects": String(result.removedObjects),
    };

    if (result.versionWarning) {
      headers["X-Ocad-Version-Warning"] = encodeURIComponent(result.versionWarning);
    }

    return new NextResponse(new Uint8Array(result.buffer), { headers });
  } catch (err) {
    console.error("OCD export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCD-export misslyckades" },
      { status: 500 },
    );
  }
}
