import { logAction } from "@/lib/audit";
import { requireAdmin, requireSession, requireUpload } from "@/lib/auth/api";
import { deleteMapVersion } from "@/lib/maps/delete-version";
import { setVersionPublished } from "@/lib/maps/publish-version";
import {
  assertVersionViewAccess,
  getMapVersionOr404,
} from "@/lib/maps/version-lookup";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await requireUpload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  let body: { isPublished?: boolean };
  try {
    body = (await request.json()) as { isPublished?: boolean };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (typeof body.isPublished !== "boolean") {
    return NextResponse.json({ error: "Ange isPublished (boolean)" }, { status: 400 });
  }

  const updated = await setVersionPublished(
    lookup.map.id,
    lookup.version.id,
    body.isPublished,
  );

  await logAction(session.user.id, "VERSION_PUBLISH", "MapVersion", updated.id, {
    mapSlug: slug,
    versionNumber: updated.versionNumber,
    isPublished: updated.isPublished,
  });

  return NextResponse.json(updated);
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
    select: {
      id: true,
      versionNumber: true,
      isPublished: true,
      originalFilename: true,
      objectCount: true,
    },
  });

  return NextResponse.json(version);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof NextResponse) return lookup;

  const result = await deleteMapVersion(lookup.version.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logAction(session.user.id, "VERSION_DELETED", "MapVersion", id, {
    mapSlug: slug,
    versionNumber: result.versionNumber,
  });

  return NextResponse.json({ ok: true });
}
