import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { assertSuggestionCreateAccess } from "@/lib/suggestion/access";
import { buildOpenSuggestionsReportPdf } from "@/lib/suggestion/build-report-pdf";
import { SuggestionStatus } from "@/lib/suggestion/types";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const denied = assertSuggestionCreateAccess(session);
  if (denied) return denied;

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const rows = await prisma.mapSuggestion.findMany({
    where: {
      mapFileId: map.id,
      status: { in: [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      createdBy: { select: { name: true, email: true } },
      mapVersion: { select: { id: true, versionNumber: true, previewSvgPath: true } },
      objects: { orderBy: { sortOrder: "asc" } },
    },
  });

  const previewByVersionId = new Map<string, string>();
  for (const row of rows) {
    const versionId = row.mapVersion.id;
    if (previewByVersionId.has(versionId) || !row.mapVersion.previewSvgPath) continue;
    try {
      const buffer = await readStoredFile(row.mapVersion.previewSvgPath);
      previewByVersionId.set(versionId, buffer.toString("utf-8"));
    } catch {
      // skip missing preview
    }
  }

  const suggestions = rows.map((row) => ({
    id: row.id,
    status: row.status,
    category: row.category,
    title: row.title,
    comment: row.comment,
    createdAt: row.createdAt,
    versionNumber: row.mapVersion.versionNumber,
    attachmentPath: row.attachmentPath,
    createdBy: row.createdBy,
    mapVersionId: row.mapVersion.id,
    geometries: row.objects.map((obj) => JSON.parse(obj.geometryJson)),
  }));

  const pdfBuffer = await buildOpenSuggestionsReportPdf({
    mapTitle: map.title,
    suggestions,
    previewByVersionId,
  });

  await logAction(session.user.id, "SUGGESTION_REPORT_EXPORT", "MapFile", map.id, {
    mapSlug: slug,
    count: suggestions.length,
  });

  const safeName = map.title.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "kartforslag";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}-oppna-kartforslag.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
