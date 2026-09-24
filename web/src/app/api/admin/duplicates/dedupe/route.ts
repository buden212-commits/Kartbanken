import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { dedupeMapVersion } from "@/lib/admin/duplicate-scan";
import { logAction } from "@/lib/audit";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canAdmin(session.user.role)) {
    return NextResponse.json({ error: "Endast admin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const versionId =
    body && typeof body === "object" && "versionId" in body
      ? (body as { versionId?: unknown }).versionId
      : undefined;

  if (typeof versionId !== "string" || !versionId.trim()) {
    return NextResponse.json({ error: "versionId krävs" }, { status: 400 });
  }

  try {
    const result = await dedupeMapVersion(versionId.trim(), session.user.id);
    await logAction(session.user.id, "ADMIN_DUPLICATE_DEDUPE", "MapVersion", result.versionId, {
      mapSlug: result.mapSlug,
      versionNumber: result.versionNumber,
      deletedCount: result.deletedCount,
      duplicateGroupCount: result.duplicateGroupCount,
      sourceVersionId: versionId.trim(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deduplicering misslyckades";
    if (message === "VERSION_NOT_FOUND") {
      return NextResponse.json({ error: "Versionen hittades inte" }, { status: 404 });
    }
    if (message === "MAP_ARCHIVED") {
      return NextResponse.json({ error: "Området är arkiverat" }, { status: 400 });
    }
    if (message === "NOT_HEAD_VERSION") {
      return NextResponse.json(
        {
          error:
            "Bara den senaste versionen kan dedupliceras. Välj högsta versionsnumret och skanna igen.",
        },
        { status: 400 },
      );
    }
    if (message === "NO_DUPLICATES") {
      return NextResponse.json({ error: "Inga dubbletter att ta bort" }, { status: 400 });
    }
    if (message === "RESULT_INVALID") {
      return NextResponse.json(
        { error: "Resultatfilen kunde inte valideras efter borttagning" },
        { status: 500 },
      );
    }
    console.error("[admin-duplicate-dedupe]", err);
    return NextResponse.json({ error: "Deduplicering misslyckades" }, { status: 500 });
  }
}
