import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import {
  exportDuplicateScanSubset,
  type DuplicateExportKind,
} from "@/lib/admin/duplicate-scan";
import { logAction } from "@/lib/audit";

export const maxDuration = 300;

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canAdmin(session.user.role)) {
    return NextResponse.json({ error: "Endast admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId")?.trim();
  const kindParam = url.searchParams.get("kind")?.trim();

  if (!versionId) {
    return NextResponse.json({ error: "versionId krävs" }, { status: 400 });
  }
  if (kindParam !== "duplicates" && kindParam !== "uniques") {
    return NextResponse.json(
      { error: "kind måste vara duplicates eller uniques" },
      { status: 400 },
    );
  }
  const kind = kindParam as DuplicateExportKind;

  try {
    const result = await exportDuplicateScanSubset(versionId, kind);
    await logAction(session.user.id, "ADMIN_DUPLICATE_EXPORT", "MapVersion", versionId, {
      mapSlug: result.mapSlug,
      versionNumber: result.versionNumber,
      kind: result.kind,
      objectCount: result.keptObjects,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export misslyckades";
    if (message === "VERSION_NOT_FOUND") {
      return NextResponse.json({ error: "Versionen hittades inte" }, { status: 404 });
    }
    if (message === "NO_DUPLICATES") {
      return NextResponse.json({ error: "Inga dubbletter att exportera" }, { status: 400 });
    }
    if (message === "NO_UNIQUES") {
      return NextResponse.json({ error: "Inga unika objekt att exportera" }, { status: 400 });
    }
    console.error("[admin-duplicate-export]", err);
    return NextResponse.json(
      { error: message.startsWith("Inga") ? message : "Export misslyckades" },
      { status: 500 },
    );
  }
}
