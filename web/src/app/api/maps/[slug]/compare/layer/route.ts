import { requireSession } from "@/lib/auth/api";
import { assertVersionViewAccess } from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

const VALID_LAYERS = new Set(["added", "removed", "modified"]);

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const v1 = searchParams.get("v1");
  const v2 = searchParams.get("v2");
  const layer = searchParams.get("layer");

  if (!v1 || !v2 || !layer || !VALID_LAYERS.has(layer)) {
    return NextResponse.json({ error: "Ange v1, v2 och layer (added|removed|modified)" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: map.id },
      select: { isPublished: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: map.id },
      select: { isPublished: true },
    }),
  ]);

  if (!versionA || !versionB) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  const deniedA = assertVersionViewAccess(session, versionA);
  if (deniedA) return deniedA;
  const deniedB = assertVersionViewAccess(session, versionB);
  if (deniedB) return deniedB;

  const diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
  });

  if (!diffRecord?.summaryJson) {
    return NextResponse.json({ error: "Diff saknas — kör jämförelse först" }, { status: 404 });
  }

  const summary = JSON.parse(diffRecord.summaryJson) as {
    layerPaths?: { added: string; removed: string; modified: string } | null;
  };

  const storagePath = summary.layerPaths?.[layer as keyof typeof summary.layerPaths];
  if (!storagePath || typeof storagePath !== "string") {
    return NextResponse.json({ error: "Kartlager saknas — kör om jämförelse" }, { status: 404 });
  }

  try {
    const svg = await readStoredFile(storagePath);
    return new NextResponse(new Uint8Array(svg), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Kartlager kunde inte läsas" }, { status: 404 });
  }
}
