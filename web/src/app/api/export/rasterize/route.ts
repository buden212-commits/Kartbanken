import { requireSession } from "@/lib/auth/api";
import { rasterizeExportSvg } from "@/lib/ocad/export-rasterize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  mapSvg?: string;
  hudSvg?: string;
  rotationDeg?: number;
  widthPx?: number;
  heightPx?: number;
};

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) {
    return session;
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const mapSvg = body.mapSvg?.trim() ?? "";
  if (!mapSvg) {
    return NextResponse.json({ error: "Kart-SVG saknas" }, { status: 400 });
  }

  const widthPx = Number(body.widthPx);
  const heightPx = Number(body.heightPx);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 1 || heightPx < 1) {
    return NextResponse.json({ error: "Ogiltig bildstorlek" }, { status: 400 });
  }
  if (widthPx > 8000 || heightPx > 8000) {
    return NextResponse.json({ error: "Bildstorleken är för stor" }, { status: 400 });
  }

  const rotationDeg = Number(body.rotationDeg ?? 0);
  if (!Number.isFinite(rotationDeg) || Math.abs(rotationDeg) > 180) {
    return NextResponse.json({ error: "Ogiltig rotation" }, { status: 400 });
  }

  try {
    const png = await rasterizeExportSvg({
      mapSvg,
      hudSvg: body.hudSvg,
      rotationDeg,
      widthPx,
      heightPx,
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Export rasterize failed:", error);
    return NextResponse.json(
      { error: "Kunde inte rastrera kartbilden för export" },
      { status: 500 },
    );
  }
}
