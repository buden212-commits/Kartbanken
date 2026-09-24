import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { scanMapVersionForDuplicates } from "@/lib/admin/duplicate-scan";
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
    const result = await scanMapVersionForDuplicates(versionId.trim());
    await logAction(session.user.id, "ADMIN_DUPLICATE_SCAN", "MapVersion", result.version.id, {
      mapSlug: result.map.slug,
      versionNumber: result.version.versionNumber,
      duplicateGroupCount: result.duplicateGroupCount,
      extraDuplicateCount: result.extraDuplicateCount,
      objectCount: result.objectCount,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "VERSION_NOT_FOUND") {
      return NextResponse.json({ error: "Versionen hittades inte" }, { status: 404 });
    }
    console.error("[admin-duplicate-scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Skanning misslyckades" },
      { status: 500 },
    );
  }
}
