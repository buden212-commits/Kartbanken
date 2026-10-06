import { requireDownload } from "@/lib/auth/api";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { rasterizeExportSvg } from "@/lib/ocad/export-rasterize";
import {
  buildClippedExportSvg,
  buildExportHudSvg,
  buildMapScaleInfoSvg,
  exportFrameBbox,
  type ExportFrame,
} from "@/lib/ocad/map-export";
import { parseOcadMapScale } from "@/lib/ocad/svg-utils";
import { prisma } from "@/lib/prisma";
import { resolveExportRotationDeg } from "@/lib/settings/app-settings";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

type Body = {
  frame?: ExportFrame;
  rotationDeg?: number;
  exportScale?: number;
  suggestionOverlaySvg?: string;
};

const EXPORT_DPI = 200;

function mmToPx(mm: number): number {
  return Math.max(1, Math.round((mm / 25.4) * EXPORT_DPI));
}

function parseFrame(frame: unknown): ExportFrame {
  if (!frame || typeof frame !== "object") {
    throw new Error("Exportområde saknas");
  }
  const f = frame as ExportFrame;
  const values = [
    f.centerX,
    f.centerY,
    f.widthUnits,
    f.heightUnits,
    f.widthMm,
    f.heightMm,
  ];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("Exportområdet har ogiltiga värden");
  }
  if (f.widthUnits <= 0 || f.heightUnits <= 0 || f.widthMm <= 0 || f.heightMm <= 0) {
    throw new Error("Exportområdet har ogiltig storlek");
  }
  const bbox = exportFrameBbox(f);
  if (bbox.width <= 0 || bbox.height <= 0) {
    throw new Error("Exportområdet har ogiltig storlek");
  }
  return f;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const denied = assertVersionViewAccess(session, lookup.version);
  if (denied) return denied;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  let frame: ExportFrame;
  try {
    frame = parseFrame(body.frame);
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

  let rotationDeg =
    body.rotationDeg != null && Number.isFinite(Number(body.rotationDeg))
      ? Number(body.rotationDeg)
      : await resolveExportRotationDeg();
  if (Math.abs(rotationDeg) > 180) {
    return NextResponse.json({ error: "Ogiltig rotation" }, { status: 400 });
  }

  const pixelWidth = mmToPx(frame.widthMm);
  const pixelHeight = mmToPx(frame.heightMm);
  if (pixelWidth > 8000 || pixelHeight > 8000) {
    return NextResponse.json({ error: "Bildstorleken är för stor" }, { status: 400 });
  }

  const mapSvg = buildClippedExportSvg(
    svgText,
    frame,
    pixelWidth,
    pixelHeight,
    "",
    body.suggestionOverlaySvg,
    body.exportScale,
    0,
  );

  const scaleForLabel =
    body.exportScale != null &&
    Number.isFinite(body.exportScale) &&
    body.exportScale > 0
      ? body.exportScale
      : (parseOcadMapScale(svgText) ?? 15000);
  const hudSvg = buildExportHudSvg(
    frame,
    pixelWidth,
    pixelHeight,
    buildMapScaleInfoSvg(frame, scaleForLabel),
  );

  try {
    const png = await rasterizeExportSvg({
      mapSvg,
      hudSvg: hudSvg || undefined,
      rotationDeg,
      widthPx: pixelWidth,
      heightPx: pixelHeight,
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Version export rasterize failed:", error);
    return NextResponse.json(
      { error: "Kunde inte rastrera kartbilden för export" },
      { status: 500 },
    );
  }
}
