import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { cropOcadBuffer } from "@/lib/ocad/ocad-export-server";
import {
  normalizeSourceVersion,
  svgExportFrameToGeoBbox,
  type SvgExportFrame,
} from "@/lib/ocad/ocad-export-shared";
import { buildOmapXml, type OmapExportOcadFile } from "@/lib/ocad/omap-export";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { createRequire } from "module";
import { NextResponse } from "next/server";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<OmapExportOcadFile>;
};

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type ExportOmapRequest = {
  svgFrame: SvgExportFrame;
};

function parseExportRequest(body: unknown): ExportOmapRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Ogiltig exportförfrågan");
  }

  const { svgFrame } = body as ExportOmapRequest;
  if (!svgFrame || typeof svgFrame !== "object") {
    throw new Error("Exportområde saknas");
  }

  const values = [
    svgFrame.centerX,
    svgFrame.centerY,
    svgFrame.widthUnits,
    svgFrame.heightUnits,
  ];

  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("Exportområdet har ogiltiga värden");
  }

  if (svgFrame.widthUnits <= 0 || svgFrame.heightUnits <= 0) {
    throw new Error("Exportområdet har ogiltig storlek");
  }

  return { svgFrame };
}

export async function POST(request: Request, { params }: RouteParams) {
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

  let exportRequest: ExportOmapRequest;
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
    const sourceVersion = normalizeSourceVersion(ocadFile.header.version);

    if (![10, 11, 12, 18].includes(sourceVersion)) {
      return NextResponse.json(
        {
          error: `OCAD version ${ocadFile.header.version} stöds inte för Mapper-export. Stödda versioner: 10, 11, 12 och 2018.`,
        },
        { status: 400 },
      );
    }

    const bounds = ocadFile.getBounds?.() ?? ([0, 0, 0, 0] as [number, number, number, number]);
    const bbox = svgExportFrameToGeoBbox(exportRequest.svgFrame, bounds);

    // Soft-crop to discover which object indices fall in the viewport, then
    // rebuild as native Mapper XML (keeps only those objects).
    const crop = cropOcadBuffer(sourceBuffer, {
      bbox,
      targetVersion: sourceVersion === 18 ? 18 : sourceVersion === 11 ? 11 : sourceVersion === 10 ? 10 : 12,
      allowEmpty: true,
    });

    const result = buildOmapXml(ocadFile, {
      bbox,
      keptObjectIndices: crop.keptObjectIndices,
      notes: `Exporterad från Kartbanken (${lookup.map.slug} / version ${version.id.slice(0, 8)}) till OpenOrienteering Mapper.`,
    });

    if (result.objectCount === 0) {
      return NextResponse.json(
        { error: "Inga objekt i exportområdet — zooma ut eller välj ett annat utsnitt." },
        { status: 400 },
      );
    }

    await logAction(session.user.id, "MAP_OMAP_EXPORT", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber: version.versionNumber,
      objectCount: result.objectCount,
      symbolCount: result.symbolCount,
      kept: crop.keptObjects,
      removed: crop.removedObjects,
    });

    const baseName = version.originalFilename.replace(/\.ocd$/i, "") || slug || "karta";
    const fileName = `${baseName}-export.omap`;
    const body = Buffer.from(result.xml, "utf8");
    const headers = new Headers({
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(body.length),
      "X-Omap-Objects": String(result.objectCount),
      "X-Omap-Symbols": String(result.symbolCount),
      "X-Omap-Colors": String(result.colorCount),
    });
    if (result.warnings.length > 0) {
      headers.set(
        "X-Omap-Warnings",
        encodeURIComponent(result.warnings.slice(0, 5).join(" · ")),
      );
    }

    return new NextResponse(body, { status: 200, headers });
  } catch (err) {
    console.error("export-omap failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mapper-export misslyckades" },
      { status: 500 },
    );
  }
}
