import { requireSession } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import {
  buildPreviewSvgPath,
  ensureSvgMetadata,
  generateAndStorePreviewSvg,
  generateOcadSvgLayered,
  svgBufferHasLayers,
  svgBufferHasMetadata,
} from "@/lib/ocad/svg";
import { prisma } from "@/lib/prisma";
import { fileExists, readStoredFile, uploadFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function readPreviewOrNull(storagePath: string): Promise<Buffer | null> {
  try {
    if (!(await fileExists(storagePath))) return null;
    return await readStoredFile(storagePath);
  } catch (err) {
    console.warn("Preview SVG kunde inte läsas, regenererar:", storagePath, err);
    return null;
  }
}

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
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  let previewSvgPath = version.previewSvgPath;
  let svgBuffer = previewSvgPath ? await readPreviewOrNull(previewSvgPath) : null;

  if (!svgBuffer) {
    previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
    try {
      const buffer = await readStoredFile(version.storagePath);
      await generateAndStorePreviewSvg(buffer, previewSvgPath);
      svgBuffer = await readStoredFile(previewSvgPath);
      await prisma.mapVersion.update({
        where: { id: version.id },
        data: { previewSvgPath },
      });
    } catch (err) {
      console.error("Preview SVG generation failed:", err);
      return NextResponse.json(
        { error: "Kunde inte generera kartpreview" },
        { status: 500 },
      );
    }
  }

  try {
    let ocdBuffer: Buffer | null = null;

    const needsLayerUpgrade = !svgBufferHasLayers(svgBuffer);
    const needsMetadata = !svgBufferHasMetadata(svgBuffer);

    if (needsLayerUpgrade || needsMetadata) {
      ocdBuffer = await readStoredFile(version.storagePath);

      if (needsLayerUpgrade) {
        const { svg } = await generateOcadSvgLayered(ocdBuffer);
        svgBuffer = Buffer.from(svg, "utf-8");
        await uploadFile(previewSvgPath!, svgBuffer);
      } else if (needsMetadata) {
        const { buffer, changed } = await ensureSvgMetadata(svgBuffer, ocdBuffer);
        if (changed) {
          await uploadFile(previewSvgPath!, buffer);
        }
        svgBuffer = buffer;
      }
    }

    return new NextResponse(new Uint8Array(svgBuffer), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(svgBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("Preview read failed:", err);
    return NextResponse.json({ error: "Preview saknas" }, { status: 404 });
  }
}
