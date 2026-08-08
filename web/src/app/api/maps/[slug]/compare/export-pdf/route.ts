import { logAction } from "@/lib/audit";
import { requireSession, requireUpload } from "@/lib/auth/api";
import { buildVersionDiffPdf } from "@/lib/compare/build-diff-pdf";
import { assertVersionViewAccess } from "@/lib/maps/version-lookup";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 120;

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const v1 = searchParams.get("v1");
  const v2 = searchParams.get("v2");

  if (!v1 || !v2) {
    return NextResponse.json({ error: "Ange v1 och v2 (versions-id)" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true },
    }),
  ]);

  if (!versionA || !versionB) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  const deniedA = assertVersionViewAccess(session, versionA);
  if (deniedA) return deniedA;
  const deniedB = assertVersionViewAccess(session, versionB);
  if (deniedB) return deniedB;

  if (versionA.versionNumber >= versionB.versionNumber) {
    return NextResponse.json(
      { error: "v1 måste vara äldre version än v2" },
      { status: 400 },
    );
  }

  const diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
  });

  if (!diffRecord || diffRecord.status !== "OK" || !diffRecord.summaryJson || !diffRecord.changesJson) {
    return NextResponse.json(
      { error: "Diff saknas eller beräknas fortfarande. Öppna jämförelsen på webben först." },
      { status: 409 },
    );
  }

  const summary = JSON.parse(diffRecord.summaryJson) as {
    added: number;
    removed: number;
    modified: number;
  };
  const changes = JSON.parse(diffRecord.changesJson) as OcadObjectChange[];

  const pdf = buildVersionDiffPdf({
    mapTitle: map.title,
    versionANumber: versionA.versionNumber,
    versionBNumber: versionB.versionNumber,
    summary,
    changes,
  });

  await logAction(session.user.id, "DIFF_EXPORT_PDF", "VersionDiff", diffRecord.id, {
    mapSlug: slug,
    v1: versionA.versionNumber,
    v2: versionB.versionNumber,
  });

  const filename = `${map.slug}-v${versionA.versionNumber}-v${versionB.versionNumber}-diff.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
