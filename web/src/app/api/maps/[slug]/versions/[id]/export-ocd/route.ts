import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { cropOcadBuffer, markAllActiveObjectsDeleted, applyOcadTargetVersion } from "@/lib/ocad/ocad-export-server";
import {
  appendSuggestionsToOcadBuffer,
  validateOcdSuggestionSymbolMapping,
  type OcdSuggestionSymbolMapping,
} from "@/lib/ocad/ocad-suggestion-export";
import {
  normalizeSourceVersion,
  svgExportFrameToGeoBbox,
  type OcadExportVersion,
  type SvgExportFrame,
} from "@/lib/ocad/ocad-export-shared";
import { listSuggestionOverlaysForVersion } from "@/lib/suggestion/repository";
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
    header: { version: number };
    getBounds: () => [number, number, number, number];
  }>;
};

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type ExportOcdRequest = {
  svgFrame: SvgExportFrame;
  ocadVersion: OcadExportVersion;
  includeSuggestions?: boolean;
  suggestionSymbols?: OcdSuggestionSymbolMapping;
};

function parseExportRequest(body: unknown): ExportOcdRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Ogiltig exportförfrågan");
  }

  const { svgFrame, ocadVersion, includeSuggestions, suggestionSymbols } = body as ExportOcdRequest;
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

  if (includeSuggestions && !validateOcdSuggestionSymbolMapping(suggestionSymbols)) {
    throw new Error("Ogiltig symbolmappning för kartförslag");
  }

  return { svgFrame, ocadVersion, includeSuggestions: !!includeSuggestions, suggestionSymbols };
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
    const sourceVersion = normalizeSourceVersion(ocadFile.header.version);

    let outputBuffer: Buffer;
    let keptObjects = 0;
    let removedObjects = 0;
    let versionWarning: string | undefined;
    let appendedSuggestions = 0;
    const suggestionWarnings: string[] = [];

    if (exportRequest.includeSuggestions && exportRequest.suggestionSymbols) {
      const overlays = await listSuggestionOverlaysForVersion(lookup.map.id, version.id);
      const geometries = overlays.map((item) => item.geometry);
      if (geometries.length === 0) {
        throw new Error("Inga öppna eller pågående kartförslag att exportera.");
      }

      const cleared = markAllActiveObjectsDeleted(sourceBuffer);
      outputBuffer = cleared.buffer;
      removedObjects = cleared.removedObjects;

      versionWarning = applyOcadTargetVersion(
        outputBuffer,
        sourceVersion,
        exportRequest.ocadVersion,
      );

      const appendResult = await appendSuggestionsToOcadBuffer(
        outputBuffer,
        geometries,
        exportRequest.suggestionSymbols,
        { symbolSourceBuffer: sourceBuffer },
      );
      outputBuffer = appendResult.buffer;
      appendedSuggestions = appendResult.appended;
      keptObjects = appendResult.appended;
      suggestionWarnings.push(...appendResult.warnings);
    } else {
      const bbox = svgExportFrameToGeoBbox(exportRequest.svgFrame, ocadFile.getBounds());
      const result = cropOcadBuffer(sourceBuffer, {
        bbox,
        targetVersion: exportRequest.ocadVersion,
      });
      outputBuffer = result.buffer;
      keptObjects = result.keptObjects;
      removedObjects = result.removedObjects;
      versionWarning = result.versionWarning;
    }

    const baseName = version.originalFilename.replace(/\.ocd$/i, "") || "karta";
    const fileSuffix = exportRequest.includeSuggestions ? "forslag" : "export";
    const fileName = `${baseName}-${fileSuffix}-v${exportRequest.ocadVersion}.ocd`;

    await logAction(session.user.id, "EXPORT_OCD", "MapVersion", version.id, {
      mapSlug: slug,
      versionNumber: version.versionNumber,
      ocadVersion: exportRequest.ocadVersion,
      keptObjects,
      removedObjects,
      appendedSuggestions,
      suggestionsOnly: exportRequest.includeSuggestions,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(outputBuffer.byteLength),
      "X-Ocad-Kept-Objects": String(keptObjects),
      "X-Ocad-Removed-Objects": String(removedObjects),
    };

    if (appendedSuggestions > 0) {
      headers["X-Ocad-Appended-Suggestions"] = String(appendedSuggestions);
    }

    if (suggestionWarnings.length > 0) {
      headers["X-Ocad-Suggestion-Warnings"] = encodeURIComponent(
        suggestionWarnings.slice(0, 5).join(" "),
      );
    }

    if (versionWarning) {
      headers["X-Ocad-Version-Warning"] = encodeURIComponent(versionWarning);
    }

    return new NextResponse(new Uint8Array(outputBuffer), { headers });
  } catch (err) {
    console.error("OCD export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCD-export misslyckades" },
      { status: 500 },
    );
  }
}
