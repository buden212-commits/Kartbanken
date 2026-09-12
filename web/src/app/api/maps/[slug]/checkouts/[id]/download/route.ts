import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import {
  applyOcadTargetVersion,
  readOcadHeaderVersion,
} from "@/lib/ocad/ocad-export-server";
import {
  normalizeSourceVersion,
  ocadExportVersionLabel,
  parseOcadExportVersion,
  type OcadExportVersion,
} from "@/lib/ocad/ocad-export-shared";
import { buildOmapXml, type OmapExportOcadFile } from "@/lib/ocad/omap-export";
import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile } from "@/lib/storage";
import { serveStoredFile } from "@/lib/storage/stream-response";
import { createRequire } from "module";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<OmapExportOcadFile & { header: { version: number } }>;
};

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type DownloadFormat = "ocd" | "omap";

function parseFormat(value: string | null): DownloadFormat {
  return value === "omap" ? "omap" : "ocd";
}

function safeBaseName(title: string): string {
  return title.replace(/\s+/g, "-") || "karta";
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 });
  }

  const canDownload =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canDownload) {
    return NextResponse.json(
      { error: "Ingen behörighet att ladda ner utcheckning" },
      { status: 403 },
    );
  }

  if (!checkout.exportStoragePath) {
    return NextResponse.json({ error: "Subset-fil saknas" }, { status: 404 });
  }

  if (!(await fileExists(checkout.exportStoragePath))) {
    return NextResponse.json({ error: "Subset-fil saknas" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  const storedVersion =
    parseOcadExportVersion(checkout.exportOcadVersion) ?? (12 as OcadExportVersion);
  const requestedVersion =
    parseOcadExportVersion(url.searchParams.get("ocadVersion")) ?? storedVersion;
  const baseName = safeBaseName(map.title);

  try {
    // Samma format och version som vid skapandet — skicka den sparade filen rakt av.
    if (format === "ocd" && requestedVersion === storedVersion) {
      const fileName = `${baseName}-utcheckning-v${requestedVersion}-${id.slice(0, 8)}.ocd`;
      await logAction(session.user.id, "DOWNLOAD", "MapCheckout", checkout.id, {
        mapSlug: slug,
        kind: "subset",
        format: "ocd",
        ocadVersion: requestedVersion,
        ocadVersionLabel: ocadExportVersionLabel(requestedVersion),
      });
      return await serveStoredFile(
        checkout.exportStoragePath,
        {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
        { preferRedirect: true },
      );
    }

    const sourceBuffer = await readStoredFile(checkout.exportStoragePath);

    if (format === "omap") {
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

      // Subset-filen är redan beskuren till utcheckningen — exportera alla aktiva objekt.
      const result = buildOmapXml(ocadFile, {
        notes: `Utcheckning från Kartbanken (${slug}) exporterad till OpenOrienteering Mapper.`,
      });
      if (result.objectCount === 0) {
        return NextResponse.json(
          { error: "Utcheckningen innehåller inga objekt att exportera till Mapper." },
          { status: 400 },
        );
      }

      await logAction(session.user.id, "DOWNLOAD", "MapCheckout", checkout.id, {
        mapSlug: slug,
        kind: "subset",
        format: "omap",
        objectCount: result.objectCount,
        symbolCount: result.symbolCount,
      });

      const fileName = `${baseName}-utcheckning-${id.slice(0, 8)}.omap`;
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
    }

    // Annan OCAD-version: skriv om headerfälten i en kopia av subset-filen.
    const output = Buffer.from(sourceBuffer);
    const sourceVersion = normalizeSourceVersion(readOcadHeaderVersion(output));
    const versionWarning = applyOcadTargetVersion(output, sourceVersion, requestedVersion);

    await logAction(session.user.id, "DOWNLOAD", "MapCheckout", checkout.id, {
      mapSlug: slug,
      kind: "subset",
      format: "ocd",
      ocadVersion: requestedVersion,
      ocadVersionLabel: ocadExportVersionLabel(requestedVersion),
      sourceOcadVersion: sourceVersion,
      converted: sourceVersion !== requestedVersion,
    });

    const fileName = `${baseName}-utcheckning-v${requestedVersion}-${id.slice(0, 8)}.ocd`;
    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(output.length),
    });
    if (versionWarning) {
      headers.set("X-Ocad-Version-Warning", encodeURIComponent(versionWarning));
    }
    return new NextResponse(new Uint8Array(output), { status: 200, headers });
  } catch (err) {
    console.error("Checkout download failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Nedladdning misslyckades" },
      { status: 500 },
    );
  }
}
